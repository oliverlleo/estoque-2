import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, setDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let currentFormat = '50x100';
let configData = { locais: {} };
let availableLocacoes = []; // [{ localId, locacao, code }]

document.addEventListener('DOMContentLoaded', async () => {
    // UI Event Listeners
    document.getElementById('btn-50x100').addEventListener('click', () => setFormat('50x100'));
    document.getElementById('btn-50x25').addEventListener('click', () => setFormat('50x25'));

    const localSelect = document.getElementById('select-local');
    localSelect.addEventListener('change', handleLocalChange);

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
    // 1. Load Locais (Warehouses)
    const locaisSnapshot = await getDocs(collection(db, 'locais'));
    const localSelect = document.getElementById('select-local');
    localSelect.innerHTML = '<option value="">Selecione...</option>';

    locaisSnapshot.forEach(doc => {
        configData.locais[doc.id] = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.data().nome;
        localSelect.appendChild(option);
    });

    // 2. We don't load products yet, wait for selection
}

async function handleLocalChange() {
    const localId = document.getElementById('select-local').value;
    const listContainer = document.getElementById('locacoes-list');
    listContainer.innerHTML = '<div class="p-2">Carregando locações...</div>';

    if (!localId) {
        listContainer.innerHTML = '<div class="p-2 text-gray-500">Selecione um local acima.</div>';
        return;
    }

    // 3. Scan products to find unique locacoes for this Local
    // Optimization: If we had a 'locacoes_enderecos' collection, we would query it.
    // For now, we scan products as per plan.
    const productsSnapshot = await getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true)));

    const uniqueLocacoes = new Set();
    productsSnapshot.forEach(doc => {
        const prod = doc.data();
        if (prod.locacoes) {
            prod.locacoes.forEach(l => {
                if (l.localId === localId && l.locacao) {
                    uniqueLocacoes.add(l.locacao);
                }
            });
        }
    });

    availableLocacoes = Array.from(uniqueLocacoes).sort().map(loc => ({
        localId: localId,
        locacao: loc,
        localName: configData.locais[localId].nome
    }));

    renderLocacoesList();
}

function renderLocacoesList() {
    const listContainer = document.getElementById('locacoes-list');
    listContainer.innerHTML = '';

    if (availableLocacoes.length === 0) {
        listContainer.innerHTML = '<div class="p-2">Nenhuma locação encontrada neste local.</div>';
        return;
    }

    // "Select All" option
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'location-item bg-gray-100 font-bold';
    selectAllDiv.innerHTML = `
        <label class="flex items-center w-full cursor-pointer">
            <input type="checkbox" id="select-all-locs">
            <span>Selecionar Tudo (${availableLocacoes.length})</span>
        </label>
    `;
    listContainer.appendChild(selectAllDiv);

    document.getElementById('select-all-locs').addEventListener('change', (e) => {
        const checkboxes = listContainer.querySelectorAll('.loc-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        renderSelectedLabels();
    });

    availableLocacoes.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'location-item hover:bg-gray-50';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" class="loc-checkbox" value="${index}">
                <span>${item.locacao}</span>
            </label>
        `;
        listContainer.appendChild(div);

        div.querySelector('input').addEventListener('change', renderSelectedLabels);
    });
}

async function renderSelectedLabels() {
    const listContainer = document.getElementById('locacoes-list');
    const checkedBoxes = listContainer.querySelectorAll('.loc-checkbox:checked');
    const container = document.getElementById('etiquetas-container');
    container.innerHTML = '<div class="p-4">Gerando visualização...</div>';

    const selectedItems = [];
    checkedBoxes.forEach(cb => {
        selectedItems.push(availableLocacoes[parseInt(cb.value)]);
    });

    if (selectedItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '';

    // Process Short IDs for selected items
    // We do this in parallel to be fast
    const itemsWithShortIds = await ensureShortIds(selectedItems);

    if (currentFormat === '50x100') {
        for (const item of itemsWithShortIds) {
            renderLabel50x100(item, container);
        }
    } else {
        // 50x25 Pair logic
        for (let i = 0; i < itemsWithShortIds.length; i += 2) {
            const pairDiv = document.createElement('div');
            pairDiv.className = 'etiqueta-50x25-container';

            renderLabel50x25(itemsWithShortIds[i], pairDiv);
            if (itemsWithShortIds[i+1]) {
                renderLabel50x25(itemsWithShortIds[i+1], pairDiv);
            }
            container.appendChild(pairDiv);
        }
    }
}

async function ensureShortIds(items) {
    // Batch checks/creates short IDs
    // Since we don't have a backend API, we use Firestore directly.
    // Logic: Key = `${localId}_${locacaoString}`
    // Check collection 'locacoes_enderecos'. If doc exists, use short_id. Else create.

    const processedItems = [];

    // Process sequentially or chunks to avoid massive concurrent writes if many new ones
    // For "so faz o brach direto", simple parallel is fine but let's be safe with batches if needed.

    const promises = items.map(async (item) => {
        const docId = `${item.localId}_${item.locacao.replace(/[\/\.]/g, '-')}`; // Sanitize ID
        const docRef = doc(db, 'locacoes_enderecos', docId);

        // Optimistic check: we assume most exist if system is running.
        // If not, we create.
        let snapshot;
        try {
            snapshot = await getDoc(docRef);
        } catch (e) {
            console.error("Error fetching location doc", e);
            return { ...item, short_id: 'ERR' };
        }

        if (snapshot.exists()) {
            return { ...item, short_id: snapshot.data().short_id };
        } else {
            // Generate new
            const short_id = generateShortId();
            await setDoc(docRef, {
                localId: item.localId,
                locacao: item.locacao,
                short_id: short_id,
                created_at: new Date()
            });
            return { ...item, short_id: short_id };
        }
    });

    return Promise.all(promises);
}

function generateShortId() {
    // 6 chars alphanumeric
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function renderLabel50x100(item, container) {
    const div = document.createElement('div');
    div.className = 'etiqueta-50x100';

    // URL for QR: scan_location.html?q=SHORT_ID
    const url = `${window.location.origin}/scan_location.html?q=${item.short_id}`;

    div.innerHTML = `
        <div class="qr-area" id="qr-${item.short_id}"></div>
        <div class="text-area">
            <div class="rotated-container">
                <span class="loc-code-large">${item.locacao}</span>
                <span class="loc-name-small">${item.localName}</span>
            </div>
        </div>
    `;
    container.appendChild(div);

    new QRCode(div.querySelector(`#qr-${item.short_id}`), {
        text: url,
        width: 150,
        height: 150,
        correctLevel: QRCode.CorrectLevel.H
    });
}

function renderLabel50x25(item, container) {
    const div = document.createElement('div');
    div.className = 'etiqueta-50x25';

    const url = `${window.location.origin}/scan_location.html?q=${item.short_id}`;
    // Unique ID for QR div
    const qrId = `qr-${item.short_id}-${Math.random().toString(36).substr(2, 9)}`;

    div.innerHTML = `
        <div class="qr-area" id="${qrId}"></div>
        <div class="text-area">
            <div class="rotated-container">
                <span class="loc-code-large">${item.locacao}</span>
                <span class="loc-name-small">${item.localName}</span>
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
