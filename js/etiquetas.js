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

    // Limpa os dados do localStorage depois de usados
    localStorage.removeItem('etiquetasParaImprimir');
});
