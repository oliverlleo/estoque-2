import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const titleEl = document.getElementById('qr-status-title');
const textEl = document.getElementById('qr-status-text');

function showError(message) {
    titleEl.textContent = 'Etiqueta não encontrada';
    textEl.textContent = message;
}

function getShortCode() {
    const hashCode = decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
    if (hashCode) return hashCode;

    return new URLSearchParams(window.location.search).get('k')?.trim() || '';
}

async function redirectFromShortQr() {
    const code = getShortCode();

    if (!/^[A-Za-z0-9_-]{6,32}$/.test(code)) {
        showError('O código desta etiqueta é inválido.');
        return;
    }

    try {
        const snapshot = await getDoc(doc(db, 'qr_links', code));

        if (!snapshot.exists()) {
            showError('Este código curto não existe no estoque.');
            return;
        }

        const data = snapshot.data();
        if (!data?.productId) {
            showError('Esta etiqueta está sem produto vinculado.');
            return;
        }

        const target = new URL('detalhe-produto.html', window.location.href);
        target.hash = '';
        target.search = '';
        target.searchParams.set('id', data.productId);

        if (data.localId) {
            target.searchParams.set('localId', data.localId);
        }

        if (data.hasLocacaoParam) {
            target.searchParams.set(
                'locId',
                String(data.locacao ?? '') === '' ? '_EMPTY_' : String(data.locacao)
            );
        }

        window.location.replace(target.toString());
    } catch (error) {
        console.error('Erro ao resolver QR curto:', error);
        titleEl.textContent = 'Não foi possível abrir';
        textEl.textContent = 'Falha ao consultar esta etiqueta. Verifique a conexão e tente novamente.';
    }
}

redirectFromShortQr();
