// CONTEÚDO COMPLETO PARA O ARQUIVO js/etiquetas.js

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
        container.innerHTML = ''; // Limpa o container antes de adicionar novas etiquetas

        produtos.forEach(produto => {
            if (!produto || !produto.data) {
                console.warn('Um produto na lista de etiquetas está malformado e será ignorado:', produto);
                return; // Pula para o próximo produto
            }

            const pData = produto.data;
            const enderecamento = produto.enderecamento || 'N/A';

            const etiquetaDiv = document.createElement('div');
            etiquetaDiv.className = 'etiqueta';

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

        // Limpa o localStorage APÓS a renderização bem-sucedida
        localStorage.removeItem('etiquetasParaImprimir');

    } catch (error) {
        console.error('UM ERRO FATAL OCORREU AO PROCESSAR AS ETIQUETAS:', error);
        const container = document.getElementById('etiquetas-container');
        if (container) {
            container.innerHTML = `<p style="color: red; font-weight: bold;">Ocorreu um erro grave. Verifique o console do navegador (F12) para detalhes técnicos.</p>`;
        }
    }
}

// Inicia o processo quando a página carregar
document.addEventListener('DOMContentLoaded', processarEtiquetas);
