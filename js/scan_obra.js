import { db } from './firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let currentObraId = null;
let allMovements = [];
let productsMap = {}; // { productId: { codigo, descricao, imagem, ... } }
let gruposMap = {}; // { grupoId: nome }
let isPendente = false; // default to Separados (false)

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const obraId = params.get('id');

    if (!obraId) {
        showError('Nenhuma obra especificada.');
        return;
    }
    currentObraId = obraId;

    try {
        // 1. Fetch Obra Details
        const obraDoc = await getDoc(doc(db, 'obras', obraId));
        if (!obraDoc.exists()) {
            showError('Obra não encontrada.');
            return;
        }
        const obraData = obraDoc.data();
        document.getElementById('obra-nome').textContent = obraData.nome || 'Sem Nome';
        document.getElementById('obra-codigo').textContent = obraData.codigo || 'S/C';

        // 1.1 Fetch Grupos
        const gruposSnapshot = await getDocs(collection(db, 'grupos'));
        const grupoSelect = document.getElementById('filter-group');
        gruposSnapshot.forEach(doc => {
            const data = doc.data();
            gruposMap[doc.id] = data.nome;

            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = data.nome;
            grupoSelect.appendChild(option);
        });

        // 2. Fetch All Products (for details)
        const productsSnapshot = await getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true)));
        productsSnapshot.forEach(doc => {
            productsMap[doc.id] = { ...doc.data(), id: doc.id };
        });

        // 3. Fetch Movements for this Obra
        // We need both 'saida' and 'reserva'
        const q = query(collection(db, 'movimentacoes'), where("obraId", "==", obraId));
        const movesSnapshot = await getDocs(q);

        allMovements = [];
        movesSnapshot.forEach(doc => {
            allMovements.push(doc.data());
        });

        // 4. Initial Render
        renderList();

        // 5. Setup Listeners
        setupListeners();

        document.getElementById('loader').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        showError('Erro ao carregar dados: ' + e.message);
    }
});

function setupListeners() {
    // Toggle Switch
    const toggle = document.getElementById('view-toggle');
    toggle.addEventListener('change', (e) => {
        isPendente = e.target.checked;
        updateToggleLabels();
        renderList();
    });

    document.getElementById('toggle-label-separados').addEventListener('click', () => {
        toggle.checked = false;
        isPendente = false;
        updateToggleLabels();
        renderList();
    });

    document.getElementById('toggle-label-pendentes').addEventListener('click', () => {
        toggle.checked = true;
        isPendente = true;
        updateToggleLabels();
        renderList();
    });

    // Search
    document.getElementById('search-input').addEventListener('input', () => {
        renderList();
    });

    // Group Filter
    document.getElementById('filter-group').addEventListener('change', () => {
        renderList();
    });

    // Modal
    const productModal = document.getElementById('product-modal');
    const productModalBackdrop = document.getElementById('product-modal-backdrop');
    const productModalClose = document.getElementById('product-modal-close');

    const closeProductModal = () => productModal.classList.add('hidden');
    productModalClose.addEventListener('click', closeProductModal);
    productModalBackdrop.addEventListener('click', closeProductModal);
}

function updateToggleLabels() {
    const labelSep = document.getElementById('toggle-label-separados');
    const labelPen = document.getElementById('toggle-label-pendentes');
    if (isPendente) {
        labelSep.classList.replace('font-bold', 'font-normal');
        labelSep.classList.replace('opacity-100', 'opacity-60');
        labelPen.classList.replace('font-normal', 'font-bold');
        labelPen.classList.replace('opacity-60', 'opacity-100');
    } else {
        labelPen.classList.replace('font-bold', 'font-normal');
        labelPen.classList.replace('opacity-100', 'opacity-60');
        labelSep.classList.replace('font-normal', 'font-bold');
        labelSep.classList.replace('opacity-60', 'opacity-100');
    }
}

function renderList() {
    const searchTerm = document.getElementById('search-input').value || '';
    const groupFilter = document.getElementById('filter-group').value || '';
    const container = document.getElementById('items-list');
    container.innerHTML = '';

    // Filter movements based on toggle
    // Separados = 'saida'
    // Pendentes = 'reserva'
    const targetType = isPendente ? 'reserva' : 'saida';

    // Group by Product
    const grouped = {};
    allMovements.forEach(m => {
        if (m.tipo !== targetType) return;
        if (!m.productId) return;

        if (!grouped[m.productId]) {
            grouped[m.productId] = {
                qty: 0,
                details: productsMap[m.productId] || { codigo: '???', descricao: 'Produto Desconhecido' }
            };
        }
        grouped[m.productId].qty += (Number(m.quantidade) || 0);
    });

    // Convert to array and filter by search and group
    let items = Object.values(grouped).filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (item.details.codigo || '').toLowerCase().includes(term) ||
                              (item.details.descricao || '').toLowerCase().includes(term);

        let matchesGroup = true;
        if (groupFilter) {
            matchesGroup = item.details.grupoId === groupFilter;
        }

        return matchesSearch && matchesGroup;
    });

    // Sort
    items.sort((a, b) => (a.details.descricao || '').localeCompare(b.details.descricao || ''));

    const totalEl = document.getElementById('total-items');
    totalEl.textContent = items.length;
    // Update total count color based on mode
    totalEl.classList.remove('text-red-600', 'text-green-600');
    totalEl.classList.add(isPendente ? 'text-red-600' : 'text-green-600');

    if (items.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-10">Nenhum item encontrado.</div>';
        return;
    }

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'bg-white rounded-lg shadow p-4 flex flex-col gap-2 border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow';
        el.onclick = () => openProductModal(item.details);

        el.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="bg-gray-200 text-gray-800 text-xs font-bold px-2 py-1 rounded">${item.details.codigo || '-'}</span>
                <span class="text-xs text-gray-500">${item.details.un || 'UN'}</span>
            </div>
            <h3 class="font-bold text-gray-800 text-lg leading-tight">${item.details.descricao || 'Desconhecido'}</h3>
            <div class="flex justify-between items-end mt-2">
                <div>
                     <span class="text-xs text-gray-500 block">Cor</span>
                     <span class="font-medium">${item.details.cor || '-'}</span>
                </div>
                <div class="flex gap-4 text-right">
                     <div>
                        <span class="block text-xs text-gray-500">Qtd</span>
                        <span class="text-2xl font-bold ${isPendente ? 'text-red-600' : 'text-green-600'}">${item.qty}</span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(el);
    });
}

function openProductModal(item) {
    document.getElementById('product-modal-title').textContent = `${item.codigo || ''} - ${item.descricao || ''}`;
    const imgEl = document.getElementById('product-modal-image');
    const placeholderEl = document.getElementById('product-modal-placeholder');
    const descEl = document.getElementById('product-modal-description');

    if (item.imagem) {
        imgEl.src = item.imagem;
        imgEl.classList.remove('hidden');
        placeholderEl.classList.add('hidden');
    } else {
        imgEl.src = '';
        imgEl.classList.add('hidden');
        placeholderEl.classList.remove('hidden');
    }

    descEl.innerHTML = item.descricao_detalhada ? item.descricao_detalhada.replace(/\n/g, '<br>') : 'Sem descrição detalhada.';
    document.getElementById('product-modal').classList.remove('hidden');
}

function showError(msg) {
    if(msg) document.querySelector('#error-screen p').textContent = msg;
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('error-screen').classList.remove('hidden');
}
