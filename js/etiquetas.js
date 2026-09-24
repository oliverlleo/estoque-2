import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const shortQrCache = new Map();
let shortQrWarningShown = false;

function buildLegacyQrUrl(produto) {
    const urlParams = new URLSearchParams({ id: produto.productId });
    if (produto.localId) {
        urlParams.set('localId', produto.localId);
    }
    if (Object.prototype.hasOwnProperty.call(produto, 'locacaoId')) {
        urlParams.set('locId', produto.locacaoId === '' ? '_EMPTY_' : produto.locacaoId);
    }
    return `${window.location.origin}/detalhe-produto.html?${urlParams.toString()}`;
}

function buildQrOriginKey(produto) {
    const hasLocacao = Object.prototype.hasOwnProperty.call(produto, 'locacaoId');
    return [
        produto.productId || '',
        produto.localId || '',
        hasLocacao ? String(produto.locacaoId ?? '') : '__NO_LOCACAO_PARAM__'
    ].join('|');
}

async function createShortCode(originKey, bytesCount = 4) {
    const bytes = new TextEncoder().encode(originKey);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const selected = digest.slice(0, bytesCount);
    const binary = Array.from(selected, byte => String.fromCharCode(byte)).join('');
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function sameQrTarget(data, produto) {
    const hasLocacao = Object.prototype.hasOwnProperty.call(produto, 'locacaoId');
    return data?.productId === (produto.productId || '') &&
        (data?.localId || '') === (produto.localId || '') &&
        Boolean(data?.hasLocacaoParam) === hasLocacao &&
        String(data?.locacao ?? '') === (hasLocacao ? String(produto.locacaoId ?? '') : '');
}

async function ensureShortQrMapping(produto) {
    const originKey = buildQrOriginKey(produto);
    if (shortQrCache.has(originKey)) return shortQrCache.get(originKey);

    let code = await createShortCode(originKey, 4);
    let qrRef = doc(db, 'qr_links', code);
    let snapshot = await getDoc(qrRef);

    if (snapshot.exists() && !sameQrTarget(snapshot.data(), produto)) {
        code = await createShortCode(originKey, 6);
        qrRef = doc(db, 'qr_links', code);
        snapshot = await getDoc(qrRef);

        if (snapshot.exists() && !sameQrTarget(snapshot.data(), produto)) {
            code = await createShortCode(originKey, 10);
            qrRef = doc(db, 'qr_links', code);
            snapshot = await getDoc(qrRef);

            if (snapshot.exists() && !sameQrTarget(snapshot.data(), produto)) {
                throw new Error('Colisão de código curto detectada.');
            }
        }
    }

    if (!snapshot.exists()) {
        const hasLocacao = Object.prototype.hasOwnProperty.call(produto, 'locacaoId');
        await setDoc(qrRef, {
            productId: produto.productId || '',
            localId: produto.localId || '',
            locacao: hasLocacao ? String(produto.locacaoId ?? '') : '',
            hasLocacaoParam: hasLocacao,
            createdAt: serverTimestamp()
        });
    }

    const shortUrl = `${window.location.origin}#${code}`;
    shortQrCache.set(originKey, shortUrl);
    return shortUrl;
}

async function getQrUrl(produto) {
    try {
        return await ensureShortQrMapping(produto);
    } catch (error) {
        console.error('Falha ao criar QR curto; usando URL completa como fallback.', error);
        if (!shortQrWarningShown) {
            shortQrWarningShown = true;
            alert('Não foi possível criar o código curto no Firebase. As etiquetas continuarão funcionando, mas usarão o QR antigo nesta impressão.');
        }
        return buildLegacyQrUrl(produto);
    }
}

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

    new QRCode(document.getElementById(`qr-${produto.labelId}`), {
        text: produto.qrUrl,
        width: 120,
        height: 120,
        correctLevel: QRCode.CorrectLevel.L
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

    return { element: subEtiqueta, qrId: `qr-${labelId}`, qrUrl: produto.qrUrl };
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

    const produtosComQr = await Promise.all(
        produtos.map(async produto => ({
            ...produto,
            qrUrl: await getQrUrl(produto)
        }))
    );

    if (currentFormat === '50x100') {
        produtosComQr.forEach(produto => render50x100(produto));
        // We still need to adjust fonts here as well
        requestAnimationFrame(() => {
            document.querySelectorAll('.descricao-produto').forEach(el => adjustFontSizeToFit(el));
        });
        return; // Exit here for the 50x100 format
    }

    // --- Logic for 50x25 format ---
    const qrCodePromises = [];
    const elementsToProcess = [];

    for (let i = 0; i < produtosComQr.length; i += 2) {
        const etiquetaPai = document.createElement('div');
        etiquetaPai.className = 'etiqueta-50x25-container';

        const produto1 = produtosComQr[i];
        if (produto1) {
            const { element, qrUrl } = render50x25(produto1, 'left');
            etiquetaPai.appendChild(element);
            elementsToProcess.push(element);
            qrCodePromises.push(generateQrCode(element, qrUrl));
        }

        const produto2 = produtosComQr[i + 1];
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
            correctLevel: QRCode.CorrectLevel.L,
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
