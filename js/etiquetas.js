let currentFormat = '50x100'; // '50x100' or '50x25'

function adjustFontSizeToFit(element) {
    // Reset font size to inherit from CSS to get the baseline
    element.style.fontSize = '';

    const parentWidth = element.clientWidth;
    const scrollWidth = element.scrollWidth;

    if (scrollWidth > parentWidth) {
        const currentSize = parseFloat(window.getComputedStyle(element).fontSize);
        // Calculate the ideal font size directly
        const newSize = Math.floor((currentSize * parentWidth / scrollWidth) * 0.95); // 0.95 buffer

        // Enforce a minimum font size
        element.style.fontSize = Math.max(newSize, 4) + 'px';
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

    // Split the enderecamento string
    const match = enderecamento.match(/([^(]+)\s*(\(.*\))/);
    let locacao = enderecamento;
    let local = '';
    if (match) {
        locacao = match[1].trim();
        local = match[2].trim();
    }

    const subEtiqueta = document.createElement('div');
    subEtiqueta.className = 'etiqueta-50x25';
    subEtiqueta.innerHTML = `
        <div class="etiqueta-main">
            <div class="qr-code"></div>
            <div class="produto-info">
                <div class="descricao-produto">${pData.descricao || ''}</div>
                <div class="detalhe-produto">${pData.cor || 'N/A'}</div>
                <div class="detalhe-produto">${fornecedor}</div>
                <div class="codigo-container">
                   <div class="codigo-produto">${pData.codigo || ''}</div>
                   <div class="locacao-produto">${locacao} ${local}</div>
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

async function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);
    container.innerHTML = '';

    if (currentFormat === '50x100') {
        // For the 50x100, the QR code generation is synchronous enough
        produtos.forEach(produto => render50x100(produto));
        // We still need to adjust fonts here as well
        requestAnimationFrame(() => {
            document.querySelectorAll('.descricao-produto').forEach(el => adjustFontSizeToFit(el));
        });
        return; // Exit here for the 50x100 format
    }

    // --- Logic for 50x25 format ---
    const qrCodePromises = [];
    const elementsToProcess = [];

    for (let i = 0; i < produtos.length; i += 2) {
        const etiquetaPai = document.createElement('div');
        etiquetaPai.className = 'etiqueta-50x25-container';

        const produto1 = produtos[i];
        if (produto1) {
            const { element, qrUrl } = render50x25(produto1, 'left');
            etiquetaPai.appendChild(element);
            elementsToProcess.push(element);
            qrCodePromises.push(generateQrCode(element, qrUrl));
        }

        const produto2 = produtos[i + 1];
        if (produto2) {
            const { element, qrUrl } = render50x25(produto2, 'right');
            etiquetaPai.appendChild(element);
            elementsToProcess.push(element);
            qrCodePromises.push(generateQrCode(element, qrUrl));
        }

        container.appendChild(etiquetaPai);
    }

    // Wait for all QR codes to be rendered
    await Promise.all(qrCodePromises);

    // Now that the layout is stable, adjust font sizes
    requestAnimationFrame(() => {
        elementsToProcess.forEach(element => {
            element.querySelectorAll('.descricao-produto, .codigo-produto, .locacao-produto').forEach(el => {
                adjustFontSizeToFit(el);
            });
        });
    });
}

function generateQrCode(element, url) {
    return new Promise((resolve) => {
        const qrCodeContainer = element.querySelector('.qr-code');
        new QRCode(qrCodeContainer, {
            text: url,
            width: 256,
            height: 256,
            correctLevel: QRCode.CorrectLevel.H,
        });

        // Use a MutationObserver to wait for the <img> to be added
        const observer = new MutationObserver((mutationsList, obs) => {
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const img = qrCodeContainer.querySelector('img');
                    if (img) {
                        obs.disconnect(); // Stop observing
                        resolve();
                        return;
                    }
                }
            }
        });
        observer.observe(qrCodeContainer, { childList: true });
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
