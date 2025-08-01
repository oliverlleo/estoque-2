document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);

    produtos.forEach(produto => {
        const pData = produto.data;
        const enderecamento = produto.enderecamento || 'N/A';

        // Cria o elemento da etiqueta
        const etiquetaDiv = document.createElement('div');
        etiquetaDiv.className = 'etiqueta';

        // Monta o HTML interno da etiqueta
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

        // Adiciona a etiqueta ao container
        container.appendChild(etiquetaDiv);

        // Gera o QR Code no seu respectivo container
        const url = `${window.location.origin}/detalhe-produto.html?id=${produto.id}`;
        new QRCode(document.getElementById(`qr-${produto.id}`), {
            text: url,
            width: 120,
            height: 120,
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    // ---- INÍCIO DO NOVO BLOCO DE CÓDIGO ----
    // Pega todos os elementos de valor que precisam de ajuste
    const elementosParaAjustar = document.querySelectorAll('.info-bloco .valor');

    // Aplica a função de ajuste para cada um deles
    elementosParaAjustar.forEach(el => {
        adjustFontSizeToFit(el);
    });
    // ---- FIM DO NOVO BLOCO DE CÓDIGO ----

    // Limpa os dados do localStorage depois de usados
    localStorage.removeItem('etiquetasParaImprimir');
});

function adjustFontSizeToFit(element) {
    // Pega o estilo computado para ter o valor real da fonte em pixels
    const style = window.getComputedStyle(element);
    let fontSize = parseFloat(style.fontSize);

    // Define um tamanho mínimo para evitar que o texto desapareça
    const minFontSize = 8;

    // Enquanto a largura do conteúdo for maior que a largura do elemento
    while (element.scrollWidth > element.clientWidth && fontSize > minFontSize) {
        fontSize--; // Diminui o tamanho da fonte
        element.style.fontSize = `${fontSize}px`;
    }
}
