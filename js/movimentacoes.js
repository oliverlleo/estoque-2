import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    // --- DOM Elements ---
    const formMovimentacao = document.getElementById('form-movimentacao');
    const toggle = document.getElementById('movement-toggle');
    const btnMovimentacao = document.getElementById('btn-movimentacao');
    const tableBody = document.querySelector('#table-movimentacoes tbody');

    // --- Campos do Formulário ---
    const entradaFields = [
        document.getElementById('mov-tipo-entrada'), document.getElementById('mov-nf'),
        document.getElementById('mov-valor-unitario'), document.getElementById('mov-icms'),
        document.getElementById('mov-ipi'), document.getElementById('mov-frete')
    ];
    const saidaFields = [
        document.getElementById('mov-tipo-saida'), document.getElementById('mov-requisitante'),
        document.getElementById('mov-obra'), document.getElementById('mov-estoque-display-wrapper')
    ];

    // --- Data Stores ---
    let productsMap = {};
    let configData = {};
    let allMovements = [];
    let initialDataLoaded = false;

    // --- Table State ---
    let sortState = { column: 'data', direction: 'desc' };
    let filterState = {};

    // --- Lógica do Interruptor (Toggle) ---
    function handleToggleChange() {
        const isEntrada = toggle.checked; // true para Entrada, false para Saída

        entradaFields.forEach(el => el.style.display = isEntrada ? '' : 'none');
        saidaFields.forEach(el => el.style.display = isEntrada ? 'none' : '');

        if (isEntrada) {
            btnMovimentacao.textContent = 'Confirmar Entrada';
            btnMovimentacao.className = 'btn btn-success';
            document.getElementById('toggle-label-entrada').style.fontWeight = 'bold';
            document.getElementById('toggle-label-entrada').style.color = '#198754';
            document.getElementById('toggle-label-saida').style.fontWeight = 'normal';
            document.getElementById('toggle-label-saida').style.color = '#6c757d';
        } else {
            btnMovimentacao.textContent = 'Confirmar Saída';
            btnMovimentacao.className = 'btn btn-danger';
            document.getElementById('toggle-label-saida').style.fontWeight = 'bold';
            document.getElementById('toggle-label-saida').style.color = '#dc3545';
            document.getElementById('toggle-label-entrada').style.fontWeight = 'normal';
            document.getElementById('toggle-label-entrada').style.color = '#6c757d';
        }
        updateProductInfo();
    }

    toggle.addEventListener('change', handleToggleChange);

    // --- Lógica de Submissão do Formulário Unificado ---
    formMovimentacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEntrada = toggle.checked;
        const productId = document.getElementById('mov-produto').value;
        const quantidade = parseFloat(document.getElementById('mov-quantidade').value);

        if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto e a quantidade corretamente.');
            return;
        }

        if (isEntrada) {
            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);

                    if (!productDoc.exists()) { throw "Produto não encontrado!"; }

                    const productData = productDoc.data();
                    const conversaoId = productData.conversaoId;

                    const quantidadeInformada = parseFloat(document.getElementById('mov-quantidade').value);
                    let quantidadeParaEstoque = quantidadeInformada;
                    let quantidadeOriginalCompra = quantidadeInformada;

                    if (conversaoId) {
                        const conversaoRef = doc(db, 'conversoes', conversaoId);
                        const conversaoDoc = await transaction.get(conversaoRef);

                        if (conversaoDoc.exists()) {
                            const regra = conversaoDoc.data();
                            const fator_qtd_compra = parseFloat(regra.qtd_compra);
                            const fator_qtd_padrao = parseFloat(regra.qtd_padrao);

                            if (fator_qtd_compra > 0) {
                                quantidadeParaEstoque = (quantidadeInformada / fator_qtd_compra) * fator_qtd_padrao;
                            }
                        }
                    }

                    const currentEstoque = productData.estoque || 0;
                    const newEstoque = currentEstoque + quantidadeParaEstoque;
                    transaction.update(productRef, { estoque: newEstoque });

                    const movementRef = doc(collection(db, 'movimentacoes'));
                    const movementData = {
                        tipo: 'entrada',
                        productId,
                        data: serverTimestamp(),
                        tipo_entradaId: document.getElementById('mov-tipo-entrada').value,
                        nf: document.getElementById('mov-nf').value,
                        valor_unitario: parseFloat(document.getElementById('mov-valor-unitario').value) || 0,
                        icms: parseFloat(document.getElementById('mov-icms').value) || 0,
                        ipi: parseFloat(document.getElementById('mov-ipi').value) || 0,
                        frete: parseFloat(document.getElementById('mov-frete').value) || 0,
                        observacao: document.getElementById('mov-observacao').value,
                        medida: document.getElementById('mov-medida').value,
                        quantidade: quantidadeParaEstoque,
                        quantidade_compra: quantidadeOriginalCompra
                    };

                    transaction.set(movementRef, movementData);
                });
                alert('Entrada registrada com sucesso!');
                formMovimentacao.reset();
                handleToggleChange();
            } catch (error) {
                console.error("Erro na transação de entrada:", error);
                alert(`Erro ao registrar entrada: ${error}`);
            }
        } else {
            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) throw "Produto não encontrado!";

                    const currentEstoque = productDoc.data().estoque || 0;
                    if (currentEstoque < quantidade) throw `Estoque insuficiente! Disponível: ${currentEstoque}`;

                    const newEstoque = currentEstoque - quantidade;
                    transaction.update(productRef, { estoque: newEstoque });

                    const movementRef = doc(collection(db, 'movimentacoes'));
                    const movementData = {
                        tipo: 'saida', productId, quantidade, data: serverTimestamp(),
                        tipo_saidaId: document.getElementById('mov-tipo-saida').value,
                        requisitante: document.getElementById('mov-requisitante').value,
                        obraId: document.getElementById('mov-obra').value,
                        observacao: document.getElementById('mov-observacao').value,
                        medida: document.getElementById('mov-medida').value,
                    };
                    transaction.set(movementRef, movementData);
                });
                alert('Saída registrada com sucesso!');
                formMovimentacao.reset();
                handleToggleChange();
            } catch (error) {
                console.error("Erro na transação de saída:", error);
                alert(`Erro ao registrar saída: ${error}`);
            }
        }
    });

    // --- Carregamento e preenchimento de dados ---
    async function loadInitialData() {
        const productSelect = document.getElementById('mov-produto');
        const tipoEntradaSelect = document.getElementById('mov-tipo-entrada');
        const tipoSaidaSelect = document.getElementById('mov-tipo-saida');
        const obraSelect = document.getElementById('mov-obra');

        const productsSnapshot = await getDocs(collection(db, 'produtos'));
        productsMap = {};
        productSelect.innerHTML = '<option value="">Selecione o Produto...</option>';
        productsSnapshot.forEach(doc => {
             const product = doc.data();
             productsMap[doc.id] = { id: doc.id, ...product };
             const optionText = `${product.codigo || 'S/C'} - ${product.descricao || 'N/A'} ${product.codigo_global ? '('+product.codigo_global+')' : ''}`.trim();
             productSelect.innerHTML += `<option value="${doc.id}">${optionText}</option>`;
        });

        configData.tipos_entrada = await loadConfigToSelect(tipoEntradaSelect, 'tipos_entrada', 'nome');
        configData.tipos_saida = await loadConfigToSelect(tipoSaidaSelect, 'tipos_saida', 'nome');
        configData.obras = await loadConfigToSelect(obraSelect, 'obras', 'nome');
    }

    async function loadConfigToSelect(selectElement, collectionName, field) {
        const snapshot = await getDocs(collection(db, collectionName));
        const items = {};
        selectElement.innerHTML = `<option value="">Selecione...</option>`;
        snapshot.forEach(doc => {
            items[doc.id] = doc.data();
            selectElement.innerHTML += `<option value="${doc.id}">${doc.data()[field]}</option>`;
        });
        return items;
    }

    function updateProductInfo() {
        const productId = document.getElementById('mov-produto').value;
        const product = productsMap[productId];

        document.getElementById('mov-codigo-display').textContent = product ? product.codigo : '-';
        document.getElementById('mov-codigoglobal-display').textContent = product ? (product.codigo_global || '-') : '-';
        document.getElementById('mov-descricao-display').textContent = product ? product.descricao : '-';
        document.getElementById('mov-un-display').textContent = product ? product.un : '-';
        document.getElementById('mov-estoque-display').textContent = product ? (product.estoque || 0) : '-';
    }
    document.getElementById('mov-produto').addEventListener('change', updateProductInfo);

    // --- Lógica da Tabela de Histórico ---
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

        filteredMovements.sort((a, b) => {
            let valA = a._search_data[sortState.column];
            let valB = b._search_data[sortState.column];
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

    document.getElementById('history-filters-container').addEventListener('input', e => {
        if (e.target.classList.contains('filter-input')) {
            const column = e.target.dataset.column;
            const value = e.target.value;
            filterState[column] = value;
            updateTable();
        }
    });

    // --- Init ---
    onSnapshot(collection(db, 'movimentacoes'), (snapshot) => {
        allMovements = snapshot.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, ...data };
        });
        if (initialDataLoaded) {
            updateTable();
        }
    });

    loadInitialData().then(() => {
        handleToggleChange();
        initialDataLoaded = true;
        updateTable();
    });
});
