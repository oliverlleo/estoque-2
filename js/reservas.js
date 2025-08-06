import { db } from './firebase-config.js';
import { collection, query, where, onSnapshot, doc, runTransaction, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Reservas carregada.");

    // --- DOM Elements ---
    const tableBody = document.querySelector('#table-reservas tbody');
    const filterCodigo = document.getElementById('filter-codigo');
    const filterDescricao = document.getElementById('filter-descricao');
    const filterStatus = document.getElementById('filter-status');

    // --- Data Stores ---
    let productsMap = {};
    let obrasMap = {};
    let allReservas = [];

    // --- Initial Data Loading ---
    async function loadInitialData() {
        // Load products
        const productsSnapshot = await getDocs(collection(db, 'produtos'));
        productsMap = {};
        productsSnapshot.forEach(doc => {
            productsMap[doc.id] = { id: doc.id, ...doc.data() };
        });

        // Load Obras
        const obrasSnapshot = await getDocs(collection(db, 'obras'));
        obrasMap = {};
        obrasSnapshot.forEach(doc => {
            obrasMap[doc.id] = doc.data();
        });
    }

    // --- Real-time Data Loading for Reservations ---
    function loadReservas() {
        const q = query(collection(db, "movimentacoes"), where("tipo", "in", ["reserva", "saida_confirmada", "reserva_cancelada"]));

        onSnapshot(q, (snapshot) => {
            allReservas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTable(allReservas);
        });
    }

    // --- Render Table ---
    function renderTable(data) {
        tableBody.innerHTML = '';
        if (!data) return;

        data.sort((a, b) => (b.data?.toMillis() || 0) - (a.data?.toMillis() || 0));

        data.forEach(reserva => {
            const product = productsMap[reserva.produtoId] || {};
            const obra = obrasMap[reserva.obraId] || {};
            const row = document.createElement('tr');

            const statusMap = {
                reserva: { text: 'Reserva', class: 'status-reserva' },
                saida_confirmada: { text: 'Confirmada', class: 'status-confirmado' },
                reserva_cancelada: { text: 'Cancelada', class: 'status-cancelado' }
            };
            const statusInfo = statusMap[reserva.tipo] || { text: 'N/A', class: '' };

            let actionsHtml = 'N/A';
            if (reserva.tipo === 'reserva') {
                actionsHtml = `
                    <button class="btn btn-sm btn-success btn-confirmar" data-id="${reserva.id}">Confirmar</button>
                    <button class="btn btn-sm btn-secondary btn-cancelar" data-id="${reserva.id}">Cancelar</button>
                `;
            }

            row.innerHTML = `
                <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
                <td>${reserva.data ? new Date(reserva.data.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A'}</td>
                <td>${product.codigo || 'N/A'}</td>
                <td>${product.descricao || 'N/A'}</td>
                <td>${product.un || 'N/A'}</td>
                <td>${product.cor || 'N/A'}</td>
                <td>${reserva.quantidade}</td>
                <td>${obra.nome || 'N/A'}</td>
                <td>${reserva.observacao || ''}</td>
                <td class="actions">${actionsHtml}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // --- Filtering ---
    function applyFilters() {
        const codigo = filterCodigo.value.toLowerCase();
        const descricao = filterDescricao.value.toLowerCase();
        const status = filterStatus.value;

        const filteredData = allReservas.filter(reserva => {
            const product = productsMap[reserva.produtoId] || {};
            const matchCodigo = !codigo || product.codigo?.toLowerCase().includes(codigo);
            const matchDescricao = !descricao || product.descricao?.toLowerCase().includes(descricao);
            const matchStatus = !status || reserva.tipo === status;
            return matchCodigo && matchDescricao && matchStatus;
        });

        renderTable(filteredData);
    }

    // --- Event Listeners ---
    filterCodigo.addEventListener('input', applyFilters);
    filterDescricao.addEventListener('input', applyFilters);
    filterStatus.addEventListener('change', applyFilters);

    tableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const reservaId = target.dataset.id;

        if (!reservaId) return;

        if (target.classList.contains('btn-confirmar')) {
            if (!confirm('Tem certeza que deseja confirmar esta reserva e dar baixa no estoque?')) return;

            try {
                await runTransaction(db, async (transaction) => {
                    const reservaRef = doc(db, 'movimentacoes', reservaId);
                    const reservaDoc = await transaction.get(reservaRef);

                    if (!reservaDoc.exists() || reservaDoc.data().tipo !== 'reserva') {
                        throw new Error('Reserva não encontrada ou já processada.');
                    }

                    const reservaData = reservaDoc.data();
                    const productRef = doc(db, 'produtos', reservaData.produtoId);
                    const productDoc = await transaction.get(productRef);

                    if (!productDoc.exists()) {
                        throw new Error('Produto da reserva não encontrado.');
                    }

                    const currentEstoque = productDoc.data().estoque || 0;
                    if (currentEstoque < reservaData.quantidade) {
                        throw new Error(`Estoque insuficiente! Disponível: ${currentEstoque}`);
                    }

                    const newEstoque = currentEstoque - reservaData.quantidade;
                    transaction.update(productRef, { estoque: newEstoque });
                    transaction.update(reservaRef, { tipo: 'saida_confirmada' });
                });
                alert('Reserva confirmada com sucesso!');
            } catch (error) {
                console.error('Erro ao confirmar reserva:', error);
                alert(`Erro: ${error.message}`);
            }
        }

        if (target.classList.contains('btn-cancelar')) {
            if (!confirm('Tem certeza que deseja cancelar esta reserva?')) return;

            try {
                const reservaRef = doc(db, 'movimentacoes', reservaId);
                await runTransaction(db, async (transaction) => {
                    const reservaDoc = await transaction.get(reservaRef);
                     if (!reservaDoc.exists() || reservaDoc.data().tipo !== 'reserva') {
                        throw new Error('Reserva não encontrada ou já processada.');
                    }
                    transaction.update(reservaRef, { tipo: 'reserva_cancelada' });
                });
                alert('Reserva cancelada com sucesso!');
            } catch (error) {
                console.error('Erro ao cancelar reserva:', error);
                alert(`Erro: ${error.message}`);
            }
        }
    });

    // --- Init ---
    await loadInitialData();
    loadReservas();
});
