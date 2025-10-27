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
    const is50x25 = container.classList.contains('formato-50x25');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);

    // Limpa o container antes de adicionar novas etiquetas
    container.innerHTML = '';

    const qrCodeSize = is50x25 ? 60 : 120; // Tamanho do QR code baseado no formato

    for (let i = 0; i < produtos.length; i++) {
        const produto = produtos[i];
        const pData = produto.data;
        const fornecedor = produto.fornecedor || 'N/A';
        const enderecamento = produto.enderecamento || 'N/A';

        const createEtiquetaHTML = (prod, idSuffix) => `
            <div class="etiqueta">
                <div class="etiqueta-main">
                    <div class="qr-code" id="qr-${prod.labelId}-${idSuffix}"></div>
                    <div class="produto-info">
                        <div class="descricao-produto">${pData.descricao || ''}</div>
                        <div class="detalhe-produto">${pData.cor || 'N/A'}</div>
                        <div class="detalhe-produto">${fornecedor}</div>
                        <div class="codigo-container">
                           <div class="codigo-produto">${pData.codigo || ''}</div>
                        </div>
                    </div>
                </div>
                <div class="etiqueta-footer">${enderecamento}</div>
            </div>
        `;

        const containerDiv = document.createElement('div');
        containerDiv.className = 'etiqueta-container';

        if (is50x25) {
            // Cria duas etiquetas lado a lado
            containerDiv.innerHTML = createEtiquetaHTML(produto, 'a') + createEtiquetaHTML(produto, 'b');
            container.appendChild(containerDiv);

            let url = `${window.location.origin}/detalhe-produto.html?id=${produto.productId}`;
            if (produto.locacaoId) url += `&locId=${produto.locacaoId}`;

            new QRCode(document.getElementById(`qr-${produto.labelId}-a`), { text: url, width: qrCodeSize, height: qrCodeSize, correctLevel: QRCode.CorrectLevel.H });
            new QRCode(document.getElementById(`qr-${produto.labelId}-b`), { text: url, width: qrCodeSize, height: qrCodeSize, correctLevel: QRCode.CorrectLevel.H });

        } else {
            // Cria uma etiqueta única
            containerDiv.innerHTML = createEtiquetaHTML(produto, 'a');
            container.appendChild(containerDiv);

            let url = `${window.location.origin}/detalhe-produto.html?id=${produto.productId}`;
            if (produto.locacaoId) url += `&locId=${produto.locacaoId}`;

            new QRCode(document.getElementById(`qr-${produto.labelId}-a`), { text: url, width: qrCodeSize, height: qrCodeSize, correctLevel: QRCode.CorrectLevel.H });
        }
    }

    // 2. PEDE AO NAVEGADOR PARA EXECUTAR O AJUSTE ANTES DA PRÓXIMA RENDERIZAÇÃO
    requestAnimationFrame(() => {
        const elementosParaAjustar = document.querySelectorAll('.descricao-produto');
        elementosParaAjustar.forEach(el => {
            adjustFontSizeToFit(el);
        });
    });

}

// Inicia o processo quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    const btn100x50 = document.getElementById('btn-formato-100x50');
    const btn50x25 = document.getElementById('btn-formato-50x25');
    const container = document.getElementById('etiquetas-container');

    btn100x50.addEventListener('click', () => {
        container.classList.remove('formato-50x25');
        btn100x50.classList.add('active');
        btn50x25.classList.remove('active');
        processarEtiquetas(); // Re-renderiza as etiquetas
    });

    btn50x25.addEventListener('click', () => {
        container.classList.add('formato-50x25');
        btn50x25.classList.add('active');
        btn100x50.classList.remove('active');
        processarEtiquetas(); // Re-renderiza as etiquetas
    });

    processarEtiquetas(); // Carga inicial
});
