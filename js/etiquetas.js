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
                    <div class="produto-descricao">${pData.descricao || ''}</div>
                    <div class="produto-cor">${pData.cor || 'N/A'}</div>
                    <div class="produto-fornecedor">${pData.fornecedorNome || 'N/A'}</div>
                    <div class="produto-codigo">${pData.codigo || ''}</div>
                </div>
            </div>
            <div class="etiqueta-footer">
                ${enderecamento}
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

    // Limpa o localStorage
    localStorage.removeItem('etiquetasParaImprimir');
}

// Inicia o processo quando a página carregar
document.addEventListener('DOMContentLoaded', processarEtiquetas);
