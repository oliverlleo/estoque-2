
function renderLocacao(data) {
    const subEtiqueta = document.createElement('div');
    subEtiqueta.className = 'etiqueta-50x25';

    // data has { localId, localName, locacao }

    subEtiqueta.innerHTML = `
        <div class="qr-code"></div>
        <div class="etiqueta-info">
            <div class="rotated-content">
                <div class="locacao-numero">${data.locacao || '-'}</div>
                <div class="local-nome">${data.localName || ''}</div>
            </div>
        </div>
    `;

    // URL to ver-local.html
    const url = `${window.location.origin}/ver-local.html?localId=${data.localId}&locacao=${encodeURIComponent(data.locacao)}`;

    return { element: subEtiqueta, qrUrl: url };
}

function generateQrCode(element, url) {
    return new Promise((resolve) => {
        const qrCodeContainer = element.querySelector('.qr-code');
        // Clear previous content just in case
        qrCodeContainer.innerHTML = '';

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

        // Fallback in case observer fails or runs too fast (unlikely but safe)
        setTimeout(() => {
            observer.disconnect();
            resolve();
        }, 500);
    });
}

async function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasLocacaoParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado.</p>';
        return;
    }

    let locacoes;
    try {
        locacoes = JSON.parse(dadosJSON);
    } catch (e) {
        console.error("Erro ao ler JSON", e);
        container.innerHTML = '<p>Erro nos dados da etiqueta.</p>';
        return;
    }

    container.innerHTML = '';

    const qrCodePromises = [];

    // Process in pairs for 50x25 layout
    for (let i = 0; i < locacoes.length; i += 2) {
        const etiquetaPai = document.createElement('div');
        etiquetaPai.className = 'etiqueta-50x25-container';

        const loc1 = locacoes[i];
        if (loc1) {
            const { element, qrUrl } = renderLocacao(loc1);
            etiquetaPai.appendChild(element);
            qrCodePromises.push(generateQrCode(element, qrUrl));
        }

        const loc2 = locacoes[i + 1];
        if (loc2) {
            const { element, qrUrl } = renderLocacao(loc2);
            etiquetaPai.appendChild(element);
            qrCodePromises.push(generateQrCode(element, qrUrl));
        }

        container.appendChild(etiquetaPai);
    }

    await Promise.all(qrCodePromises);
}

document.addEventListener('DOMContentLoaded', () => {
    processarEtiquetas();
});
