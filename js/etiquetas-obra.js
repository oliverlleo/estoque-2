import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let currentFormat = '50x100';
let availableObras = []; // [{ id, codigo, nome }]

document.addEventListener('DOMContentLoaded', async () => {
    // UI Event Listeners
    document.getElementById('btn-50x100').addEventListener('click', () => setFormat('50x100'));
    document.getElementById('btn-50x25').addEventListener('click', () => setFormat('50x25'));

    setFormat('50x100');
    await loadData();
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

    // Re-render based on currently selected checkboxes
    renderSelectedLabels();
}

async function loadData() {
    const listContainer = document.getElementById('obras-list');
    listContainer.innerHTML = '<div class="p-2">Carregando obras...</div>';

    try {
        const obrasSnapshot = await getDocs(collection(db, 'obras'));
        availableObras = [];
        obrasSnapshot.forEach(doc => {
            const data = doc.data();
            availableObras.push({
                id: doc.id,
                codigo: data.codigo || 'S/C',
                nome: data.nome || 'Sem Nome'
            });
        });

        // Sort by name
        availableObras.sort((a, b) => a.nome.localeCompare(b.nome));
        renderObrasList();

    } catch (error) {
        console.error("Error loading obras:", error);
        listContainer.innerHTML = '<div class="p-2 text-red-500">Erro ao carregar obras.</div>';
    }
}

function renderObrasList() {
    const listContainer = document.getElementById('obras-list');
    listContainer.innerHTML = '';

    if (availableObras.length === 0) {
        listContainer.innerHTML = '<div class="p-2">Nenhuma obra encontrada.</div>';
        return;
    }

    // "Select All" option
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'location-item bg-gray-100 font-bold';
    selectAllDiv.innerHTML = `
        <label class="flex items-center w-full cursor-pointer">
            <input type="checkbox" id="select-all-obras">
            <span>Selecionar Tudo (${availableObras.length})</span>
        </label>
    `;
    listContainer.appendChild(selectAllDiv);

    document.getElementById('select-all-obras').addEventListener('change', (e) => {
        const checkboxes = listContainer.querySelectorAll('.obra-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        renderSelectedLabels();
    });

    availableObras.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'location-item hover:bg-gray-50';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" class="obra-checkbox" value="${index}">
                <span class="font-bold mr-2">${item.codigo}</span>
                <span>${item.nome}</span>
            </label>
        `;
        listContainer.appendChild(div);

        div.querySelector('input').addEventListener('change', renderSelectedLabels);
    });
}

async function renderSelectedLabels() {
    const listContainer = document.getElementById('obras-list');
    const checkedBoxes = listContainer.querySelectorAll('.obra-checkbox:checked');
    const container = document.getElementById('etiquetas-container');
    container.innerHTML = '<div class="p-4">Gerando visualização...</div>';

    const selectedItems = [];
    checkedBoxes.forEach(cb => {
        selectedItems.push(availableObras[parseInt(cb.value)]);
    });

    if (selectedItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '';

    if (currentFormat === '50x100') {
        for (const item of selectedItems) {
            renderLabel50x100(item, container);
        }
    } else {
        // 50x25 Pair logic
        for (let i = 0; i < selectedItems.length; i += 2) {
            const pairDiv = document.createElement('div');
            pairDiv.className = 'etiqueta-50x25-container';

            renderLabel50x25(selectedItems[i], pairDiv);
            if (selectedItems[i+1]) {
                renderLabel50x25(selectedItems[i+1], pairDiv);
            }
            container.appendChild(pairDiv);
        }
    }
}

function renderLabel50x100(item, container) {
    const div = document.createElement('div');
    div.className = 'etiqueta-50x100';

    // URL for QR: scan_obra.html?id=OBRA_ID
    const url = `${window.location.origin}/scan_obra.html?id=${item.id}`;

    div.innerHTML = `
        <div class="qr-area" id="qr-${item.id}"></div>
        <div class="text-area">
            <div class="rotated-container">
                <span class="loc-code-large">${item.codigo}</span>
                <span class="loc-name-small">${item.nome}</span>
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

    const url = `${window.location.origin}/scan_obra.html?id=${item.id}`;
    // Unique ID for QR div
    const qrId = `qr-${item.id}-${Math.random().toString(36).substr(2, 9)}`;

    div.innerHTML = `
        <div class="qr-area" id="${qrId}"></div>
        <div class="text-area">
            <div class="rotated-container">
                <span class="loc-code-large">${item.codigo}</span>
                <span class="loc-name-small">${item.nome}</span>
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
