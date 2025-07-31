import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Movimentações carregada.");

    // --- DOM Elements ---
    const formEntrada = document.getElementById('form-entrada');
    const formSaida = document.getElementById('form-saida');
    const tableBody = document.querySelector('#table-movimentacoes tbody');
    const filterInput = document.getElementById('filter-movimentacoes');

    // --- Data Stores ---
    let productsMap = {};
    let configData = {};
    let allMovements = []; // Dados brutos do Firestore
    let filteredMovements = []; // Dados após filtragem e antes da ordenação

    // --- Table State ---
    let sortState = {
        column: 'data',
        direction: 'desc'
    };
    let filterState = {};


    // ... (Mantenha as funções loadInitialData, setupAutoFill, e os listeners de formEntrada e formSaida como estão)


    // --- Core Table Logic ---

    function updateTable() {
        // 1. Apply Filters
        filteredMovements = allMovements.filter(mov => {
            for (const column in filterState) {
                const filterValue = filterState[column].toLowerCase();
                if (!filterValue) continue;

                let cellValue = getColumnValue(mov, column).toString().toLowerCase();

                if (!cellValue.includes(filterValue)) {
                    return false;
                }
            }
            return true;
        });

        // 2. Apply Sorting
        filteredMovements.sort((a, b) => {
            let valA = getColumnValue(a, sortState.column);
            let valB = getColumnValue(b, sortState.column);

            // Tratamento para comparação numérica
            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortState.direction === 'asc' ? valA - valB : valB - valA;
            }

            // Comparação de strings
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();

            if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // 3. Render
        renderTable(filteredMovements);
    }

    function getColumnValue(mov, column) {
        const product = productsMap[mov.productId] || {};
        switch (column) {
            case 'data': return mov.data.toMillis();
            case 'tipo': return mov.tipo;
            case 'codigo': return product.codigo || '';
            case 'codigo_global': return product.codigo_global || '';
            case 'descricao': return product.descricao || '';
            case 'un': return product.un || '';
            case 'quantidade': return mov.quantidade;
            case 'medida': return mov.medida || '';
            case 'nf': return mov.nf || '';
            case 'valor_unitario': return mov.valor_unitario || 0;
            case 'icms': return mov.icms || 0;
            case 'ipi': return mov.ipi || 0;
            case 'frete': return mov.frete || 0;
            case 'custoUnitario':
                 if (mov.tipo === 'entrada' && mov.quantidade > 0) {
                    const valorTotal = (mov.quantidade * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                    return valorTotal / mov.quantidade;
                }
                return 0;
            case 'requisitante': return mov.requisitante || '';
            case 'obraId': return configData.obras?.[mov.obraId]?.nome || '';
            case 'observacao': return mov.observacao || '';
            default: return '';
        }
    }


    // --- Real-time Table Rendering ---
    onSnapshot(collection(db, 'movimentacoes'), (snapshot) => {
        allMovements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateTable(); // Chame a nova função mestre
    });

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(mov => {
            const row = document.createElement('tr');
            const product = productsMap[mov.productId];

            let custoUnitario = '-';
            if (mov.tipo === 'entrada' && mov.quantidade > 0) {
                const valorTotalEntrada = (mov.quantidade * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                const custo = valorTotalEntrada / mov.quantidade;
                custoUnitario = `R$ ${custo.toFixed(2)}`;
            }

            const valorUnitarioFmt = mov.valor_unitario ? `R$ ${mov.valor_unitario.toFixed(2)}` : '-';
            const icmsFmt = mov.icms ? `R$ ${mov.icms.toFixed(2)}` : '-';
            const ipiFmt = mov.ipi ? `R$ ${mov.ipi.toFixed(2)}` : '-';
            const freteFmt = mov.frete ? `R$ ${mov.frete.toFixed(2)}` : '-';

            row.innerHTML = `
                <td>${new Date(mov.data.seconds * 1000).toLocaleString('pt-BR')}</td>
                <td class="${mov.tipo}">${mov.tipo.toUpperCase()}</td>
                <td>${product?.codigo || 'N/A'}</td>
                <td>${product?.codigo_global || '-'}</td>
                <td>${product?.descricao || 'Produto não encontrado'}</td>
                <td>${product?.un || 'N/A'}</td>
                <td>${mov.quantidade}</td>
                <td>${mov.medida || '-'}</td>
                <td>${mov.nf || '-'}</td>
                <td>${valorUnitarioFmt}</td>
                <td>${icmsFmt}</td>
                <td>${ipiFmt}</td>
                <td>${freteFmt}</td>
                <td>${custoUnitario}</td>
                <td>${mov.requisitante || '-'}</td>
                <td>${configData.obras?.[mov.obraId]?.nome || '-'}</td>
                <td>${mov.observacao || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // --- Event Listeners for Sorting and Filtering ---
    document.getElementById('headers-row').addEventListener('click', e => {
        const newColumn = e.target.dataset.column;
        if (!newColumn) return;

        const currentColumn = sortState.column;
        if (newColumn === currentColumn) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = newColumn;
            sortState.direction = 'desc'; // Default to desc for new columns
        }

        // Update visual indicators
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
    loadInitialData().then(() => {
        setupAutoFill();
    });
