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
    let sortState = { column: 'data', direction: 'desc' }; // Default sort

    // Modal Image Elements
    const imageModal = document.getElementById('product-image-modal');
    const imageModalClose = document.getElementById('product-image-modal-close');
    const imageDisplay = document.getElementById('product-image-display');
    const imagePlaceholder = document.getElementById('product-image-placeholder');
    const imageTitle = document.getElementById('product-image-title');

    imageModalClose.onclick = () => {
        imageModal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target == imageModal) {
            imageModal.style.display = 'none';
        }
        if (event.target == confirmModal) {
            closeConfirmModal();
        }
    };

    function openImageModal(product) {
        if (!product) return;
        imageTitle.textContent = `${product.codigo} - ${product.descricao}`;
        if (product.imagem) {
            imageDisplay.src = product.imagem;
            imageDisplay.style.display = 'inline-block';
            imagePlaceholder.style.display = 'none';
        } else {
            imageDisplay.style.display = 'none';
            imagePlaceholder.style.display = 'block';
        }
        imageModal.style.display = 'block';
    }

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
        const showCancelled = document.getElementById('show-cancelled').checked;

        const filteredData = allReservas.filter(mov => {
            const product = productsMap[mov.productId] || {};
            const obra = obrasMap[mov.obraId] || {};

            // Filtro de Canceladas
            if (!showCancelled && mov.tipo === 'reserva_cancelada') {
                return false;
            }

            const matchesCodigo = (product.codigo || '').toLowerCase().includes((filterState.codigo || '').toLowerCase());
            const matchesDescricao = (product.descricao || '').toLowerCase().includes((filterState.descricao || '').toLowerCase());
            const matchesObra = (obra.nome || '').toLowerCase().includes((filterState.obra || '').toLowerCase());

            return matchesCodigo && matchesDescricao && matchesObra;
        });
        renderTable(filteredData);
    }

    document.getElementById('show-cancelled').addEventListener('change', applyFilters);

    filtersContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('form-control')) {
            const filterId = e.target.id.replace('filter-', '');
            filterState[filterId] = e.target.value;
            applyFilters();
        }
    });

    document.getElementById('reservas-headers-row').addEventListener('click', (e) => {
        if (e.target.classList.contains('sortable')) {
            const column = e.target.dataset.column;
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }
            applyFilters(); // Re-render with sort
        }
    });

    function renderTable(data) {
        // Update header classes
        const headers = document.querySelectorAll('#reservas-headers-row .sortable');
        headers.forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            if (header.dataset.column === sortState.column) {
                header.classList.add(sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        // Sort data
        data.sort((a, b) => {
            let valA, valB;
            const productA = productsMap[a.productId] || {};
            const productB = productsMap[b.productId] || {};
            const obraA = obrasMap[a.obraId] || {};
            const obraB = obrasMap[b.obraId] || {};

            switch (sortState.column) {
                case 'status': valA = a.tipo; valB = b.tipo; break;
                case 'data': valA = a.data ? a.data.toMillis() : 0; valB = b.data ? b.data.toMillis() : 0; break;
                case 'codigo': valA = productA.codigo || ''; valB = productB.codigo || ''; break;
                case 'descricao': valA = productA.descricao || ''; valB = productB.descricao || ''; break;
                case 'un': valA = productA.un || ''; valB = productB.un || ''; break;
                case 'cor': valA = productA.cor || ''; valB = productB.cor || ''; break;
                case 'quantidade': valA = a.quantidade || 0; valB = b.quantidade || 0; break;
                case 'estoque':
                    valA = productA.locacoes ? productA.locacoes.reduce((acc, l) => acc + (l.estoque || 0), 0) : 0;
                    valB = productB.locacoes ? productB.locacoes.reduce((acc, l) => acc + (l.estoque || 0), 0) : 0;
                    break;
                case 'local':
                    // Simplified sorting for local (just checks if has locacao)
                    valA = a.locacao || ''; valB = b.locacao || '';
                    break;
                case 'enderecamento': valA = a.locacao || ''; valB = b.locacao || ''; break;
                case 'obra': valA = obraA.nome || ''; valB = obraB.nome || ''; break;
                case 'observacao': valA = a.observacao || ''; valB = b.observacao || ''; break;
                default: valA = ''; valB = '';
            }

            if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
            return 0;
        });

        tableBody.innerHTML = '';
        data.forEach(mov => {
            const product = productsMap[mov.productId] || {};
            const obra = obrasMap[mov.obraId] || {};

            const row = document.createElement('tr');

            // Add click listener for opening image modal (except action buttons)
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.actions')) {
                    openImageModal(product);
                }
            });
            row.style.cursor = 'pointer'; // Indicate clickability

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

            // Se o movimento tem locação explícita (mesmo que seja string vazia)
            if (enderecamento !== undefined && enderecamento !== null && product.locacoes) {
                const locInfo = product.locacoes.find(l => l.locacao === enderecamento);
                if (locInfo && locInfo.localId && locaisMap[locInfo.localId]) {
                    localNome = locaisMap[locInfo.localId].nome;
                }
            }

            // Se não encontrou o local acima (ex: enderecamento null/undefined antigo), tenta inferir
            if (localNome === '-' && product.locacoes && product.locacoes.length > 0) {
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
            } else if (!enderecamento && localNome === '-') {
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

    // --- Lógica do Modal de Confirmação ---
    const confirmModal = document.getElementById('reservation-confirm-modal');
    const btnCloseModal = document.getElementById('reservation-modal-close');
    const btnCancelConfirm = document.getElementById('btn-cancelar-confirmacao');
    const btnFinalizeConfirm = document.getElementById('btn-finalizar-confirmacao');
    const selectLocacao = document.getElementById('res-modal-locacao-select');
    const alertBox = document.getElementById('res-modal-alert');
    const alertMsg = document.getElementById('res-modal-alert-msg');

    let currentConfirmMovId = null;

    function closeConfirmModal() {
        confirmModal.style.display = 'none';
        currentConfirmMovId = null;
    }

    btnCloseModal.onclick = closeConfirmModal;
    btnCancelConfirm.onclick = closeConfirmModal;
    // Window click listener merged above

    // Event Delegation for action buttons
    tableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const movId = target.dataset.id;

        // Prevent row click if button is clicked
        if (target.classList.contains('btn') || target.closest('.btn')) {
            e.stopPropagation();
        }

        if (!movId) return;

        if (target.classList.contains('btn-confirmar')) {
            await openConfirmationModal(movId);
        } else if (target.classList.contains('btn-cancelar')) {
            await handleCancel(movId);
        }
    });

    async function openConfirmationModal(movId) {
        // Fetch fresh data
        const movSnapshot = await getDocs(query(collection(db, 'movimentacoes'), where('__name__', '==', movId)));
        if (movSnapshot.empty) return alert('Reserva não encontrada.');
        const movData = movSnapshot.docs[0].data();

        if (movData.tipo !== 'reserva') return alert('Este item não é uma reserva.');

        const productSnapshot = await getDocs(query(collection(db, 'produtos'), where('__name__', '==', movData.productId)));
        if (productSnapshot.empty) return alert('Produto não encontrado.');
        const productData = productSnapshot.docs[0].data();

        currentConfirmMovId = movId;

        // Populate Modal UI
        document.getElementById('res-modal-produto').textContent = `${productData.codigo} - ${productData.descricao}`;
        document.getElementById('res-modal-quantidade-original').textContent = movData.quantidade;
        document.getElementById('res-modal-quantidade-input').value = movData.quantidade;

        // Populate Select
        selectLocacao.innerHTML = '';
        alertBox.classList.add('hidden');
        btnFinalizeConfirm.disabled = false;

        let locacoes = productData.locacoes || [];
        // Sort locations for better UX? Maybe by name.

        let hasStock = false;
        let reservedLocationValid = false;

        locacoes.forEach(loc => {
            const localName = locaisMap[loc.localId]?.nome || 'Local Desconhecido';
            const option = document.createElement('option');
            // Use JSON for unique identification
            option.value = JSON.stringify({ localId: loc.localId, locacao: loc.locacao });

            let label = `${loc.locacao} (${localName}) - Estoque: ${loc.estoque}`;

            if (loc.locacao === movData.locacao) {
                label += " (RESERVADO AQUI)";
            }
            option.textContent = label;

            // Check availability
            if ((loc.estoque || 0) <= 0) {
                option.style.color = 'red';
                option.disabled = true;
            } else {
                hasStock = true;
            }

            selectLocacao.appendChild(option);

            // Pre-select logic
            if (loc.locacao === movData.locacao) {
                // Pre-select even if stock is insufficient initially, user might lower the quantity
                option.selected = true;
                reservedLocationValid = true;
            }
        });

        // If no locations, show generic message
        if (locacoes.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = "Nenhuma locação cadastrada";
            selectLocacao.appendChild(opt);
            btnFinalizeConfirm.disabled = true;
        } else if (!hasStock) {
            alertBox.classList.remove('hidden');
            alertMsg.textContent = "Nenhuma locação possui estoque positivo para esta reserva!";
            btnFinalizeConfirm.disabled = true;
        } else if (!movData.locacao && !reservedLocationValid) {
             // Legacy or missing location
             // Select the first valid one automatically?
             // Browser defaults to first enabled option usually.
             if (selectLocacao.value === "") {
                 // Try to pick first enabled
                 for(let i=0; i<selectLocacao.options.length; i++) {
                     if (!selectLocacao.options[i].disabled) {
                         selectLocacao.selectedIndex = i;
                         break;
                     }
                 }
             }
        }

        confirmModal.style.display = 'block';
    }

    btnFinalizeConfirm.onclick = async () => {
        if (!currentConfirmMovId) return;
        const selectedValue = selectLocacao.value;
        const quantityInput = document.getElementById('res-modal-quantidade-input');
        const confirmQuantity = parseFloat(quantityInput.value);

        if (!selectedValue) {
            alert('Selecione uma locação.');
            return;
        }

        if (isNaN(confirmQuantity) || confirmQuantity <= 0) {
            alert('A quantidade a confirmar deve ser maior que zero.');
            return;
        }

        let targetLocalId = null;
        let targetLocacao = null;

        try {
            const parsed = JSON.parse(selectedValue);
            targetLocalId = parsed.localId;
            targetLocacao = parsed.locacao;
        } catch (e) {
            console.error("Erro ao ler locação selecionada:", e);
            alert('Erro na seleção da locação.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const movRef = doc(db, 'movimentacoes', currentConfirmMovId);
                const movDoc = await transaction.get(movRef);
                if (!movDoc.exists()) throw new Error("Reserva não encontrada.");

                const movData = movDoc.data();
                const productRef = doc(db, 'produtos', movData.productId);
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error("Produto não encontrado.");

                const pData = productDoc.data();
                const locacoes = pData.locacoes || [];

                const locacaoIndex = locacoes.findIndex(l => l.locacao === targetLocacao && l.localId === targetLocalId);
                if (locacaoIndex === -1) {
                    throw new Error(`Locação selecionada (${targetLocacao}) não encontrada no produto.`);
                }

                if ((locacoes[locacaoIndex].estoque || 0) < confirmQuantity) {
                    throw new Error(`Estoque insuficiente na locação selecionada. Disponível: ${locacoes[locacaoIndex].estoque || 0}`);
                }

                // Deduz estoque
                locacoes[locacaoIndex].estoque -= confirmQuantity;

                const valorMedio = parseFloat(pData.valorMedio) || 0;
                const custoTotal = valorMedio * confirmQuantity;

                transaction.update(productRef, { locacoes: locacoes });
                transaction.update(movRef, {
                    tipo: 'saida',
                    reserva_confirmada: true,
                    locacao: targetLocacao, // Atualiza para a locação REAL utilizada (apenas a string)
                    valorMedioHistorico: valorMedio,
                    custoTotal: custoTotal, // Salva o custo total
                    quantidade: confirmQuantity // Atualiza a quantidade confirmada
                });
            });
            alert('Reserva confirmada e estoque atualizado com sucesso!');
            closeConfirmModal();
        } catch (error) {
            console.error("Erro ao confirmar:", error);
            alert(`Erro: ${error.message}`);
        }
    };

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
