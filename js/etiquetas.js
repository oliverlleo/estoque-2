function adjustFontSizeToFit(element) {
    element.style.fontSize = ''; // Reseta para o tamanho padrão do CSS

    // A condição de estouro simples, que agora vai funcionar graças ao CSS rígido
    const isOverflowing = () => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;

    if (isOverflowing()) {
        let currentSize = parseFloat(window.getComputedStyle(element).fontSize);
        while (isOverflowing() && currentSize > 4) {
            currentSize -= 1; // Diminui 1px por vez
            element.style.fontSize = currentSize + 'px';
        }
    }
}

// Função principal que processa todas as etiquetas
function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);

    // Limpa o container antes de adicionar novas etiquetas
    container.innerHTML = '';

    // 1. CRIA TODOS OS ELEMENTOS HTML PRIMEIRO
    produtos.forEach(produto => {
        const pData = produto.data;
        const enderecamento = produto.enderecamento || 'N/A';

        const etiquetaDiv = document.createElement('div');
        etiquetaDiv.className = 'etiqueta';

        etiquetaDiv.innerHTML = `
            <div class="etiqueta-main">
                <div class="qr-code" id="qr-${produto.id}"></div>
                <div class="produto-info">
                    <div class="info-bloco produto">
                        <div class="header">PRODUTO</div>
                        <div class="valor">${pData.descricao || ''}</div>
                    </div>
                    <div class="info-bloco codigo">
                        <div class="header">CÓDIGO</div>
                        <div class="valor">${pData.codigo || ''}</div>
                    </div>
                </div>
            </div>
            <div class="etiqueta-footer">
                LOCAÇÃO: ${enderecamento}
            </div>
        `;
        container.appendChild(etiquetaDiv);

        const url = `${window.location.origin}/detalhe-produto.html?id=${produto.id}`;
        new QRCode(document.getElementById(`qr-${produto.id}`), {
            text: url,
            width: 120,
            height: 120,
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    // 2. PEDE AO NAVEGADOR PARA EXECUTAR O AJUSTE ANTES DA PRÓXIMA RENDERIZAÇÃO
    requestAnimationFrame(() => {
        const elementosParaAjustar = document.querySelectorAll('.info-bloco .valor');
        elementosParaAjustar.forEach(el => {
            adjustFontSizeToFit(el);
        });
    });

    // Limpa o localStorage
    localStorage.removeItem('etiquetasParaImprimir');
}

// Inicia o processo quando a página carregar
document.addEventListener('DOMContentLoaded', processarEtiquetas);
