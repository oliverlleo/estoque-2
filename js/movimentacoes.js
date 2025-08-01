function showInfoModal(message) {
    document.getElementById('info-modal-message').textContent = message;
    document.getElementById('info-modal').style.display = 'block';
}

import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- NOVA FUNÇÃO PARA CALCULAR INVENTÁRIO DE PEDAÇOS ---
async function getPieceInventory(productId) {
    if (!productId) return {};
    const movementsSnapshot = await getDocs(collection(db, 'movimentacoes'));
    let inventario = {};
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        if (mov.productId === productId && mov.medida && mov.medida.trim() !== '') {
            const medida = mov.medida.trim();
            const quantidade = mov.quantidade ? parseInt(mov.quantidade) : 1; // Considera quantidade se houver, senão 1

            if (mov.tipo === 'entrada') {
                inventario[medida] = (inventario[medida] || 0) + quantidade;
            } else if (mov.tipo === 'saida') {
                inventario[medida] = (inventario[medida] || 0) - quantidade;
            }
        }
    });
    return inventario;
}

document.addEventListener('DOMContentLoaded', async function() {
    // Lógica para fechar o modal de informação
    const infoModal = document.getElementById('info-modal');
    const infoModalClose = document.getElementById('info-modal-close');
    infoModalClose.onclick = () => infoModal.style.display = 'none';

    window.addEventListener('click', (event) => {
        if (event.target == infoModal) {
            infoModal.style.display = 'none';
        }
    });

    // --- DOM Elements ---
    const formMovimentacao = document.getElementById('form-movimentacao');
    const toggle = document.getElementById('movement-toggle');
    const btnMovimentacao = document.getElementById('btn-movimentacao');
    const tableBody = document.querySelector('#table-movimentacoes tbody');
    const medidaTextInput = document.getElementById('mov-medida'); // Referência ao input de texto original

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

    // --- NOVA FUNÇÃO PARA ATUALIZAR O CAMPO DE MEDIDA ---
    async function updateMedidaField() {
        const isEntrada = toggle.checked;
        const productId = document.getElementById('mov-produto').value;

        const oldSelect = document.getElementById('mov-medida-select');
        if (oldSelect) {
            oldSelect.remove();
        }

        if (!isEntrada && productId) { // É SAÍDA e um produto foi selecionado
            medidaTextInput.style.display = 'none';

            const inventory = await getPieceInventory(productId);
            const availablePieces = Object.entries(inventory).filter(([medida, qtd]) => qtd > 0);

            if (availablePieces.length > 0) {
                const select = document.createElement('select');
                select.id = 'mov-medida-select';
                select.className = 'form-control';
                select.innerHTML = '<option value="">Selecione o Pedaço para Saída...</option>';
                availablePieces.forEach(([medida, qtd]) => {
                    select.innerHTML += `<option value="${medida}">${medida} (${qtd} em estoque)</option>`;
                });
                medidaTextInput.insertAdjacentElement('afterend', select);
            } else {
                 medidaTextInput.style.display = ''; // Mostra o input de texto se não houver pedaços
                 medidaTextInput.placeholder = "Nenhum pedaço em estoque";
                 medidaTextInput.disabled = true;
            }

        } else { // É ENTRADA ou nenhum produto selecionado
            medidaTextInput.style.display = '';
            medidaTextInput.placeholder = "Medida (pedaço/sobra)";
            medidaTextInput.disabled = false;
        }
    }

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
        updateMedidaField(); // Chama a nova função para atualizar o campo
    }

    toggle.addEventListener('change', handleToggleChange);
    document.getElementById('mov-produto').addEventListener('change', updateMedidaField); // Também atualiza ao mudar o produto

    // --- Lógica de Submissão do Formulário Unificado ---
    formMovimentacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEntrada = toggle.checked;
        const productId = document.getElementById('mov-produto').value;

        // --- LÓGICA DE COLETA DE DADOS ADAPTATIVA ---
        const medidaSelect = document.getElementById('mov-medida-select');
        const medidaValue = medidaSelect ? medidaSelect.value : medidaTextInput.value;
        const isPiece = medidaValue && medidaValue.trim() !== '';

        // Para baixa de pedaços, a quantidade é sempre 1. Para outros, é o valor do campo.
        const quantidade = isPiece && !isEntrada ? 1 : parseFloat(document.getElementById('mov-quantidade').value);

        if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto e a quantidade corretamente.');
            return;
        }

        if (isEntrada) {
            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);

                    if (!productDoc.exists()) { throw new Error("Produto não encontrado!"); }

                    const productData = productDoc.data();

                    // --- 1. Lógica de Conversão (Existente) ---
                    const conversaoId = productData.conversaoId;
                    const quantidadeInformada = parseFloat(document.getElementById('mov-quantidade').value);
                    let quantidadeParaEstoque = quantidadeInformada;
                    let quantidadeOriginalCompra = quantidadeInformada;

                    if (conversaoId) {
                        const conversaoRef = doc(db, 'conversoes', conversaoId);
                        const conversaoDoc = await transaction.get(conversaoRef);
                        if (conversaoDoc.exists()) {
                            const regra = conversaoDoc.data();
                            const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                            const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                            if (fator_qtd_compra > 0) {
                                quantidadeParaEstoque = (quantidadeInformada / fator_qtd_compra) * fator_qtd_padrao;
                            }
                            const medidaPadrao = regra.medida_padrao || "";
                            if (medidaPadrao.toUpperCase() === 'PÇ' && !Number.isInteger(quantidadeParaEstoque)) {
                                throw new Error(`O cálculo resultou em um valor quebrado (${quantidadeParaEstoque.toFixed(2)} PÇ). Entradas para esta unidade devem resultar em um número inteiro.`);
                            }
                        }
                    }

                    // --- 2. NOVA LÓGICA DE CÁLCULO DE CUSTO ---
                    const valorUnitario = parseFloat(document.getElementById('mov-valor-unitario').value) || 0;
                    const icms = parseFloat(document.getElementById('mov-icms').value) || 0;
                    const ipi = parseFloat(document.getElementById('mov-ipi').value) || 0;
                    const frete = parseFloat(document.getElementById('mov-frete').value) || 0;

                    // Calcula o custo base
                    let custoTotalEntrada = (quantidadeOriginalCompra * valorUnitario) + icms + ipi + frete;

                    // Busca o fornecedor e aplica o imposto ST, se houver
                    const fornecedorId = productData.fornecedorId;
                    if (fornecedorId && configData.fornecedores[fornecedorId]) {
                        const fornecedor = configData.fornecedores[fornecedorId];
                        const impostoStPercent = parseFloat(fornecedor.imposto) || 0;
                        if (impostoStPercent > 0) {
                            custoTotalEntrada *= (1 + (impostoStPercent / 100));
                        }
                    }

                    // --- 3. Lógica de Atualização (Existente + Campo Novo) ---
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
                        valor_unitario: valorUnitario,
                        icms: icms,
                        ipi: ipi,
                        frete: frete,
                        observacao: document.getElementById('mov-observacao').value,
                        medida: document.getElementById('mov-medida').value,
                        quantidade: quantidadeParaEstoque,
                        quantidade_compra: quantidadeOriginalCompra,
                        custo_total_entrada: custoTotalEntrada // <-- NOSSO NOVO CAMPO!
                    };

                    transaction.set(movementRef, movementData);
                });
                alert('Entrada registrada com sucesso!');
                formMovimentacao.reset();
                handleToggleChange();
            } catch (error) {
                console.error("Erro na transação de entrada:", error);
                showInfoModal(error.message);
            }
        } else { // Saída
            try {
                // 'medidaValue', 'isPiece', and 'quantidade' are already defined adaptively above.

                // Lógica de Saída para ESTOQUE PADRÃO (sem medida)
                if (!isPiece) {
                    await runTransaction(db, async (transaction) => {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error("Produto não encontrado!");

                        const currentEstoque = productDoc.data().estoque || 0;
                        if (currentEstoque < quantidade) {
                            throw new Error(`Estoque insuficiente! Disponível: ${currentEstoque}`);
                        }

                        const newEstoque = currentEstoque - quantidade;
                        transaction.update(productRef, { estoque: newEstoque });

                        const movementRef = doc(collection(db, 'movimentacoes'));
                        const movementData = {
                            tipo: 'saida',
                            productId,
                            quantidade,
                            data: serverTimestamp(),
                            tipo_saidaId: document.getElementById('mov-tipo-saida').value,
                            requisitante: document.getElementById('mov-requisitante').value,
                            obraId: document.getElementById('mov-obra').value,
                            observacao: document.getElementById('mov-observacao').value,
                            medida: medidaValue,
                        };
                        transaction.set(movementRef, movementData);
                    });
                }
                // Lógica de Saída para PEDAÇOS (com medida)
                else {
                    // 1. Calcular o saldo atual para esta medida específica usando os dados em memória
                    const movementsForThisPiece = allMovements.filter(m => m.productId === productId && m.medida === medidaValue);
                    let saldoDoPedaco = 0;
                    movementsForThisPiece.forEach(mov => {
                        const movQtd = parseFloat(mov.quantidade) || 0;
                        if (mov.tipo === 'entrada') {
                            saldoDoPedaco += movQtd;
                        } else if (mov.tipo === 'saida') {
                            saldoDoPedaco -= movQtd;
                        }
                    });

                    // 2. Validar se há estoque suficiente do pedaço
                    if (saldoDoPedaco < quantidade) { // 'quantidade' for pieces is 1
                        throw new Error(`Estoque de pedaços de '${medidaValue}' insuficiente! Disponível: ${saldoDoPedaco}`);
                    }

                    // 3. Executar a transação (apenas registra o movimento, não altera o produto)
                    await runTransaction(db, async (transaction) => {
                        // Verificação de segurança para garantir que o produto ainda existe
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error("Produto não encontrado no momento da transação!");

                        // Não há alteração no documento do produto, apenas registramos a saída
                        const movementRef = doc(collection(db, 'movimentacoes'));
                        const movementData = {
                            tipo: 'saida',
                            productId,
                            quantidade,
                            medida: medidaValue, // Medida é crucial aqui
                            data: serverTimestamp(),
                            tipo_saidaId: document.getElementById('mov-tipo-saida').value,
                            requisitante: document.getElementById('mov-requisitante').value,
                            obraId: document.getElementById('mov-obra').value,
                            observacao: document.getElementById('mov-observacao').value
                        };
                        transaction.set(movementRef, movementData);
                    });
                }

                alert('Saída registrada com sucesso!');
                formMovimentacao.reset();
                handleToggleChange(); // Reseta o formulário para o estado inicial
            } catch (error) {
                console.error("Erro ao registrar saída:", error);
                showInfoModal(error.message);
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
             const optionText = `${product.codigo || 'S/C'} - ${product.descricao || 'N/A'}`.trim();
             productSelect.innerHTML += `<option value="${doc.id}">${optionText}</option>`;
        });

        configData.tipos_entrada = await loadConfigToSelect(tipoEntradaSelect, 'tipos_entrada', 'nome');
        configData.tipos_saida = await loadConfigToSelect(tipoSaidaSelect, 'tipos_saida', 'nome');
        configData.obras = await loadConfigToSelect(obraSelect, 'obras', 'nome');
        configData.fornecedores = await loadConfigToMap('fornecedores');
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

    async function loadConfigToMap(collectionName) {
        const snapshot = await getDocs(collection(db, collectionName));
        const items = {};
        snapshot.forEach(doc => {
            items[doc.id] = doc.data();
        });
        return items;
    }

    function updateProductInfo() {
        const productId = document.getElementById('mov-produto').value;
        const product = productsMap[productId];

        document.getElementById('mov-codigo-display').textContent = product ? product.codigo : '-';
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
                let valorTotal;
                // Prioriza o novo campo 'custo_total_entrada' se ele existir
                if (mov.custo_total_entrada !== undefined) {
                    valorTotal = mov.custo_total_entrada;
                } else {
                    // Fallback para registros antigos: calcula da forma antiga
                    valorTotal = (mov.quantidade_compra * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                }
                // O custo unitário é o custo total dividido pela quantidade que efetivamente entrou no estoque
                custoUnitario = valorTotal / mov.quantidade;
            }
            return {
                ...mov,
                _search_data: {
                    data: mov.data ? new Date(mov.data.seconds * 1000).toLocaleString('pt-BR') : '',
                    tipo: mov.tipo || '',
                    codigo: product.codigo || '',
                    descricao: product.descricao || '',
                    un: product.un || '',
                    quantidade: mov.quantidade?.toString() || '',
                    medida: mov.medida || '',
                    nf: mov.nf || '',
                    valor_unitario: (mov.valor_unitario || 0).toString(),
                    icms: (mov.icms || 0).toString(),
                    ipi: (mov.ipi || 0).toString(),
                    frete: (mov.frete || 0).toString(),
                    custoUnitario: custoUnitario > 0 ? custoUnitario.toFixed(2) : '0.00',
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
            const valorUnitarioFmt = mov.valor_unitario ? mov.valor_unitario.toFixed(2) : '-';
            const icmsFmt = mov.icms ? mov.icms.toFixed(2) : '-';
            const ipiFmt = mov.ipi ? mov.ipi.toFixed(2) : '-';
            const freteFmt = mov.frete ? mov.frete.toFixed(2) : '-';
            const custoUnitarioFmt = parseFloat(searchData.custoUnitario) > 0 ? searchData.custoUnitario : '-';

            row.innerHTML = `
                <td>${searchData.data}</td>
                <td class="${searchData.tipo}">${searchData.tipo.toUpperCase()}</td>
                <td>${searchData.codigo || 'N/A'}</td>
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
