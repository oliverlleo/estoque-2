function showInfoModal(message) {
    document.getElementById('info-modal-message').textContent = message;
    document.getElementById('info-modal').style.display = 'block';
}

import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, onSnapshot, runTransaction, doc, serverTimestamp, query, where, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

async function calcularCustoMedioProduto(produtoId) {
    const q = query(collection(db, 'movimentacoes'), where("productId", "==", produtoId));
    const movementsSnapshot = await getDocs(q);
    const productMovements = [];
    movementsSnapshot.forEach(doc => {
        productMovements.push(doc.data());
    });

    const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && (m.custo_total_entrada || 0) > 0);
    let totalCost = 0;
    let totalQuantityForAvg = 0;

    entryMovements.forEach(m => {
        totalCost += m.custo_total_entrada;
        totalQuantityForAvg += m.quantidade;
    });

    return totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;
}


document.addEventListener('DOMContentLoaded', async function() {
    const infoModal = document.getElementById('info-modal');
    const infoModalClose = document.getElementById('info-modal-close');
    infoModalClose.onclick = () => infoModal.style.display = 'none';

    window.addEventListener('click', (event) => {
        if (event.target == infoModal) {
            infoModal.style.display = 'none';
        }
    });

    const formMovimentacao = document.getElementById('form-movimentacao');
    const toggle = document.getElementById('movement-toggle');
    const btnMovimentacao = document.getElementById('btn-movimentacao');
    const tableBody = document.querySelector('#table-movimentacoes tbody');
    const xmlImportModal = document.getElementById('xml-import-modal');
    const btnImportarXml = document.getElementById('btn-importar-xml');
    const xmlModalClose = document.getElementById('xml-modal-close');
    const xmlFileInput = document.getElementById('xml-file-input');
    const xmlProductsTableBody = document.querySelector('#xml-products-table tbody');
    const btnConfirmarXmlImport = document.getElementById('btn-confirmar-xml-import');
    const inputNfeNumero = document.getElementById('xml-nfe-numero');
    const cadastroProdutoModal = document.getElementById('cadastro-produto-modal');
    const formNovoProdutoModal = document.getElementById('form-novo-produto-modal');
    const btnFecharModalCadastro = document.getElementById('cadastro-produto-modal-close');
    let linhaAtualParaAtualizar = null;

    const entradaFields = [
        document.getElementById('mov-tipo-entrada'), document.getElementById('mov-nf'),
        document.getElementById('mov-valor-unitario'), document.getElementById('mov-icms'),
        document.getElementById('mov-ipi'), document.getElementById('mov-frete')
    ];
    const saidaFields = [
        document.getElementById('mov-tipo-saida'), document.getElementById('mov-requisitante'),
        document.getElementById('mov-estoque-display-wrapper')
    ];

    let productsMap = {};
    let configData = {};
    let allMovements = [];
    let initialDataLoaded = false;

    let sortState = { column: 'data', direction: 'desc' };
    let filterState = {};

    function toggleValorUnitarioRequirement() {
        const isEntrada = toggle.checked;
        const valorUnitarioInput = document.getElementById('mov-valor-unitario');
        if (isEntrada) {
            const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
            const tipoConfig = configData.tipos_entrada[tipoEntradaId];
            if (tipoConfig && tipoConfig.informa_valor_unitario === true) {
                valorUnitarioInput.required = true;
                valorUnitarioInput.classList.add('required-field-visual-input');
            } else {
                valorUnitarioInput.required = false;
                valorUnitarioInput.classList.remove('required-field-visual-input');
            }
        } else {
            valorUnitarioInput.required = false;
            valorUnitarioInput.classList.remove('required-field-visual-input');
        }
    }

    function toggleObraRequirement() {
        const isEntrada = toggle.checked;
        const obraSelect = document.getElementById('mov-obra');
        if (isEntrada) {
            obraSelect.required = false;
            obraSelect.parentElement.classList.remove('required-field-visual');
            return;
        }
        const tipoSaidaId = document.getElementById('mov-tipo-saida').value;
        const tipoConfig = configData.tipos_saida[tipoSaidaId];
        if (tipoConfig && tipoConfig.informa_obra === true) {
            obraSelect.required = true;
            obraSelect.parentElement.classList.add('required-field-visual');
        } else {
            obraSelect.required = false;
            obraSelect.parentElement.classList.remove('required-field-visual');
        }
    }

    async function updateProductInfo() {
        const productId = document.getElementById('mov-produto').value;
        const product = productsMap[productId];
        const locacaoSelect = document.getElementById('mov-locacao');
        const estoqueDisplay = document.getElementById('mov-estoque-display');

        document.getElementById('mov-codigo-display').textContent = product ? product.codigo : '-';
        document.getElementById('mov-descricao-display').textContent = product ? product.descricao : '-';
        document.getElementById('mov-un-display').textContent = product ? product.un : '-';
        estoqueDisplay.textContent = '-';
        locacaoSelect.innerHTML = '<option value="">Selecione a Locação...</option>';
        locacaoSelect.style.display = 'none';

        if (!product) return;

        const isEntrada = toggle.checked;
        const locacoes = product.locacoes || [];

        if (locacoes.length > 0) {
            locacaoSelect.style.display = 'block';
            if (isEntrada) {
                locacoes.forEach(loc => {
                    const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                    const option = new Option(`${localNome} - ${loc.codigo}`, loc.codigo);
                    locacaoSelect.appendChild(option);
                });
                estoqueDisplay.textContent = 'N/A (Entrada)';
            } else {
                const promises = locacoes.map(loc => getDoc(doc(db, 'produtos', productId, 'estoquePorLocacao', loc.codigo)));
                const estoqueDocs = await Promise.all(promises);

                let totalEstoque = 0;
                locacaoSelect.innerHTML = '<option value="">Selecione a Locação...</option>';

                estoqueDocs.forEach((estoqueDoc, index) => {
                    const loc = locacoes[index];
                    const quantidade = estoqueDoc.exists() ? estoqueDoc.data().quantidade : 0;
                    totalEstoque += quantidade;

                    if (quantidade > 0) {
                        const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                        const optionText = `${localNome} - ${loc.codigo} (Estoque: ${quantidade})`;
                        const option = new Option(optionText, loc.codigo);
                        locacaoSelect.appendChild(option);
                    }
                });
                estoqueDisplay.textContent = totalEstoque;
            }
        } else {
            estoqueDisplay.textContent = 'Produto sem locações';
        }
    }

    function updateTable() {
        // This function remains largely the same as it reads from the flattened movement history.
        // We just need to ensure new movements have the right data.
        // A small addition could be to display the location.
        let processedMovements = allMovements.map(mov => {
            const product = productsMap[mov.productId] || {};
            let custoUnitario = 0;
            if (mov.tipo === 'entrada' && mov.quantidade > 0) {
                let valorTotal = mov.custo_total_entrada !== undefined ? mov.custo_total_entrada : (mov.quantidade_compra * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                custoUnitario = valorTotal / mov.quantidade;
            }

            const locacaoInfo = mov.locacaoCodigo || '';

            const processedMov = {
                ...mov,
                custoUnitario,
                _search_data: {
                    data: mov.data ? new Date(mov.data.seconds * 1000).toLocaleString('pt-BR') : '',
                    tipo: mov.tipo || '',
                    codigo: product.codigo || '',
                    descricao: product.descricao || '',
                    un: product.un || '',
                    locacao: locacaoInfo,
                    quantidade: mov.quantidade?.toString() || '',
                    nf: mov.nf || '',
                    valor_unitario: (mov.valor_unitario || 0).toString(),
                    requisitante: mov.requisitante || '',
                    obraId: configData.obras?.[mov.obraId]?.nome || '',
                    observacao: mov.observacao || ''
                }
            };
            return processedMov;
        });

        // Filtering and sorting logic remains the same.
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
            let valA = a.data ? a.data.toMillis() : 0;
            let valB = b.data ? b.data.toMillis() : 0;
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
            const custoUnitarioFmt = mov.custoUnitario > 0 ? mov.custoUnitario.toFixed(2) : '-';

            row.innerHTML = `
                <td>${searchData.data}</td>
                <td class="${searchData.tipo}">${searchData.tipo.toUpperCase()}</td>
                <td>${searchData.codigo || 'N/A'}</td>
                <td>${searchData.descricao || 'Produto não encontrado'}</td>
                <td>${searchData.locacao}</td>
                <td>${searchData.quantidade}</td>
                <td>${searchData.nf || '-'}</td>
                <td>${custoUnitarioFmt}</td>
                <td>${searchData.requisitante || '-'}</td>
                <td>${searchData.obraId || '-'}</td>
                <td>${searchData.observacao || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function handleToggleChange() {
        const isEntrada = toggle.checked;
        btnImportarXml.style.display = isEntrada ? 'inline-block' : 'none';
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
        toggleObraRequirement();
        toggleValorUnitarioRequirement();
    }

    formMovimentacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEntrada = toggle.checked;
        const productId = document.getElementById('mov-produto').value;
        const quantidade = parseFloat(document.getElementById('mov-quantidade').value);
        const locacaoCodigo = document.getElementById('mov-locacao').value;

        if (!productId || isNaN(quantidade) || quantidade <= 0 || !locacaoCodigo) {
            alert('Por favor, preencha produto, quantidade e locação corretamente.');
            return;
        }

        if (isEntrada) {
            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) throw new Error("Produto não encontrado!");

                    const productData = productDoc.data();
                    const conversaoId = productData.conversaoId;
                    let quantidadeParaEstoque = quantidade;

                    if (conversaoId) {
                        const conversaoRef = doc(db, 'conversoes', conversaoId);
                        const conversaoDoc = await transaction.get(conversaoRef);
                        if (conversaoDoc.exists()) {
                            const regra = conversaoDoc.data();
                            const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                            const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                            if (fator_qtd_compra > 0) {
                                quantidadeParaEstoque = (quantidade / fator_qtd_compra) * fator_qtd_padrao;
                            }
                        }
                    }

                    const valorUnitario = parseFloat(document.getElementById('mov-valor-unitario').value) || 0;
                    const icms = parseFloat(document.getElementById('mov-icms').value) || 0;
                    const ipi = parseFloat(document.getElementById('mov-ipi').value) || 0;
                    const frete = parseFloat(document.getElementById('mov-frete').value) || 0;
                    let custoTotalEntrada = (quantidade * valorUnitario) + icms + ipi + frete;

                    const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                    const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];

                    if (tipoEntradaConfig && tipoEntradaConfig.movimenta_estoque === true) {
                        const estoqueRef = doc(db, 'produtos', productId, 'estoquePorLocacao', locacaoCodigo);
                        const estoqueDoc = await transaction.get(estoqueRef);
                        const currentEstoque = estoqueDoc.exists() ? estoqueDoc.data().quantidade : 0;
                        const newEstoque = currentEstoque + quantidadeParaEstoque;

                        if (estoqueDoc.exists()) {
                            transaction.update(estoqueRef, { quantidade: newEstoque });
                        } else {
                            transaction.set(estoqueRef, { quantidade: newEstoque });
                        }
                    }

                    const movementRef = doc(collection(db, 'movimentacoes'));
                    transaction.set(movementRef, {
                        tipo: 'entrada', productId, data: serverTimestamp(),
                        tipo_entradaId, locacaoCodigo,
                        nf: document.getElementById('mov-nf').value,
                        valor_unitario: valorUnitario, icms, ipi, frete,
                        observacao: document.getElementById('mov-observacao').value,
                        quantidade: quantidadeParaEstoque,
                        quantidade_compra: quantidade,
                        custo_total_entrada: custoTotalEntrada
                    });
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
                await runTransaction(db, async (transaction) => {
                    const tipoSaidaId = document.getElementById('mov-tipo-saida').value;
                    const tipoSaidaConfig = configData.tipos_saida[tipoSaidaId];

                    if (tipoSaidaConfig && tipoSaidaConfig.movimenta_estoque === true) {
                        const estoqueRef = doc(db, 'produtos', productId, 'estoquePorLocacao', locacaoCodigo);
                        const estoqueDoc = await transaction.get(estoqueRef);

                        if (!estoqueDoc.exists()) throw new Error(`Estoque não encontrado para a locação selecionada.`);

                        const currentEstoque = estoqueDoc.data().quantidade || 0;
                        if (currentEstoque < quantidade) throw new Error(`Estoque insuficiente na locação! Disponível: ${currentEstoque}`);

                        const newEstoque = currentEstoque - quantidade;
                        transaction.update(estoqueRef, { quantidade: newEstoque });
                    }

                    const movementRef = doc(collection(db, 'movimentacoes'));
                    transaction.set(movementRef, {
                        tipo: 'saida', productId, quantidade, locacaoCodigo, data: serverTimestamp(),
                        tipo_saidaId: tipoSaidaId,
                        requisitante: document.getElementById('mov-requisitante').value,
                        obraId: document.getElementById('mov-obra').value,
                        observacao: document.getElementById('mov-observacao').value,
                    });
                });
                alert('Saída registrada com sucesso!');
                formMovimentacao.reset();
                handleToggleChange();
            } catch (error) {
                console.error("Erro ao registrar saída:", error);
                showInfoModal(error.message);
            }
        }
    });

    async function loadInitialData() {
        const productSelect = document.getElementById('mov-produto');
        const tipoEntradaSelect = document.getElementById('mov-tipo-entrada');
        const tipoSaidaSelect = document.getElementById('mov-tipo-saida');
        const obraSelect = document.getElementById('mov-obra');

        const q = query(collection(db, 'produtos'), where("arquivado", "!=", true));
        const productsSnapshot = await getDocs(q);
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
        configData.locais = await loadConfigToMap('locais');
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

    document.getElementById('mov-produto').addEventListener('change', updateProductInfo);
    toggle.addEventListener('change', handleToggleChange);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-saida').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleValorUnitarioRequirement);

    // Simplified history table logic for now, will need adjustments for location display
    const headers = document.querySelectorAll('#headers-row th');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }
            updateTable();
        });
    });

    document.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('input', (e) => {
            filterState[e.target.dataset.column] = e.target.value;
            updateTable();
        });
    });

    onSnapshot(query(collection(db, 'movimentacoes'), where("tipo", "!=", "reserva")), (snapshot) => {
        allMovements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

async function atualizarCustoMedioProduto(produtoId) {
    if (!produtoId) return;
    const q = query(collection(db, 'movimentacoes'), where("productId", "==", produtoId), where("tipo", "==", "entrada"));
    const movementsSnapshot = await getDocs(q);
    let totalCost = 0;
    let totalQuantityForAvg = 0;
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        if (mov.custo_total_entrada && mov.custo_total_entrada > 0 && mov.quantidade > 0) {
            totalCost += mov.custo_total_entrada;
            totalQuantityForAvg += mov.quantidade;
        }
    });
    const novoCustoMedio = totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;
    await setDoc(doc(db, 'produtos', produtoId), { valorMedio: novoCustoMedio }, { merge: true });
    console.log(`Custo médio do produto ${produtoId} atualizado para ${novoCustoMedio.toFixed(2)}`);
}
