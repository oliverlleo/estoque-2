// Função de ajuste de fonte robusta
function adjustFontSizeToFit(element) {
    // Reseta qualquer estilo inline para garantir que começamos do zero
    element.style.fontSize = '';
    element.style.lineHeight = '';

    const style = window.getComputedStyle(element);
    let fontSize = parseFloat(style.fontSize);

    // Uma proporção razoável para a altura da linha baseada no tamanho da fonte
    const lineHeightRatio = 1.2;

    const isOverflowing = () => {
        // Adicionamos uma tolerância de 1px para evitar problemas de arredondamento do navegador
        const tolerance = 1;
        return element.scrollHeight > (element.clientHeight + tolerance) || element.scrollWidth > (element.clientWidth + tolerance);
    }

    // Loop para ajustar o tamanho
    while (isOverflowing() && fontSize > 1) {
        fontSize -= 0.5;
        element.style.fontSize = `${fontSize}px`;
        // Ajusta a altura da linha para ser um pouco maior que a fonte
        element.style.lineHeight = `${fontSize * lineHeightRatio}px`;
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
                    <div class="info-bloco codigo-padrao">
                        <div class="header">C. PADRÃO</div>
                        <div class="valor">${pData.codigo_global || ''}</div>
                    </div>
                </div>
            </div>
            <div class="etiqueta-footer">
                ENDEREÇAMENTO: ${enderecamento}
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
