import { db } from './firebase-config.js';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    runTransaction,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    console.log("Página de Reservas carregada.");

    const tableBody = document.querySelector('#table-reservas tbody');
    const filtersContainer = document.getElementById('filters-container');
    let productsMap = {};
    let obrasMap = {};
    let locaisMap = {};
    let allReservas = [];
    let filterState = {};

    async function loadInitialData() {
        // Carregar produtos
        const productsSnapshot = await getDocs(collection(db, 'produtos'));
        productsMap = {};
        productsSnapshot.forEach(doc => {
            productsMap[doc.id] = { id: doc.id, ...doc.data() };
        });

        // Carregar obras
        const obrasSnapshot = await getDocs(collection(db, 'obras'));
        obrasMap = {};
        obrasSnapshot.forEach(doc => {
            obrasMap[doc.id] = doc.data();
        });

        // Carregar locais
        const locaisSnapshot = await getDocs(collection(db, 'locais'));
        locaisMap = {};
        locaisSnapshot.forEach(doc => {
            locaisMap[doc.id] = doc.data();
        });
    }

    async function loadReservas() {
        await loadInitialData();

        const q = query(
            collection(db, 'movimentacoes'),
            where("tipo", "in", ["reserva", "reserva_cancelada"])
        );

        onSnapshot(q, (snapshot) => {
            allReservas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyFilters();
        });
    }

    function applyFilters() {
        const filteredData = allReservas.filter(mov => {
            const product = productsMap[mov.productId] || {};
            const obra = obrasMap[mov.obraId] || {};

            const matchesCodigo = (product.codigo || '').toLowerCase().includes((filterState.codigo || '').toLowerCase());
            const matchesDescricao = (product.descricao || '').toLowerCase().includes((filterState.descricao || '').toLowerCase());
            const matchesObra = (obra.nome || '').toLowerCase().includes((filterState.obra || '').toLowerCase());

            return matchesCodigo && matchesDescricao && matchesObra;
        });
        renderTable(filteredData);
    }

    filtersContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('form-control')) {
            const filterId = e.target.id.replace('filter-', '');
            filterState[filterId] = e.target.value;
            applyFilters();
        }
    });

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(mov => {
            const product = productsMap[mov.productId] || {};
            const obra = obrasMap[mov.obraId] || {};

            const row = document.createElement('tr');

            const statusClass = `status-${mov.tipo.replace('reserva_', '')}`;
            const statusText = mov.tipo.replace('reserva_', 'RESERVA ').toUpperCase();

            // Calcula o estoque total atual do produto
            let estoqueAtual = 0;
            if (product.locacoes && Array.isArray(product.locacoes)) {
                estoqueAtual = product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0);
            }

            const corEstoque = estoqueAtual < mov.quantidade ? 'red' : 'green';

            // Lógica para Local e Endereçamento
            let localNome = '-';
            let enderecamento = mov.locacao;

            // Se o movimento tem locação explícita
            if (enderecamento && product.locacoes) {
                const locInfo = product.locacoes.find(l => l.locacao === enderecamento);
                if (locInfo && locInfo.localId && locaisMap[locInfo.localId]) {
                    localNome = locaisMap[locInfo.localId].nome;
                }
            }
            // Se não tem locação explícita, tenta inferir se o produto só tem uma locação
            else if (!enderecamento && product.locacoes && product.locacoes.length > 0) {
                 // Filtra locações com nome válido
                 const validLocacoes = product.locacoes.filter(l => l.locacao);
                 if (validLocacoes.length === 1) {
                     enderecamento = validLocacoes[0].locacao;
                     const localId = validLocacoes[0].localId;
                     if (localId && locaisMap[localId]) {
                         localNome = locaisMap[localId].nome;
                     }
                 } else {
                     enderecamento = '<span class="text-gray-400 italic">Não especificado</span>';
                     localNome = '<span class="text-gray-400 italic">Não especificado</span>';
                 }
            } else {
                enderecamento = '-';
            }

            row.innerHTML = `
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${mov.data ? new Date(mov.data.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A'}</td>
                <td>${product.codigo || 'N/A'}</td>
                <td>${product.descricao || 'N/A'}</td>
                <td>${product.un || 'N/A'}</td>
                <td>${product.cor || '-'}</td>
                <td>${mov.quantidade}</td>
                <td style="color: ${corEstoque}; font-weight: bold;">${estoqueAtual.toFixed(2)}</td>
                <td>${localNome}</td>
                <td>${enderecamento}</td>
                <td>${obra.nome || 'N/A'}</td>
                <td>${mov.observacao || ''}</td>
                <td class="actions">
                    ${mov.tipo === 'reserva' ?
                        `<button class="btn btn-confirmar" data-id="${mov.id}">Confirmar</button>
                         <button class="btn btn-cancelar" data-id="${mov.id}">Cancelar</button>`
                        : 'N/A'
                    }
                </td>
            `;
            tableBody.appendChild(row);
        });
        feather.replace();
    }

    // Event Delegation for action buttons
    tableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const movId = target.dataset.id;

        if (!movId) return;

        if (target.classList.contains('btn-confirmar')) {
            await handleConfirm(movId);
        } else if (target.classList.contains('btn-cancelar')) {
            await handleCancel(movId);
        }
    });

    async function handleConfirm(movId) {
        try {
            await runTransaction(db, async (transaction) => {
                const movRef = doc(db, 'movimentacoes', movId);
                const movDoc = await transaction.get(movRef);

                if (!movDoc.exists() || movDoc.data().tipo !== 'reserva') {
                    throw new Error("Esta reserva não pode ser confirmada.");
                }

                const movData = movDoc.data();
                const productRef = doc(db, 'produtos', movData.productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) {
                    throw new Error("Produto da reserva não encontrado.");
                }

                const pData = productDoc.data();
                const locacoes = pData.locacoes || [];
                const locacaoDaReserva = movData.locacao;

                if (!locacaoDaReserva) {
                    throw new Error("A reserva não especifica uma locação de origem e não pode ser confirmada.");
                }

                const locacaoIndex = locacoes.findIndex(l => l.locacao === locacaoDaReserva);
                if (locacaoIndex === -1) {
                    throw new Error(`A locação de origem da reserva (${locacaoDaReserva}) não foi encontrada no produto.`);
                }

                const estoqueNaLocacao = locacoes[locacaoIndex].estoque || 0;
                if (estoqueNaLocacao < movData.quantidade) {
                    throw new Error(`Estoque insuficiente na locação ${locacaoDaReserva}! Disponível: ${estoqueNaLocacao}, Reservado: ${movData.quantidade}`);
                }

                // Debita o estoque da locação específica
                locacoes[locacaoIndex].estoque -= movData.quantidade;

                transaction.update(productRef, { locacoes: locacoes });
                transaction.update(movRef, {
                    tipo: 'saida',
                    reserva_confirmada: true,
                    valorMedioHistorico: productDoc.data().valorMedio || 0
                });
            });
            alert('Reserva confirmada e estoque atualizado com sucesso!');
        } catch (error) {
            console.error("Erro ao confirmar reserva:", error);
            alert(`Erro: ${error.message}`);
        }
    }

    async function handleCancel(movId) {
        if (!confirm('Tem certeza que deseja cancelar esta reserva?')) {
            return;
        }
        try {
            const movRef = doc(db, 'movimentacoes', movId);
            await updateDoc(movRef, { tipo: 'reserva_cancelada' });
            alert('Reserva cancelada com sucesso!');
        } catch (error) {
            console.error("Erro ao cancelar reserva:", error);
            alert(`Erro ao cancelar reserva: ${error.message}`);
        }
    }

    loadReservas();
});
