let currentFormat = '50x100'; // '50x100' or '50x25'

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

function render50x100(produto) {
    const pData = produto.data;
    const fornecedor = produto.fornecedor || 'N/A';
    const enderecamento = produto.enderecamento || 'N/A';

    const etiquetaDiv = document.createElement('div');
    etiquetaDiv.className = 'etiqueta-50x100';

    etiquetaDiv.innerHTML = `
        <div class="etiqueta-main">
            <div class="qr-code" id="qr-${produto.labelId}"></div>
            <div class="produto-info">
                <div class="descricao-produto">${pData.descricao || ''}</div>
                <div class="detalhe-produto">${pData.cor || 'N/A'}</div>
                <div class="detalhe-produto">${fornecedor}</div>
                <div class="codigo-container">
                   <div class="codigo-produto">${pData.codigo || ''}</div>
                </div>
            </div>
        </div>
        <div class="etiqueta-footer">
            ${enderecamento}
        </div>
    `;

    document.getElementById('etiquetas-container').appendChild(etiquetaDiv);

    let url = `${window.location.origin}/detalhe-produto.html?id=${produto.productId}`;
    if (produto.locacaoId) {
        url += `&locId=${produto.locacaoId}`;
    }
    new QRCode(document.getElementById(`qr-${produto.labelId}`), {
        text: url,
        width: 120,
        height: 120,
        correctLevel: QRCode.CorrectLevel.H
    });
}

function render50x25(produto, side) {
    const pData = produto.data;
    const fornecedor = produto.fornecedor || 'N/A';
    const enderecamento = produto.enderecamento || 'N/A';
    const labelId = `${produto.labelId}-${side}`;

    const subEtiqueta = document.createElement('div');
    subEtiqueta.className = 'etiqueta-50x25';
    subEtiqueta.innerHTML = `
        <div class="etiqueta-main">
            <div class="qr-code" id="qr-${labelId}"></div>
            <div class="produto-info">
                <div class="descricao-produto">${pData.descricao || ''}</div>
                <div class="detalhe-produto">${pData.cor || 'N/A'}</div>
                <div class="detalhe-produto">${fornecedor}</div>
                <div class="codigo-container">
                   <div class="codigo-produto">${pData.codigo || ''}</div>
                   <div class="enderecamento-produto">${enderecamento}</div>
                </div>
            </div>
        </div>
    `;

    let url = `${window.location.origin}/detalhe-produto.html?id=${produto.productId}`;
    if (produto.locacaoId) {
        url += `&locId=${produto.locacaoId}`;
    }

    return { element: subEtiqueta, qrId: `qr-${labelId}`, qrUrl: url };
}

function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);
    container.innerHTML = '';

    if (currentFormat === '50x100') {
        produtos.forEach(produto => render50x100(produto));
    } else if (currentFormat === '50x25') {
        const qrCodeJobs = [];
        for (let i = 0; i < produtos.length; i += 2) {
            const etiquetaPai = document.createElement('div');
            etiquetaPai.className = 'etiqueta-50x25-container';

            const leftData = render50x25(produtos[i], 'left');
            etiquetaPai.appendChild(leftData.element);
            qrCodeJobs.push({ id: leftData.qrId, url: leftData.qrUrl, size: 256 });

            if (i + 1 < produtos.length) {
                const rightData = render50x25(produtos[i + 1], 'right');
                etiquetaPai.appendChild(rightData.element);
                qrCodeJobs.push({ id: rightData.qrId, url: rightData.qrUrl, size: 256 });
            }
            container.appendChild(etiquetaPai);
        }

        qrCodeJobs.forEach(job => {
            new QRCode(document.getElementById(job.id), {
                text: job.url, width: job.size, height: job.size, correctLevel: QRCode.CorrectLevel.H
            });
        });
    }

    requestAnimationFrame(() => {
        document.querySelectorAll('.descricao-produto').forEach(el => adjustFontSizeToFit(el));
    });
}

function setFormat(format) {
    currentFormat = format;
    document.body.className = `format-${format}`;
    document.getElementById('btn-50x100').classList.toggle('active', format === '50x100');
    document.getElementById('btn-50x25').classList.toggle('active', format === '50x25');

    // Remove a folha de estilo de impressão dinâmica, se existir
    const dynamicStyle = document.getElementById('dynamic-print-style');
    if (dynamicStyle) {
        dynamicStyle.remove();
    }

    // Adiciona a folha de estilo de impressão correta para o formato 50x25
    if (format === '50x25') {
        const style = document.createElement('style');
        style.id = 'dynamic-print-style';
        style.innerHTML = `@media print { @page { size: 106mm 25mm; margin: 0; } }`;
        document.head.appendChild(style);
    }

    processarEtiquetas();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-50x100').addEventListener('click', () => setFormat('50x100'));
    document.getElementById('btn-50x25').addEventListener('click', () => setFormat('50x25'));
    setFormat(currentFormat); // Initialize with default format
});
