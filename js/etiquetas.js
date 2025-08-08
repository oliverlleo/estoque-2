// SUBSTITUA TODO O CONTEÚDO DE js/etiquetas.js POR ISTO:

/**
 * LÓGICA ORIGINAL:
 * Esta função ajusta o tamanho da fonte de um elemento para que seu conteúdo não seja cortado.
 */
function adjustFontSizeToFit(element) {
    element.style.fontSize = '';

    const isOverflowing = () => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;

    if (isOverflowing()) {
        let currentSize = parseFloat(window.getComputedStyle(element).fontSize);
        while (isOverflowing() && currentSize > 4) {
            currentSize -= 1;
            element.style.fontSize = currentSize + 'px';
        }
    }
}

/**
 * Função principal que usa a ESTRUTURA DO NOVO DESIGN e aplica a LÓGICA ORIGINAL.
 */
function processarEtiquetas() {
    try {
        const container = document.getElementById('etiquetas-container');
        if (!container) {
            console.error('Erro Crítico: O contêiner de etiquetas #etiquetas-container não foi encontrado no HTML.');
            return;
        }

        const dadosJSON = localStorage.getItem('etiquetasParaImprimir');
        if (!dadosJSON) {
            container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
            return;
        }

        const produtos = JSON.parse(dadosJSON);
        container.innerHTML = '';

        // CRIA AS ETIQUETAS COM O NOVO DESIGN
        produtos.forEach(produto => {
            if (!produto || !produto.data) {
                console.warn('Um produto na lista de etiquetas está malformado e será ignorado:', produto);
                return;
            }

            const pData = produto.data;
            const enderecamento = produto.enderecamento || 'N/A';

            const etiquetaDiv = document.createElement('div');
            etiquetaDiv.className = 'etiqueta';

            // Estrutura HTML do novo design
            etiquetaDiv.innerHTML = `
                <div class="etiqueta-corpo">
                    <div class="qr-code-container" id="qr-${produto.id}"></div>
                    <div class="info-container">
                        <div class="info-descricao">${pData.descricao || 'Sem Descrição'}</div>
                        <div class="info-cor">${pData.cor || 'Sem Cor'}</div>
                        <div class="info-codigo">${pData.codigo || 'Sem Código'}</div>
                    </div>
                </div>
                <div class="etiqueta-rodape">
                    ${enderecamento}
                </div>
            `;
            container.appendChild(etiquetaDiv);

            const qrElement = document.getElementById(`qr-${produto.id}`);
            if (qrElement) {
                const url = `${window.location.origin}/detalhe-produto.html?id=${produto.id}`;
                new QRCode(qrElement, {
                    text: url,
                    width: 140,
                    height: 140,
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        });

        // APLICA A LÓGICA ORIGINAL DE AJUSTE DE TEXTO
        requestAnimationFrame(() => {
            const elementosParaAjustar = document.querySelectorAll('.info-descricao');
            elementosParaAjustar.forEach(el => {
                adjustFontSizeToFit(el);
            });
        });

        localStorage.removeItem('etiquetasParaImprimir');

    } catch (error) {
        console.error('ERRO AO PROCESSAR AS ETIQUETAS:', error);
        const container = document.getElementById('etiquetas-container');
        if (container) {
            container.innerHTML = `<p style="color: red; font-weight: bold;">Ocorreu um erro. Verifique o console (F12).</p>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', processarEtiquetas);
