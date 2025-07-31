import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Movimentações carregada.");

    // --- DOM Elements ---
    const formEntrada = document.getElementById('form-entrada');
    const formSaida = document.getElementById('form-saida');
    const tableBody = document.querySelector('#table-movimentacoes tbody');

    // --- Data Stores ---
    let productsMap = {};
    let configData = {};
    let allMovements = [];

    // --- Table State ---
    let sortState = { column: 'data', direction: 'desc' };
    let filterState = {};
    let initialDataLoaded = false; // <-- Variável de controle CRÍTICA

    // --- Initial Data Loading ---
    async function loadInitialData() {
        // Load products
        const productsSnapshot = await getDocs(collection(db, 'produtos'));
        productsMap = {};
        const productOptions = ['<option value="">Selecione o Produto...</option>'];
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            productsMap[doc.id] = { id: doc.id, ...product };
            const codigo = product.codigo || 'S/C';
            const descricao = product.descricao || 'Produto sem descrição';
            const codigoGlobal = product.codigo_global ? `(${product.codigo_global})` : '';
            const optionText = `${codigo} - ${descricao} ${codigoGlobal}`.trim();
            productOptions.push(`<option value="${doc.id}">${optionText}</option>`);
        });
        document.getElementById('entrada-produto').innerHTML = productOptions.join('');
        document.getElementById('saida-produto').innerHTML = productOptions.join('');

        // Load other config data
        const configsToLoad = [
            { id: 'entrada-tipo', collection: 'tipos_entrada', field: 'nome', defaultOption: 'Tipo de Entrada...' },
            { id: 'saida-tipo', collection: 'tipos_saida', field: 'nome', defaultOption: 'Tipo de Saída...' },
            { id: 'saida-obra', collection: 'obras', field: 'nome', defaultOption: 'Selecione a Obra...' },
        ];

        for (const cfg of configsToLoad) {
            const select = document.getElementById(cfg.id);
            if(select) {
                const snapshot = await getDocs(collection(db, cfg.collection));
                configData[cfg.collection] = {};
                select.innerHTML = `<option value="">${cfg.defaultOption}</option>`;
                snapshot.forEach(doc => {
                    configData[cfg.collection][doc.id] = doc.data();
                    select.innerHTML += `<option value="${doc.id}">${doc.data()[cfg.field]}</option>`;
                });
            }
        }
    }

    // --- Form Auto-fill ---
    function setupAutoFill() {
        document.getElementById('entrada-produto').addEventListener('change', (e) => {
            const product = productsMap[e.target.value];
            document.getElementById('entrada-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('entrada-codigoglobal-display').textContent = product ? (product.codigo_global || '-') : '-';
            document.getElementById('entrada-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('entrada-un-display').textContent = product ? product.un_compra : '-';
        });
        document.getElementById('saida-produto').addEventListener('change', (e) => {
            const product = productsMap[e.target.value];
            document.getElementById('saida-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('saida-codigoglobal-display').textContent = product ? (product.codigo_global || '-') : '-';
            document.getElementById('saida-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('saida-un-display').textContent = product ? product.un : '-';
            document.getElementById('saida-estoque-display').textContent = product ? (product.estoque || 0) : '-';
        });
    }

    // --- Transaction Logic (Forms) ---
    formEntrada.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('entrada-produto').value;
        const quantidade = parseFloat(document.getElementById('entrada-quantidade').value);

        if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) { throw "Produto não encontrado!"; }

                const currentEstoque = productDoc.data().estoque || 0;
                const newEstoque = currentEstoque + quantidade;

                transaction.update(productRef, { estoque: newEstoque });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'entrada', productId, quantidade, data: serverTimestamp(),
                    tipo_entradaId: document.getElementById('entrada-tipo').value,
                    nf: document.getElementById('entrada-nf').value,
                    valor_unitario: parseFloat(document.getElementById('entrada-valor-unitario').value) || 0,
                    icms: parseFloat(document.getElementById('entrada-icms').value) || 0,
                    ipi: parseFloat(document.getElementById('entrada-ipi').value) || 0,
                    frete: parseFloat(document.getElementById('entrada-frete').value) || 0,
                    observacao: document.getElementById('entrada-observacao').value,
                    medida: document.getElementById('entrada-medida').value,
                };
                transaction.set(movementRef, movementData);
            });
            alert('Entrada registrada com sucesso!');
            formEntrada.reset();
        } catch (error) {
            console.error("Erro na transação de entrada:", error);
            alert(`Erro ao registrar entrada: ${error}`);
        }
    });

    formSaida.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('saida-produto').value;
        const quantidade = parseFloat(document.getElementById('saida-quantidade').value);

        if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) { throw "Produto não encontrado!"; }

                const currentEstoque = productDoc.data().estoque || 0;
                if (currentEstoque < quantidade) {
                    throw `Estoque insuficiente! Disponível: ${currentEstoque}`;
                }
                const newEstoque = currentEstoque - quantidade;

                transaction.update(productRef, { estoque: newEstoque });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'saida', productId, quantidade, data: serverTimestamp(),
                    tipo_saidaId: document.getElementById('saida-tipo').value,
                    requisitante: document.getElementById('saida-requisitante').value,
                    obraId: document.getElementById('saida-obra').value,
                    observacao: document.getElementById('saida-observacao').value,
                    medida: document.getElementById('saida-medida').value,
                };
                transaction.set(movementRef, movementData);
            });
            alert('Saída registrada com sucesso!');
            formSaida.reset();
        } catch (error) {
            console.error("Erro na transação de saída:", error);
            alert(`Erro ao registrar saída: ${error}`);
        }
    });


    // --- Core Table Logic ---
    function updateTable() {
        let processedMovements = allMovements.map(mov => {
            const product = productsMap[mov.productId] || {};
            let custoUnitario = 0;
            if (mov.tipo === 'entrada' && mov.quantidade > 0) {
                const valorTotal = (mov.quantidade * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                custoUnitario = valorTotal / mov.quantidade;
            }
            return {
                ...mov,
                _search_data: {
                    data: mov.data ? new Date(mov.data.seconds * 1000).toLocaleString('pt-BR') : '',
                    tipo: mov.tipo || '',
                    codigo: product.codigo || '',
                    codigo_global: product.codigo_global || '',
                    descricao: product.descricao || '',
                    un: product.un || '',
                    quantidade: mov.quantidade?.toString() || '',
                    medida: mov.medida || '',
                    nf: mov.nf || '',
                    valor_unitario: (mov.valor_unitario || 0).toString(),
                    icms: (mov.icms || 0).toString(),
                    ipi: (mov.ipi || 0).toString(),
                    frete: (mov.frete || 0).toString(),
                    custoUnitario: custoUnitario.toFixed(2),
                    requisitante: mov.requisitante || '',
                    obraId: configData.obras?.[mov.obraId]?.nome || '',
                    observacao: mov.observacao || ''
                }
            };
        });

        // 1. Apply Filters
        let filteredMovements = processedMovements.filter(mov => {
            for (const column in filterState) {
                const filterValue = filterState[column]?.toLowerCase();
                if (!filterValue) continue;

                const cellValue = mov._search_data[column]?.toLowerCase();
                if (cellValue === undefined || !cellValue.includes(filterValue)) {
                    return false;
                }
            }
            return true;
        });

        // 2. Apply Sorting
        filteredMovements.sort((a, b) => {
            let valA = a._search_data[sortState.column];
            let valB = b._search_data[sortState.column];

            // Trata a coluna de data como timestamp para ordenar corretamente
            if (sortState.column === 'data') {
                valA = a.data ? a.data.toMillis() : 0;
                valB = b.data ? b.data.toMillis() : 0;
            }

            const numericColumns = ['quantidade', 'valor_unitario', 'icms', 'ipi', 'frete', 'custoUnitario'];
            if (numericColumns.includes(sortState.column)) {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }

            if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
            return 0;
        });

        renderTable(filteredMovements);
    }

    // --- Real-time Table Rendering ---
    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(mov => {
            const row = document.createElement('tr');
            const searchData = mov._search_data;

            const valorUnitarioFmt = mov.valor_unitario ? `R$ ${mov.valor_unitario.toFixed(2)}` : '-';
            const icmsFmt = mov.icms ? `R$ ${mov.icms.toFixed(2)}` : '-';
            const ipiFmt = mov.ipi ? `R$ ${mov.ipi.toFixed(2)}` : '-';
            const freteFmt = mov.frete ? `R$ ${mov.frete.toFixed(2)}` : '-';
            const custoUnitarioFmt = parseFloat(searchData.custoUnitario) > 0 ? `R$ ${searchData.custoUnitario}` : '-';

            row.innerHTML = `
                <td>${searchData.data}</td>
                <td class="${searchData.tipo}">${searchData.tipo.toUpperCase()}</td>
                <td>${searchData.codigo || 'N/A'}</td>
                <td>${searchData.codigo_global || '-'}</td>
                <td>${searchData.descricao || 'Produto não encontrado'}</td>
                <td>${searchData.un || 'N/A'}</td>
                <td>${searchData.quantidade}</td>
                <td>${searchData.medida || '-'}</td>
                <td>${searchData.nf || '-'}</td>
                <td>${valorUnitarioFmt}</td>
                <td>${icmsFmt}</td>
                <td>${ipiFmt}</td>
                <td>${freteFmt}</td>
                <td>${custoUnitarioFmt}</td>
                <td>${searchData.requisitante || '-'}</td>
                <td>${searchData.obraId || '-'}</td>
                <td>${searchData.observacao || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // --- Event Listeners for Sorting and Filtering ---
    document.getElementById('headers-row').addEventListener('click', e => {
        const newColumn = e.target.dataset.column;
        if (!newColumn) return;

        if (newColumn === sortState.column) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = newColumn;
            sortState.direction = 'desc';
        }

        document.querySelectorAll('#headers-row th').forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
        e.target.classList.add(`sort-${sortState.direction}`);

        updateTable();
    });

    document.getElementById('filters-row').addEventListener('input', e => {
        const column = e.target.dataset.column;
        const value = e.target.value;
        filterState[column] = value;
        updateTable();
    });

    // --- Init ---

    onSnapshot(collection(db, 'movimentacoes'), (snapshot) => {
        allMovements = snapshot.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, ...data };
        });
        // Só renderiza a tabela se os dados de suporte já foram carregados
        if (initialDataLoaded) {
            updateTable();
        }
    });

    loadInitialData().then(() => {
        setupAutoFill();
        initialDataLoaded = true; // SINAL VERDE: dados de suporte carregados
        updateTable(); // Agora sim, renderiza a tabela com tudo pronto
    });
});
