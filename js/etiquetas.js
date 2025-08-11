// CONTEÚDO FINAL E CORRETO PARA O ARQUIVO js/etiquetas.js

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

function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);
    container.innerHTML = '';

    produtos.forEach(produto => {
        const pData = produto.data;
        const enderecamento = produto.enderecamento || 'N/A';

        const etiquetaDiv = document.createElement('div');
        etiquetaDiv.className = 'etiqueta';

        etiquetaDiv.innerHTML = `
            <div class="etiqueta-corpo">
                <div class="qr-code-container" id="qr-${produto.id}"></div>
                <div class="info-container">
                    <div class="info-descricao">${pData.descricao || ''}</div>
                    <div class="info-cor">${pData.cor || ''}</div>
                    <div class="info-codigo">${pData.codigo || ''}</div>
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
            width: 140,
            height: 140,
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    requestAnimationFrame(() => {
        const elementosParaAjustar = document.querySelectorAll('.info-descricao');
        elementosParaAjustar.forEach(el => {
            adjustFontSizeToFit(el);
        });
    });

    localStorage.removeItem('etiquetasParaImprimir');
}

document.addEventListener('DOMContentLoaded', processarEtiquetas);
