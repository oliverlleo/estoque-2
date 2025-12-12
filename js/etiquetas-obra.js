import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let currentFormat = '50x100';
let availableObras = [];

document.addEventListener('DOMContentLoaded', async () => {
    // UI Event Listeners
    document.getElementById('btn-50x100').addEventListener('click', () => setFormat('50x100'));
    document.getElementById('btn-50x25').addEventListener('click', () => setFormat('50x25'));

    const obraSelect = document.getElementById('select-obra');
    obraSelect.addEventListener('change', handleObraChange);

    setFormat('50x100');

    // Check if there is an obra pre-selected via URL
    const params = new URLSearchParams(window.location.search);
    const preSelectedObraId = params.get('obraId');

    await loadData(preSelectedObraId);
});

function setFormat(format) {
    currentFormat = format;
    document.body.className = `format-${format}`;
    document.getElementById('btn-50x100').classList.toggle('active', format === '50x100');
    document.getElementById('btn-50x25').classList.toggle('active', format === '50x25');

    const dynamicStyle = document.getElementById('dynamic-print-style');
    if (dynamicStyle) dynamicStyle.remove();

    if (format === '50x25') {
        const style = document.createElement('style');
        style.id = 'dynamic-print-style';
        style.innerHTML = `@media print { @page { size: 106mm 25mm; margin: 0; } }`;
        document.head.appendChild(style);
    }

    // Re-render based on currently selected obra
    const obraSelect = document.getElementById('select-obra');
    if(obraSelect.value) {
        handleObraChange();
    }
}

async function loadData(preSelectedId) {
    // 1. Load Obras
    const obrasSnapshot = await getDocs(collection(db, 'obras'));
    const obraSelect = document.getElementById('select-obra');
    obraSelect.innerHTML = '<option value="">Selecione...</option>';

    availableObras = [];
    obrasSnapshot.forEach(doc => {
        const data = doc.data();
        availableObras.push({ id: doc.id, ...data });
    });

    // Sort alphabetically
    availableObras.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    availableObras.forEach(obra => {
        const option = document.createElement('option');
        option.value = obra.id;
        option.textContent = obra.nome;
        if(preSelectedId && obra.id === preSelectedId) {
            option.selected = true;
        }
        obraSelect.appendChild(option);
    });

    if(preSelectedId) {
        handleObraChange();
    }
}

async function handleObraChange() {
    const obraId = document.getElementById('select-obra').value;
    const container = document.getElementById('etiquetas-container');
    container.innerHTML = '<div class="p-4">Gerando visualização...</div>';

    if (!obraId) {
        container.innerHTML = '';
        return;
    }

    const selectedObra = availableObras.find(o => o.id === obraId);
    if (!selectedObra) {
        container.innerHTML = '<div class="p-4 text-red-500">Erro: Obra não encontrada.</div>';
        return;
    }

    container.innerHTML = '';

    // Render Logic
    if (currentFormat === '50x100') {
        renderLabel50x100(selectedObra, container);
    } else {
        // 50x25 Pair logic - user selects ONE obra, but might want 2 copies side-by-side or just one?
        // In location labels, we printed a list. Here we select one.
        // Usually 50x25 implies printing two small labels.
        // I'll render a pair of the SAME obra label to fill the row, as that is likely the intent if choosing this paper format.
        const pairDiv = document.createElement('div');
        pairDiv.className = 'etiqueta-50x25-container';
        renderLabel50x25(selectedObra, pairDiv);
        renderLabel50x25(selectedObra, pairDiv); // Duplicate to fill row
        container.appendChild(pairDiv);
    }
}

function renderLabel50x100(item, container) {
    const div = document.createElement('div');
    div.className = 'etiqueta-50x100';

    // URL for QR: scan_project.html?id=OBRA_ID
    const url = `${window.location.origin}/scan_project.html?id=${item.id}`;

    div.innerHTML = `
        <div class="qr-area" id="qr-${item.id}"></div>
        <div class="text-area">
            <div class="rotated-container">
                <span class="loc-code-large" style="font-size: 24pt;">${item.nome}</span>
                <span class="loc-name-small">PROJETO / OBRA</span>
            </div>
        </div>
    `;
    container.appendChild(div);

    new QRCode(div.querySelector(`#qr-${item.id}`), {
        text: url,
        width: 150,
        height: 150,
        correctLevel: QRCode.CorrectLevel.H
    });
}

function renderLabel50x25(item, container) {
    const div = document.createElement('div');
    div.className = 'etiqueta-50x25';

    const url = `${window.location.origin}/scan_project.html?id=${item.id}`;
    // Unique ID for QR div
    const qrId = `qr-${item.id}-${Math.random().toString(36).substr(2, 9)}`;

    div.innerHTML = `
        <div class="qr-area" id="${qrId}"></div>
        <div class="text-area">
            <div class="rotated-container">
                <span class="loc-code-large" style="font-size: 12pt;">${item.nome}</span>
                <span class="loc-name-small" style="font-size: 7pt;">PROJETO</span>
            </div>
        </div>
    `;
    container.appendChild(div);

    new QRCode(document.getElementById(qrId), {
        text: url,
        width: 80,
        height: 80,
        correctLevel: QRCode.CorrectLevel.Q
    });
}
