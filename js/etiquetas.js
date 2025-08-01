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
                    <p>CÓDIGO: ${pData.codigo || ''}</p>
                    <p>C. PADRÃO: ${pData.codigo_global || ''}</p>
                    <div class="divider"></div>
                    <p>PRODUTO:</p>
                    <p class="descricao">${pData.descricao || ''}</p>
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
