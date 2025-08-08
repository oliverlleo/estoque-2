document.addEventListener('DOMContentLoaded', () => {
    processarEtiquetas();

    // Adiciona o listener para o botão de impressão
    const printButton = document.getElementById('print-button');
    if(printButton) {
        printButton.addEventListener('click', () => {
            window.print();
        });
    }
});

function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const produtos = JSON.parse(localStorage.getItem('produtosParaEtiquetas'));
    container.innerHTML = ''; // Limpar antes de adicionar

    if (!produtos || produtos.length === 0) {
        container.innerHTML = '<p>Nenhum produto selecionado para gerar etiquetas.</p>';
        return;
    }

    produtos.forEach(produto => {
        const pData = produto.data;
        const enderecamento = produto.enderecamento || 'N/A';

        const etiquetaDiv = document.createElement('div');
        etiquetaDiv.className = 'etiqueta';

        // SUBSTITUA O INNERHTML ANTIGO POR ESTE NOVO:
        etiquetaDiv.innerHTML = `
            <div class="etiqueta-corpo">
                <div class="qr-code-container" id="qr-${produto.id}"></div>
                <div class="info-container">
                    <div class="info-descricao">${pData.descricao || ''}</div>
                    <div class="info-cor">${pData.cor || ''}</div>
                    <div class="info-codigo">${pData.codigo || ''}</div>
                </div>
            </div>
            <div class="etiqueta-rodape">
                ${enderecamento}
            </div>
        `;
        container.appendChild(etiquetaDiv);

        const url = `${window.location.origin}/detalhe-produto.html?id=${produto.id}`;
        new QRCode(document.getElementById(`qr-${produto.id}`), {
            text: url,
            width: 140, // Aumentado para melhor leitura
            height: 140,
            correctLevel: QRCode.CorrectLevel.H
        });
    });
}
