function showInfoModal(message) {
    document.getElementById('info-modal-message').textContent = message;
    document.getElementById('info-modal').style.display = 'block';
}

import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, onSnapshot, runTransaction, doc, serverTimestamp, query, where, getDoc, setDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Adicione esta função em js/movimentacoes.js
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

    // --- Elementos do Modal XML ---
    const xmlImportModal = document.getElementById('xml-import-modal');
    const btnImportarXml = document.getElementById('btn-importar-xml');
    const xmlModalClose = document.getElementById('xml-modal-close');
    const xmlFileInput = document.getElementById('xml-file-input');
    const xmlProductsTableBody = document.querySelector('#xml-products-table tbody');
    const btnConfirmarXmlImport = document.getElementById('btn-confirmar-xml-import');
    const inputNfeNumero = document.getElementById('xml-nfe-numero');

    // --- Elementos do Modal de Cadastro de Produto ---
    const cadastroProdutoModal = document.getElementById('cadastro-produto-modal');
    const formNovoProdutoModal = document.getElementById('form-novo-produto-modal');
    const btnFecharModalCadastro = document.getElementById('cadastro-produto-modal-close');
    let linhaAtualParaAtualizar = null; // Guarda a referência da linha da tabela

    // --- Campos do Formulário ---
    const entradaFields = [
        document.getElementById('entrada-fields-container')
    ];
    const saidaFields = [
        document.getElementById('saida-fields-container')
    ];

    // --- Data Stores ---
    let productsMap = {};
    let configData = {};
    let allMovements = [];
    let initialDataLoaded = false;

    // --- Table State ---
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

    const localSelect = document.getElementById('mov-local');
    const locacaoSelect = document.getElementById('mov-locacao');

    function updateLocacaoRequirement() {
        const localValue = localSelect.value;
        if (localValue) {
            locacaoSelect.required = true;
        } else {
            locacaoSelect.required = false;
        }
    }

    function populateLocacoes(product, selectedLocalId) {
        const isEntrada = document.getElementById('movement-toggle').checked;
        locacaoSelect.innerHTML = '<option value="">Carregando...</option>';

        if (product && selectedLocalId) {
            const locacoesFiltradas = product.locacoes.filter(l => l.localId === selectedLocalId);
            locacaoSelect.innerHTML = '<option value="">Locação...</option>';
            locacoesFiltradas.forEach(loc => {
                const option = document.createElement('option');
                option.value = loc.locacao;
                let text = loc.locacao;
                 if (!isEntrada) {
                    text += ` (Estoque: ${loc.estoque || 0})`;
                }
                option.textContent = text;
                locacaoSelect.appendChild(option);
            });
            locacaoSelect.disabled = false;
            // Pre-seleciona a primeira locação
            if (locacaoSelect.options.length > 1) {
                locacaoSelect.selectedIndex = 1;
            }
        } else {
            locacaoSelect.innerHTML = '<option value="">Selecione o Local...</option>';
            locacaoSelect.disabled = true;
        }
        updateLocacaoRequirement();
    }

    localSelect.addEventListener('change', () => {
        const productId = document.getElementById('mov-produto-id').value;
        const product = productsMap[productId];
        populateLocacoes(product, localSelect.value);
        updateLocacaoRequirement();
    });

    async function updateProductInfo() {
        const productId = document.getElementById('mov-produto-id').value;
        const product = productsMap[productId];
        const isEntrada = document.getElementById('movement-toggle').checked;
        const unitSelect = document.getElementById('mov-unidade-selecao');

        // Reset fields
        localSelect.innerHTML = '<option value="">Local...</option>';
        localSelect.disabled = true;
        locacaoSelect.innerHTML = '<option value="">Locação...</option>';
        locacaoSelect.disabled = true;
        unitSelect.innerHTML = '';
        unitSelect.style.display = 'none';
        document.getElementById('mov-estoque-display-wrapper').style.display = 'none';

        if (product) {
            document.getElementById('mov-codigo-display').textContent = product.codigo;
            document.getElementById('mov-descricao-display').textContent = product.descricao;
            document.getElementById('mov-un-display').textContent = product.un;

            // Populate locais
            if (product.locacoes && product.locacoes.length > 0) {
                const locaisUnicos = [...new Set(product.locacoes.map(l => l.localId))];
                localSelect.innerHTML = '<option value="">Local...</option>';
                locaisUnicos.forEach(localId => {
                    const localNome = configData.locais[localId]?.nome || 'Desconhecido';
                    localSelect.innerHTML += `<option value="${localId}">${localNome}</option>`;
                });
                localSelect.disabled = false;

                // Pre-seleciona o primeiro local e dispara a populacao de locacoes
                if (localSelect.options.length > 1) {
                    localSelect.selectedIndex = 1;
                    populateLocacoes(product, localSelect.value);
                }
            }

            // --- Handle Unit Selection Dropdown ---
            if (isEntrada && product.conversaoId && configData.conversoes[product.conversaoId]) {
                const conversao = configData.conversoes[product.conversaoId];
                const purchaseUnit = conversao.medida_compra;
                const standardUnit = conversao.medida_padrao;

                if (purchaseUnit && standardUnit) {
                    unitSelect.innerHTML = `
                        <option value="${standardUnit}">${standardUnit}</option>
                        <option value="${purchaseUnit}">${purchaseUnit}</option>
                    `;
                    unitSelect.style.display = 'inline-block';
                }
            }
            // --- END OF NEW FEATURE ---

        } else {
            // Clear fields if no product is selected
            document.getElementById('mov-codigo-display').textContent = '-';
            document.getElementById('mov-descricao-display').textContent = '-';
            document.getElementById('mov-un-display').textContent = '-';
        }

        const isSobra = product && product.isSobra === true;
        const costFields = ['mov-valor-unitario', 'mov-icms', 'mov-ipi', 'mov-frete'];
        const quantField = document.getElementById('mov-quantidade');
        const valorUnitarioInput = document.getElementById('mov-valor-unitario');

        if (isEntrada) {
            // Limpa os campos de custo para qualquer produto selecionado
            costFields.forEach(fieldId => {
                document.getElementById(fieldId).value = '';
            });

            if (isSobra) {
                // Para sobras, a quantidade é sempre 1 e não pode ser alterada.
                quantField.value = 1;
                quantField.disabled = true;
                quantField.placeholder = "Entrada de sobra é sempre 1 Unidade";

                // Os campos de custo NÃO são desabilitados.
                costFields.forEach(fieldId => {
                    document.getElementById(fieldId).disabled = false;
                });

                // Preenche o valor unitário como sugestão, mas permite edição.
                valorUnitarioInput.value = '...'; // Valor padrão enquanto calcula
                try {
                    // **BUG FIX**: Fetch the full product document to get the originalProductId
                    const productRef = doc(db, "produtos", productId);
                    const productSnap = await getDoc(productRef);
                    if (productSnap.exists() && productSnap.data().originalProductId) {
                        const originalProductId = productSnap.data().originalProductId;
                        const custoMedio = await calcularCustoMedioProduto(originalProductId);
                        valorUnitarioInput.value = custoMedio > 0 ? custoMedio.toFixed(3) : '0.000';
                    } else {
                        valorUnitarioInput.value = '0.000';
                        console.warn(`Sobra ${productId} não tem um originalProductId ou não foi encontrada.`);
                    }
                } catch (error) {
                    console.error("Erro ao buscar custo médio da sobra:", error);
                    valorUnitarioInput.value = '0.00';
                }

            } else {
                // Para produtos normais, a quantidade é editável.
                quantField.value = '';
                quantField.disabled = false;
                quantField.placeholder = "Quantidade";
                costFields.forEach(fieldId => {
                    document.getElementById(fieldId).disabled = false;
                });
            }
        } else { // Se for Saída
            costFields.forEach(fieldId => document.getElementById(fieldId).disabled = false);
            quantField.disabled = false;
            quantField.placeholder = "Quantidade";
        }
    }

    // --- Lógica da Tabela de Histórico ---
    function updateTable() {
        let processedMovements = allMovements.map(mov => {
            const product = productsMap[mov.productId] || {};
            let custoUnitario = 0;
            if (mov.tipo === 'entrada' && mov.quantidade > 0) {
                let valorTotal;
                if (mov.custo_total_entrada !== undefined) {
                    valorTotal = mov.custo_total_entrada;
                } else {
                    valorTotal = (mov.quantidade_compra * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                }
                custoUnitario = valorTotal / mov.quantidade;
            } else if (mov.tipo === 'saida') {
                custoUnitario = mov.valorMedioHistorico || 0;
            }

            const isXmlImport = mov.observacao && mov.observacao.includes('Importado via XML');
            let subTipo = '-';
            if (isXmlImport) {
                subTipo = 'Importação NF';
            } else if (mov.tipo === 'entrada' && mov.tipo_entradaId) {
                subTipo = configData.tipos_entrada?.[mov.tipo_entradaId]?.nome || 'N/A';
            } else if (mov.tipo === 'saida' && mov.tipo_saidaId) {
                subTipo = configData.tipos_saida?.[mov.tipo_saidaId]?.nome || 'N/A';
            }

            let icmsUnit = 0, ipiUnit = 0, freteUnit = 0;
            if (isXmlImport && mov.quantidade_compra > 0) {
                icmsUnit = (mov.icms || 0) / mov.quantidade_compra;
                ipiUnit = (mov.ipi || 0) / mov.quantidade_compra;
                freteUnit = (mov.frete || 0) / mov.quantidade_compra;
            }

            const quantidadeDisplay = isXmlImport ? mov.quantidade_compra : mov.quantidade;
            const unidadeDisplay = mov.un_compra || product.un;

            const custoTotal = custoUnitario * mov.quantidade;
            let valorUnitEstoque = 0;
            if (mov.tipo === 'entrada' && product.conversaoId && configData.conversoes[product.conversaoId]) {
                const conversao = configData.conversoes[product.conversaoId];
                const fator_qtd_compra = parseFloat(String(conversao.qtd_compra).replace(',', '.'));
                valorUnitEstoque = fator_qtd_compra * (mov.valor_unitario || 0);
            }

            const processedMov = {
                ...mov,
                valorUnitEstoque: valorUnitEstoque,
                custoUnitario: custoUnitario,
                custoTotal: custoTotal,
                icmsUnit: icmsUnit,
                ipiUnit: ipiUnit,
                freteUnit: freteUnit,
                _search_data: {
                    data: mov.data ? new Date(mov.data.seconds * 1000).toLocaleString('pt-BR') : '',
                    tipo: mov.tipo || '',
                    subTipo: subTipo,
                    codigo: product.codigo || '',
                    descricao: product.descricao || '',
                    un: unidadeDisplay || '',
                    quantidade: quantidadeDisplay?.toString() || '',
                    nf: mov.nf || '',
                    valor_unitario: (mov.valor_unitario || 0).toString(),
                    valor_unit_estoque: (mov.valorUnitEstoque || 0).toString(),
                    icms: (mov.icms || 0).toString(),
                    ipi: (mov.ipi || 0).toString(),
                    frete: (mov.frete || 0).toString(),
                    custoUnitario: custoUnitario > 0 ? custoUnitario.toFixed(3) : '0.000',
                    custoTotal: mov.custoTotal > 0 ? mov.custoTotal.toFixed(2) : '0.00',
                    requisitante: mov.requisitante || '',
                    obraId: configData.obras?.[mov.obraId]?.nome || '',
                    observacao: mov.observacao || '',
                    fornecedorId: product.fornecedorId || ''
                }
            };
            return processedMov;
        });

        let filteredMovements = processedMovements.filter(mov => {
            // Lógica de filtro de data (CORRIGIDA)
            const startDateString = filterState['data-inicio'];
            const endDateString = filterState['data-fim'];
            const moveDate = mov.data ? mov.data.toDate() : null;

            if (startDateString || endDateString) {
                if (!moveDate) return false; // Se há filtro de data, mas o movimento não tem data, ele é filtrado.

                const moveDateOnly = new Date(moveDate.getFullYear(), moveDate.getMonth(), moveDate.getDate());

                if (startDateString) {
                    const [year, month, day] = startDateString.split('-').map(Number);
                    const startDate = new Date(year, month - 1, day);
                    if (moveDateOnly < startDate) return false;
                }
                if (endDateString) {
                    const [year, month, day] = endDateString.split('-').map(Number);
                    const endDate = new Date(year, month - 1, day);
                    if (moveDateOnly > endDate) return false;
                }
            }
            // Lógica para outros filtros
            for (const column in filterState) {
                // Pula as chaves de data que já foram tratadas
                if (column === 'data-inicio' || column === 'data-fim') continue;

                const filterValue = filterState[column];
                if (!filterValue) continue;

                const lowerCaseFilterValue = filterValue.toLowerCase();
                const cellValue = mov._search_data[column];

                if (column === 'fornecedorId') {
                    if (cellValue !== filterValue) {
                        return false;
                    }
                } else if (column === 'nf') {
                    const lowerCaseCellValue = cellValue?.toLowerCase();
                    if (lowerCaseCellValue === undefined || !lowerCaseCellValue.includes(lowerCaseFilterValue)) {
                        return false;
                    }
                } else {
                    const lowerCaseCellValue = cellValue?.toLowerCase();
                    if (lowerCaseCellValue === undefined || !lowerCaseCellValue.includes(lowerCaseFilterValue)) {
                        return false;
                    }
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
            const numericColumns = ['quantidade', 'valor_unitario', 'icms', 'ipi', 'frete', 'custoUnitario', 'custoTotal'];
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
        let totalCusto = 0;

        data.forEach(mov => {
            if (mov.custoTotal && mov.custoTotal > 0) {
                totalCusto += mov.custoTotal;
            }

            const row = document.createElement('tr');
            const searchData = mov._search_data;
            const product = productsMap[mov.productId] || {};
            const standardUnit = product.un || '';

            let quantidadeCellHtml = '';
            // Use toFixed to avoid floating point comparison issues
            const qtyCompra = mov.quantidade_compra ? Number(mov.quantidade_compra).toFixed(4) : null;
            const qtyEstoque = mov.quantidade ? Number(mov.quantidade).toFixed(4) : null;

            if (mov.tipo === 'entrada' && qtyCompra && mov.un_compra && qtyCompra !== qtyEstoque) {
                quantidadeCellHtml = `${Number(mov.quantidade_compra).toLocaleString('pt-BR')} ${mov.un_compra} <span style="color: red; font-weight: bold;">&rarr;</span> ${Number(mov.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${standardUnit}`;
            } else {
                quantidadeCellHtml = Number(mov.quantidade).toLocaleString('pt-BR');
            }

            const valorUnitarioFmt = mov.valor_unitario ? parseFloat(mov.valor_unitario).toFixed(3).replace('.', ',') : '-';
            const valorUnitEstoqueFmt = mov.valorUnitEstoque > 0 ? mov.valorUnitEstoque.toFixed(2).replace('.', ',') : '-';
            const icmsFmt = mov.icms ? parseFloat(mov.icms).toFixed(2).replace('.', ',') : '-';
            const ipiFmt = mov.ipi ? parseFloat(mov.ipi).toFixed(2).replace('.', ',') : '-';
            const freteFmt = mov.frete ? parseFloat(mov.frete).toFixed(2).replace('.', ',') : '-';
            const custoUnitarioFmt = mov.custoUnitario > 0 ? mov.custoUnitario.toFixed(3).replace('.', ',') : '-';
            const custoTotalFmt = mov.custoTotal > 0 ? mov.custoTotal.toFixed(2).replace('.', ',') : '-';

            const icmsTitle = mov.icmsUnit > 0 ? `Valor Unit.: ${mov.icmsUnit.toFixed(2).replace('.', ',')}` : '';
            const ipiTitle = mov.ipiUnit > 0 ? `Valor Unit.: ${mov.ipiUnit.toFixed(2).replace('.', ',')}` : '';
            const freteTitle = mov.freteUnit > 0 ? `Valor Unit.: ${mov.freteUnit.toFixed(2).replace('.', ',')}` : '';

            row.innerHTML = `
                <td>${searchData.data}</td>
                <td class="${searchData.tipo}">${searchData.tipo === 'reserva_cancelada' ? 'RESERVA CANCELADA' : searchData.tipo.toUpperCase()}</td>
                <td>${searchData.subTipo}</td>
                <td>${searchData.codigo || 'N/A'}</td>
                <td>${searchData.descricao || 'Produto não encontrado'}</td>
                <td>${searchData.un || 'N/A'}</td>
                <td>${quantidadeCellHtml}</td>
                <td>${searchData.nf || '-'}</td>
                <td>${valorUnitarioFmt}</td>
                <td>${valorUnitEstoqueFmt}</td>
                <td title="${icmsTitle}">${icmsFmt}</td>
                <td title="${ipiTitle}">${ipiFmt}</td>
                <td title="${freteTitle}">${freteFmt}</td>
                <td>${custoUnitarioFmt}</td>
                <td>${custoTotalFmt}</td>
                <td>${searchData.requisitante || '-'}</td>
                <td>${searchData.obraId || '-'}</td>
                <td>${searchData.observacao || '-'}</td>
            `;
            tableBody.appendChild(row);
        });

        document.getElementById('total-custo-valor').textContent = totalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    async function handleToggleChange() {
        const isEntrada = toggle.checked;
        btnImportarXml.style.display = isEntrada ? 'inline-block' : 'none';
        btnTransferencia.style.display = isEntrada ? 'none' : 'inline-block';
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
        await updateProductInfo();
        toggleObraRequirement();
        toggleValorUnitarioRequirement();
    }

    toggle.addEventListener('change', handleToggleChange);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-saida').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleValorUnitarioRequirement);

    formMovimentacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEntrada = toggle.checked;
        const productId = document.getElementById('mov-produto-id').value;
        const locacaoSelecionada = document.getElementById('mov-locacao').value;
        const quantidade = parseFloat(document.getElementById('mov-quantidade').value);

        if (isEntrada) {
            if (!productId || isNaN(quantidade) || quantidade <= 0) {
                alert('Por favor, preencha o produto e a quantidade corretamente.');
                return;
            }
            const localSelecionado = document.getElementById('mov-local').value;
            if (localSelecionado && !locacaoSelecionada) {
                alert('Ao selecionar um Local, a Locação se torna obrigatória.');
                return;
            }
        } else { // Saída ou Transferência
             if (!productId || !locacaoSelecionada || isNaN(quantidade) || quantidade <= 0) {
                alert('Para saídas, o produto, a locação e a quantidade são obrigatórios.');
                return;
            }
        }


        if (isEntrada) {
            const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
            if (!tipoEntradaId) {
                alert('Por favor, selecione o Tipo de Entrada.');
                return;
            }
            // LÓGICA DE ENTRADA NORMAL (a lógica de sobra foi ignorada por enquanto)
            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) { throw new Error("Produto não encontrado!"); }

                    const productData = productDoc.data();
                    let locacoes = productData.locacoes || [];

                    // Lógica de conversão condicional
                    const conversaoId = productData.conversaoId;
                    let quantidadeParaEstoque = quantidade;

                    if (conversaoId) {
                        const conversaoRef = doc(db, 'conversoes', conversaoId);
                        const conversaoDoc = await transaction.get(conversaoRef);
                        if (conversaoDoc.exists()) {
                            const regra = conversaoDoc.data();
                            const selectedUnit = document.getElementById('mov-unidade-selecao').value;
                            const purchaseUnit = regra.medida_compra;

                            // Only run conversion if the selected unit is the purchase unit
                            if (selectedUnit === purchaseUnit) {
                                const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                                const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                                if (fator_qtd_compra > 0) {
                                    quantidadeParaEstoque = (quantidade / fator_qtd_compra) * fator_qtd_padrao;
                                    if (quantidadeParaEstoque % 1 !== 0) {
                                        throw new Error("A conversão de unidade resultou em um valor fracionado (" + quantidadeParaEstoque.toFixed(3) + "). Apenas números inteiros são permitidos na entrada de estoque.");
                                    }
                                }
                            }
                        }
                    }

                    const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                    const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];

                    if (tipoEntradaConfig && tipoEntradaConfig.movimenta_estoque == true) {
                        if (locacaoSelecionada) {
                            const locacaoIndex = locacoes.findIndex(l => l.locacao === locacaoSelecionada);
                             if (locacaoIndex === -1) {
                                throw new Error("Locação selecionada não encontrada no produto.");
                            }
                            locacoes[locacaoIndex].estoque = (locacoes[locacaoIndex].estoque || 0) + quantidadeParaEstoque;
                            transaction.update(productRef, { locacoes: locacoes });
                        } else {
                            const novoEstoque = (productData.estoque || 0) + quantidadeParaEstoque;
                            transaction.update(productRef, { estoque: novoEstoque });
                        }
                    }

                    // Cálculo de custo (mantido)
                    const valorUnitario = parseFloat(document.getElementById('mov-valor-unitario').value) || 0;
                    const icms = parseFloat(document.getElementById('mov-icms').value) || 0;
                    const ipi = parseFloat(document.getElementById('mov-ipi').value) || 0;
                    const frete = parseFloat(document.getElementById('mov-frete').value) || 0;
                    let custoTotalEntrada = (quantidade * valorUnitario) + icms + ipi + frete;

                    // Criação do documento de movimentação
                    const selectedUnit = document.getElementById('mov-unidade-selecao').value;
                    const movementRef = doc(collection(db, 'movimentacoes'));
                    const movementData = {
                        tipo: 'entrada',
                        productId,
                        locacao: locacaoSelecionada, // Campo novo
                        un_compra: selectedUnit || productData.un, // Salva a unidade de compra selecionada
                        data: serverTimestamp(),
                        tipo_entradaId: tipoEntradaId,
                        nf: document.getElementById('mov-nf').value,
                        valor_unitario: valorUnitario,
                        icms: icms,
                        ipi: ipi,
                        frete: frete,
                        observacao: document.getElementById('mov-observacao-entrada').value,
                        quantidade: quantidadeParaEstoque,
                        quantidade_compra: quantidade,
                        custo_total_entrada: custoTotalEntrada
                    };
                    transaction.set(movementRef, movementData);
                });
                alert('Entrada registrada com sucesso!');

                // Após a transação, verifica se precisa atualizar o custo médio
                const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];
                if (tipoEntradaConfig && tipoEntradaConfig.recalcula_custo_medio) {
                    await atualizarCustoMedioProduto(productId);
                }

                // ATUALIZA O MAPA DE PRODUTOS LOCAL (FORMA ROBUSTA)
                const productRef = doc(db, 'produtos', productId);
                const updatedDoc = await getDoc(productRef);
                if (updatedDoc.exists()) {
                    productsMap[productId] = { id: productId, ...updatedDoc.data() };
                }

                formMovimentacao.reset();
                handleToggleChange();
            } catch (error) {
                console.error("Erro na transação de entrada:", error);
                showInfoModal(error.message);
            }
        } else { // Saída
            const tipoSaidaId = document.getElementById('mov-tipo-saida').value;
            if (!tipoSaidaId) {
                alert('Por favor, selecione o Tipo de Saída.');
                return;
            }
            const tipoSaidaConfig = configData.tipos_saida[tipoSaidaId];

            if (tipoSaidaConfig && tipoSaidaConfig.reservar_estoque == true) {
                // Lógica de Reserva
                try {
                    await addDoc(collection(db, 'movimentacoes'), {
                        tipo: 'reserva',
                        productId,
                        locacao: locacaoSelecionada, // Campo novo
                        quantidade,
                        data: serverTimestamp(),
                        tipo_saidaId: tipoSaidaId,
                        requisitante: document.getElementById('mov-requisitante').value,
                        obraId: document.getElementById('mov-obra').value,
                        observacao: document.getElementById('mov-observacao-saida').value,
                    });
                    alert('Reserva registrada com sucesso!');
                    formMovimentacao.reset();
                    handleToggleChange();
                } catch (error) {
                    console.error("Erro ao registrar reserva:", error);
                    showInfoModal(error.message);
                }
            } else {
                // Lógica de Saída Normal
                // Validação de estoque ANTES da transação
                const productData = productsMap[productId];
                const locacaoData = productData.locacoes.find(l => l.locacao === locacaoSelecionada);
                if (!locacaoData || (locacaoData.estoque || 0) < quantidade) {
                    alert(`Estoque insuficiente na locação ${locacaoSelecionada}! Disponível: ${locacaoData?.estoque || 0}`);
                    return;
                }

                try {
                    await runTransaction(db, async (transaction) => {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error("Produto não encontrado!");

                        const pData = productDoc.data();
                        const locacoes = pData.locacoes || [];
                        const locacaoIndex = locacoes.findIndex(l => l.locacao === locacaoSelecionada);

                        if (locacaoIndex === -1) {
                            throw new Error("Locação selecionada não encontrada no produto.");
                        }

                        // A verificação do tipo de saída já foi feita, aqui só verificamos se movimenta estoque
                        if (tipoSaidaConfig && tipoSaidaConfig.movimenta_estoque == true) {
                            // Re-valida o estoque dentro da transação para segurança
                            if ((locacoes[locacaoIndex].estoque || 0) < quantidade) {
                               throw new Error(`Estoque insuficiente na locação ${locacaoSelecionada}! Disponível: ${locacoes[locacaoIndex].estoque || 0}`);
                            }
                            locacoes[locacaoIndex].estoque -= quantidade;
                            transaction.update(productRef, { locacoes: locacoes });
                        }

                        const movementRef = doc(collection(db, 'movimentacoes'));
                        transaction.set(movementRef, {
                            tipo: 'saida',
                            productId,
                            locacao: locacaoSelecionada,
                            quantidade,
                            data: serverTimestamp(),
                            tipo_saidaId: tipoSaidaId,
                            requisitante: document.getElementById('mov-requisitante').value,
                            obraId: document.getElementById('mov-obra').value,
                            observacao: document.getElementById('mov-observacao-saida').value,
                            valorMedioHistorico: pData.valorMedio || 0
                        });
                    });
                    alert('Saída registrada com sucesso!');

                    // ATUALIZA O MAPA DE PRODUTOS LOCAL (FORMA ROBUSTA)
                    // Recarrega os dados do produto do banco de dados para garantir consistência.
                    const productRef = doc(db, 'produtos', productId);
                    const updatedDoc = await getDoc(productRef);
                    if (updatedDoc.exists()) {
                        productsMap[productId] = { id: productId, ...updatedDoc.data() };
                    }
                    formMovimentacao.reset();
                    handleToggleChange();
                } catch (error) {
                    console.error("Erro ao registrar saída:", error);
                    showInfoModal(error.message);
                }
            }
        }
    });


    // --- LÓGICA PARA TRANSFERÊNCIA DE ESTOQUE ---
    const transferenciaModal = document.getElementById('transferencia-modal');
    const btnTransferencia = document.getElementById('btn-transferencia');
    const closeTransferenciaModal = document.getElementById('transferencia-modal-close');
    const formTransferencia = document.getElementById('form-transferencia');
    const transfProdutoSelect = document.getElementById('transf-produto');
    const transfOrigemSelect = document.getElementById('transf-locacao-origem');
    const transfDestinoSelect = document.getElementById('transf-locacao-destino');

    // Abre o modal
    btnTransferencia.addEventListener('click', () => {
        transferenciaModal.style.display = 'block';
        // Popula o dropdown de produtos no modal, se ainda não estiver populado
        if (transfProdutoSelect.options.length <= 1) {
            for (const productId in productsMap) {
                const product = productsMap[productId];
                const option = document.createElement('option');
                option.value = productId;
                option.textContent = `${product.codigo} - ${product.descricao}`;
                transfProdutoSelect.appendChild(option);
            }
        }
    });

    // Fecha o modal
    closeTransferenciaModal.addEventListener('click', () => {
        transferenciaModal.style.display = 'none';
    });

    // Lógica de seleção de produto no modal de transferência
    transfProdutoSelect.addEventListener('change', () => {
        const productId = transfProdutoSelect.value;
        const product = productsMap[productId];

        // Limpa e desabilita os selects de locação
        transfOrigemSelect.innerHTML = '<option value="">Origem...</option>';
        transfOrigemSelect.disabled = true;
        transfDestinoSelect.innerHTML = '<option value="">Destino...</option>';
        transfDestinoSelect.disabled = true;
        document.getElementById('transf-estoque-origem-display').textContent = '0';
        document.getElementById('transf-codigo-display').textContent = '-';
        document.getElementById('transf-descricao-display').textContent = '-';

        if (product) {
            document.getElementById('transf-codigo-display').textContent = product.codigo;
            document.getElementById('transf-descricao-display').textContent = product.descricao;

            // Popula locações de ORIGEM (apenas com estoque)
            if (product.locacoes && product.locacoes.length > 0) {
                product.locacoes.forEach(loc => {
                    if (loc.estoque > 0) {
                        const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                        const option = document.createElement('option');
                        option.value = loc.locacao;
                        option.textContent = `${loc.locacao} (${localNome}) (Estoque: ${loc.estoque})`;
                        transfOrigemSelect.appendChild(option);
                    }
                });
            }

            // Adiciona a opção "Sem Origem" se houver estoque sem locação
            if (product.estoque > 0) {
                const option = document.createElement('option');
                option.value = 'sem_origem';
                option.textContent = `Sem Origem (Estoque: ${product.estoque})`;
                transfOrigemSelect.appendChild(option);
            }

            // Popula locações de DESTINO (todas)
            if (product.locacoes && product.locacoes.length > 0) {
                 product.locacoes.forEach(loc => {
                    const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                    const option = document.createElement('option');
                    option.value = loc.locacao;
                    option.textContent = `${loc.locacao} (${localNome})`;
                    transfDestinoSelect.appendChild(option);
                });
                transfDestinoSelect.disabled = false;
            }

            // Habilita o select de origem se houver alguma opção
            if (transfOrigemSelect.options.length > 1) {
                transfOrigemSelect.disabled = false;
            }
        }
    });

    // Lógica de seleção de locação de origem
    transfOrigemSelect.addEventListener('change', () => {
        const productId = transfProdutoSelect.value;
        const product = productsMap[productId];
        const origem = transfOrigemSelect.value;
        const estoqueDisplay = document.getElementById('transf-estoque-origem-display');

        if (product && origem) {
            if (origem === 'sem_origem') {
                estoqueDisplay.textContent = product.estoque || '0';
            } else {
                const locacaoData = product.locacoes.find(l => l.locacao === origem);
                estoqueDisplay.textContent = locacaoData ? locacaoData.estoque : '0';
            }
        } else {
            estoqueDisplay.textContent = '0';
        }

        // Filtra o select de destino para não mostrar a origem
        const destino = transfDestinoSelect.value;
        transfDestinoSelect.innerHTML = '<option value="">Destino...</option>';
        if (product && product.locacoes) {
            product.locacoes.forEach(loc => {
                // Se a origem for uma locação, não a mostre no destino
                if (origem !== 'sem_origem' && loc.locacao === origem) {
                    return;
                }
                const option = document.createElement('option');
                option.value = loc.locacao;
                option.textContent = loc.locacao;
                transfDestinoSelect.appendChild(option);
            });
        }
        // Restaura a seleção se possível
        if (destino && destino !== origem) {
            transfDestinoSelect.value = destino;
        }
    });

    // Lógica de submissão do formulário de transferência
    formTransferencia.addEventListener('submit', async (e) => {
        e.preventDefault();

        const productId = transfProdutoSelect.value;
        const origem = transfOrigemSelect.value;
        const destino = transfDestinoSelect.value;
        const quantidade = parseFloat(document.getElementById('transf-quantidade').value);

        // Validação
        if (!productId || !origem || !destino || !quantidade || quantidade <= 0) {
            alert('Por favor, preencha todos os campos corretamente.');
            return;
        }
         if (origem === destino) {
            alert('A locação de origem e destino não podem ser as mesmas.');
            return;
        }

        const product = productsMap[productId];
        // Validação de estoque
        if (origem === 'sem_origem') {
            if ((product.estoque || 0) < quantidade) {
                alert(`Quantidade a transferir excede o estoque disponível Sem Origem (${product.estoque || 0}).`);
                return;
            }
        } else {
            const locacaoOrigemData = product.locacoes.find(l => l.locacao === origem);
            if (!locacaoOrigemData || locacaoOrigemData.estoque < quantidade) {
                alert(`Quantidade a transferir excede o estoque disponível na origem (${locacaoOrigemData.estoque || 0}).`);
                return;
            }
        }


        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error('Produto não encontrado.');

                const pData = productDoc.data();
                const locacoes = pData.locacoes || [];
                const destinoIndex = locacoes.findIndex(l => l.locacao === destino);
                if (destinoIndex === -1) throw new Error('Locação de destino não encontrada.');

                if (origem === 'sem_origem') {
                    // Re-valida o estoque sem origem dentro da transação
                    if ((pData.estoque || 0) < quantidade) {
                        throw new Error('Estoque Sem Origem insuficiente. A transação foi cancelada.');
                    }
                    const novoEstoqueSemOrigem = (pData.estoque || 0) - quantidade;
                    locacoes[destinoIndex].estoque = (locacoes[destinoIndex].estoque || 0) + quantidade;
                    transaction.update(productRef, {
                        estoque: novoEstoqueSemOrigem,
                        locacoes: locacoes
                    });
                } else {
                    const origemIndex = locacoes.findIndex(l => l.locacao === origem);
                    if (origemIndex === -1) throw new Error('Locação de origem não encontrada.');

                    // Re-valida o estoque da locação dentro da transação
                    if ((locacoes[origemIndex].estoque || 0) < quantidade) {
                        throw new Error('Estoque na origem insuficiente. A transação foi cancelada.');
                    }
                    locacoes[origemIndex].estoque -= quantidade;
                    locacoes[destinoIndex].estoque = (locacoes[destinoIndex].estoque || 0) + quantidade;
                    transaction.update(productRef, { locacoes: locacoes });
                }

                const observacao = `Transferência de ${origem.replace('_', ' ')} para ${destino}.`;
                const movementRef = doc(collection(db, 'movimentacoes'));
                transaction.set(movementRef, {
                    tipo: 'transferencia',
                    productId,
                    quantidade,
                    data: serverTimestamp(),
                    observacao: observacao
                });
            });

            alert('Transferência realizada com sucesso!');
            // Atualiza o mapa local para refletir a mudança (FORMA ROBUSTA)
            const productRef = doc(db, 'produtos', productId);
            const updatedDoc = await getDoc(productRef);
            if (updatedDoc.exists()) {
                productsMap[productId] = { id: productId, ...updatedDoc.data() };
            }
            formTransferencia.reset();
            transferenciaModal.style.display = 'none';
            await updateProductInfo(); // Atualiza a info do produto principal se estiver selecionado
        } catch (error) {
            console.error("Erro na transferência de estoque:", error);
            alert(`Erro ao realizar a transferência: ${error.message}`);
        }
    });


    // --- FIM DA LÓGICA DE TRANSFERÊNCIA ---


    // --- Lógica do Modal de Importação XML ---
    btnImportarXml.addEventListener('click', () => { xmlImportModal.style.display = 'block'; });
    xmlModalClose.addEventListener('click', () => { xmlImportModal.style.display = 'none'; });
    window.addEventListener('click', (event) => {
        if (event.target == xmlImportModal) xmlImportModal.style.display = 'none';
        if (event.target == cadastroProdutoModal) cadastroProdutoModal.style.display = 'none';
    });

    xmlFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Limpa o valor total ao carregar um novo arquivo
        document.getElementById('xml-total-value').textContent = 'R$ 0,00';

        const reader = new FileReader();
        reader.onload = (e) => parseNFeXML(e.target.result);
        reader.readAsText(file);
    });

    function updateTotalValue() {
        const rows = document.querySelectorAll('#xml-products-table tbody tr');
        let totalValue = 0;

        rows.forEach(row => {
            const quantity = parseFloat(row.cells[3].querySelector('input').value) || 0;
            const unitValue = parseFloat(row.cells[4].querySelector('input').value) || 0;
            const icms = parseFloat(row.cells[5].querySelector('input').value) || 0;
            const ipi = parseFloat(row.cells[6].querySelector('input').value) || 0;
            const frete = parseFloat(row.cells[7].querySelector('input').value) || 0;

            totalValue += (quantity * unitValue) + icms + ipi + frete;
        });

        document.getElementById('xml-total-value').textContent = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    xmlProductsTableBody.addEventListener('input', (e) => {
        // Atualiza o valor total se qualquer input dentro da tabela for modificado
        if (e.target.tagName === 'INPUT') {
            updateTotalValue();
        }
    });
    // Event listener para os dropdowns de Local na tabela de importação
    xmlProductsTableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('xml-local-select')) {
            const row = e.target.closest('tr');
            const productId = row.dataset.productId;
            const selectedLocalId = e.target.value;
            const locacaoSelect = row.querySelector('.xml-locacao-select');
            const product = productsMap[productId];

            locacaoSelect.innerHTML = '<option value="">Carregando...</option>';

            if (product && selectedLocalId) {
                const locacoesFiltradas = product.locacoes.filter(l => l.localId === selectedLocalId);
                locacaoSelect.innerHTML = '<option value="">Locação...</option>';
                locacoesFiltradas.forEach(loc => {
                    locacaoSelect.innerHTML += `<option value="${loc.locacao}">${loc.locacao}</option>`;
                });

                // Pre-seleciona a primeira locação
                if (locacaoSelect.options.length > 1) {
                    locacaoSelect.selectedIndex = 1;
                }
                locacaoSelect.required = true;

            } else {
                locacaoSelect.innerHTML = '<option value="">Locação...</option>';
                locacaoSelect.required = false;
            }
        }
    });


    async function parseNFeXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        xmlProductsTableBody.innerHTML = '';
        const nfeNumero = xmlDoc.querySelector('nNF')?.textContent || '';
        inputNfeNumero.value = nfeNumero;

        if (nfeNumero) {
            const q = query(collection(db, 'movimentacoes'), where("nf", "==", nfeNumero), where("tipo", "==", "entrada"));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                showInfoModal(`A NF-e de número ${nfeNumero} já foi importada anteriormente e não pode ser processada novamente.`);
                xmlFileInput.value = ''; // Limpa o input de arquivo
                inputNfeNumero.value = ''; // Limpa o campo do número da NF
                return; // Interrompe a execução
            }
        }

        const totalFrete = parseFloat(xmlDoc.querySelector('ICMSTot vFrete')?.textContent || 0);
        const totalProdutos = parseFloat(xmlDoc.querySelector('ICMSTot vProd')?.textContent || 0);
        const items = xmlDoc.querySelectorAll('det');

        items.forEach(item => {
            const cProd = item.querySelector('cProd')?.textContent;
            const xProd = item.querySelector('xProd')?.textContent;
            const uCom = item.querySelector('uCom')?.textContent;
            const produtoNoSistema = Object.values(productsMap).find(p => p.codigo === cProd);
            const descricaoSistema = produtoNoSistema ? produtoNoSistema.descricao : 'PRODUTO NÃO CADASTRADO';
            const produtoIdSistema = produtoNoSistema ? produtoNoSistema.id : '';
            const vProd = parseFloat(item.querySelector('vProd')?.textContent || 0);
            const freteRateado = (totalProdutos > 0) ? (vProd / totalProdutos) * totalFrete : 0;

            let acaoHtml = '';
            if (!produtoNoSistema) {
                const dadosDoXml = { codigo: cProd, descricao: xProd, un: uCom };
                acaoHtml = `<button class="btn btn-edit btn-cadastrar-produto" data-dados='${JSON.stringify(dadosDoXml)}'>Cadastrar</button>`;
            }

            // Prepara dropdown de Local
            let localDropdownHtml = `<select class="form-control xml-local-select" ${!produtoNoSistema ? 'disabled' : ''}>`;
            if (produtoNoSistema && produtoNoSistema.locacoes) {
                const locaisUnicos = [...new Set(produtoNoSistema.locacoes.map(l => l.localId))];
                localDropdownHtml += '<option value="">Local...</option>';
                locaisUnicos.forEach(localId => {
                    const localNome = configData.locais[localId]?.nome || 'Desconhecido';
                    localDropdownHtml += `<option value="${localId}">${localNome}</option>`;
                });
            } else {
                localDropdownHtml += '<option value="">Nenhum</option>';
            }
            localDropdownHtml += `</select>`;

            // Prepara dropdown de Locação (inicialmente vazio)
            let locacaoDropdownHtml = `<select class="form-control xml-locacao-select" ${!produtoNoSistema ? 'disabled' : ''}><option value="">Locação...</option></select>`;

            const row = xmlProductsTableBody.insertRow();
            if (!produtoNoSistema) row.style.backgroundColor = '#ffdddd';
            row.dataset.productId = produtoIdSistema;
            row.dataset.unidadeCompra = uCom;

            row.innerHTML = `
                <td><input type="text" class="form-control" value="${cProd}" disabled></td>
                <td><input type="text" class="form-control" value="${descricaoSistema}" disabled></td>
                <td><input type="text" class="form-control" value="${uCom}" disabled></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(item.querySelector('qCom')?.textContent || 0)}"></td>
                <td><input type="number" step="0.001" class="form-control" value="${parseFloat(item.querySelector('vUnCom')?.textContent || 0)}"></td>
                <td><input type="number" step="any" class="form-control" value="0"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(item.querySelector('vIPI')?.textContent || 0)}"></td>
                <td><input type="number" step="any" class="form-control" value="${freteRateado.toFixed(2)}"></td>
                <td>${localDropdownHtml}</td>
                <td>${locacaoDropdownHtml}</td>
                <td>${acaoHtml}</td>
            `;
        });

        // Pre-seleciona o primeiro local e locação para cada linha
        xmlProductsTableBody.querySelectorAll('tr').forEach(row => {
            const localSelect = row.querySelector('.xml-local-select');
            if (localSelect && localSelect.options.length > 1) {
                localSelect.selectedIndex = 1; // Seleciona a primeira opção válida
                localSelect.dispatchEvent(new Event('change', { bubbles: true })); // Dispara o evento para popular a locação
            }
        });
        updateTotalValue(); // Calcula o valor total inicial
    }

    btnConfirmarXmlImport.addEventListener('click', async () => {
        const loader = document.getElementById('xml-import-loader');
        const nf = document.getElementById('xml-nfe-numero').value;
        const rows = document.querySelectorAll('#xml-products-table tbody tr');
        let sucessoCount = 0;
        let erroCount = 0;
        const produtosParaAtualizarCusto = new Set();
        let falhas = [];

        if (rows.length === 0) {
            return alert("Não há produtos para importar.");
        }

        // Validação prévia
        for (const row of rows) {
            const productId = row.dataset.productId;
            if (!productId) continue; // Pula não cadastrados

            const localSelect = row.cells[8].querySelector('select');
            const locacaoSelect = row.cells[9].querySelector('select');
            const codigoProduto = row.cells[0].querySelector('input').value;

            if (localSelect && localSelect.value && (!locacaoSelect || !locacaoSelect.value)) {
                alert(`Para o produto ${codigoProduto}, ao selecionar um Local, a Locação também deve ser selecionada.`);
                return; // Interrompe a importação
            }
        }


        if (confirm(`Confirmar a entrada de ${rows.length} item(ns) da NF-e ${nf}?`)) {
            loader.style.display = 'flex'; // Mostra o loader
            btnConfirmarXmlImport.disabled = true; // Desabilita o botão

            for (const row of rows) {
                const productId = row.dataset.productId;
                if (!productId) continue; // Pula não cadastrados

                const locacaoSelecionada = row.cells[9].querySelector('select').value; // Índice da célula de locação agora é 9
                const unidadeCompra = row.dataset.unidadeCompra;

                try {
                    const quantidadeInformada = parseFloat(row.cells[3].querySelector('input').value);
                    const valorUnitario = parseFloat(row.cells[4].querySelector('input').value);
                    const icms = parseFloat(row.cells[5].querySelector('input').value) || 0;
                    const ipi = parseFloat(row.cells[6].querySelector('input').value) || 0;
                    const frete = parseFloat(row.cells[7].querySelector('input').value) || 0;

                    if (isNaN(quantidadeInformada) || quantidadeInformada <= 0 || isNaN(valorUnitario) || !locacaoSelecionada) {
                        throw new Error("Dados inválidos ou locação não selecionada.");
                    }

                    await runTransaction(db, async (transaction) => {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) {
                            throw new Error(`Produto com ID ${productId} não encontrado.`);
                        }

                        const productData = productDoc.data();
                        let quantidadeParaEstoque = quantidadeInformada;

                        // 1. Lógica de Conversão
                        if (productData.conversaoId) {
                            const conversaoRef = doc(db, 'conversoes', productData.conversaoId);
                            const conversaoDoc = await transaction.get(conversaoRef);
                            if (conversaoDoc.exists()) {
                                const regra = conversaoDoc.data();
                                const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                                const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                                if (fator_qtd_compra > 0) {
                                    quantidadeParaEstoque = (quantidadeInformada / fator_qtd_compra) * fator_qtd_padrao;
                                    // Validação de número inteiro
                                    if (quantidadeParaEstoque % 1 !== 0) {
                                        throw new Error("A conversão de unidade resultou em um valor fracionado. Apenas números inteiros são permitidos.");
                                    }
                                }
                            }
                        }

                        // 2. Lógica de Custo Total
                        let custoTotalEntrada = (quantidadeInformada * valorUnitario) + icms + ipi + frete;
                        // ... (outras lógicas de custo, se houver)

                        // 3. Atualiza Estoque na Locação Correta ou no Estoque Geral
                        if (locacaoSelecionada) {
                            const locacoes = productData.locacoes || [];
                            const locacaoIndex = locacoes.findIndex(l => l.locacao === locacaoSelecionada);
                            if (locacaoIndex === -1) {
                                throw new Error(`Locação '${locacaoSelecionada}' não encontrada para o produto.`);
                            }
                            locacoes[locacaoIndex].estoque = (locacoes[locacaoIndex].estoque || 0) + quantidadeParaEstoque;
                            transaction.update(productRef, { locacoes: locacoes });
                        } else {
                            // Se não houver locação, atualiza o estoque geral
                            const novoEstoque = (productData.estoque || 0) + quantidadeParaEstoque;
                            transaction.update(productRef, { estoque: novoEstoque });
                        }


                        // 4. Cria o Registro de Movimentação
                        const movementRef = doc(collection(db, 'movimentacoes'));
                        const movementData = {
                            tipo: 'entrada',
                            productId,
                            locacao: locacaoSelecionada,
                            un_compra: unidadeCompra, // SALVA A UNIDADE DA NOTA
                            data: serverTimestamp(),
                            nf: nf,
                            valor_unitario: valorUnitario,
                            icms: icms,
                            ipi: ipi,
                            frete: frete,
                            observacao: `Importado via XML da NF-e ${nf}`,
                            quantidade: quantidadeParaEstoque,
                            quantidade_compra: quantidadeInformada,
                            custo_total_entrada: custoTotalEntrada
                        };
                        transaction.set(movementRef, movementData);
                    });

                    produtosParaAtualizarCusto.add(productId);
                    sucessoCount++;
                } catch (error) {
                    erroCount++;
                    const codigoProduto = row.cells[0].querySelector('input').value;
                    falhas.push(`Produto ${codigoProduto}: ${error.message}`);
                    console.error(`Falha ao importar produto com ID ${productId}:`, error);
                }
            }

            // 5. Atualiza o Custo Médio
            for (const id of produtosParaAtualizarCusto) {
                await atualizarCustoMedioProduto(id);
            }

            let alertMessage = `${sucessoCount} produto(s) importado(s) com sucesso!`;
            if (erroCount > 0) {
                alertMessage += `\n\n${erroCount} produto(s) falharam:\n- ${falhas.join('\n- ')}`;
            }
            alert(alertMessage);

            xmlProductsTableBody.innerHTML = '';
            xmlImportModal.style.display = 'none';
            loader.style.display = 'none'; // Esconde o loader
            btnConfirmarXmlImport.disabled = false; // Reabilita o botão
        }
    });

    // --- Lógica do Modal de Cadastro ---
    xmlProductsTableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-cadastrar-produto')) {
            const dados = JSON.parse(e.target.dataset.dados);
            linhaAtualParaAtualizar = e.target.closest('tr');
            document.getElementById('modal-produto-codigo').value = dados.codigo || '';
            document.getElementById('modal-produto-descricao').value = dados.descricao || '';
            document.getElementById('modal-produto-un').value = dados.un || '';
            cadastroProdutoModal.style.display = 'block';
        }
    });

    btnFecharModalCadastro.onclick = () => { cadastroProdutoModal.style.display = 'none'; };

    // Adiciona a formatação para o campo de locação no modal de cadastro de produto
    const modalLocacaoInput = document.getElementById('modal-produto-locacao');
    IMask(modalLocacaoInput, {
        mask: '0-L-00-L',
        definitions: {
            'L': {
                mask: /[A-Z]/,
            }
        },
        prepare: function (str) {
            return str.toUpperCase();
        },
    });

    formNovoProdutoModal.addEventListener('submit', async (e) => {
        e.preventDefault();

        const locacao = document.getElementById('modal-produto-locacao').value;
        const localId = document.getElementById('modal-produto-local').value;
        const locacoes = [];

        // Apenas adiciona a locação se ambos os campos estiverem preenchidos
        if (locacao && localId) {
            locacoes.push({
                locacao: locacao,
                localId: localId,
                estoque: 0 // Estoque inicial para uma nova locação é sempre 0
            });
        }

        const novoProduto = {
            codigo: document.getElementById('modal-produto-codigo').value,
            descricao: document.getElementById('modal-produto-descricao').value,
            un: document.getElementById('modal-produto-un').value,
            cor: document.getElementById('modal-produto-cor').value,
            conversaoId: document.getElementById('modal-produto-conversao').value,
            fornecedorId: document.getElementById('modal-produto-fornecedor').value,
            grupoId: document.getElementById('modal-produto-grupo').value,
            locacoes: locacoes, // Salva o array de locações, que pode estar vazio
            arquivado: false
            // O campo 'estoque' não é mais um campo de nível superior
        };

        try {
            const docRef = await addDoc(collection(db, 'produtos'), novoProduto);
            alert('Produto cadastrado com sucesso!');

            if (linhaAtualParaAtualizar) {
                linhaAtualParaAtualizar.dataset.productId = docRef.id;
                linhaAtualParaAtualizar.style.backgroundColor = '#d4edda';
                linhaAtualParaAtualizar.cells[1].querySelector('input').value = novoProduto.descricao;

                // Célula de Ação (11ª célula, index 10)
                const acaoCell = linhaAtualParaAtualizar.cells[10];
                acaoCell.innerHTML = '<span class="text-success" style="color: green; font-weight: bold;">Cadastrado!</span>';

                // Célula de Local (9ª célula, index 8) e Locação (10ª célula, index 9)
                const localCell = linhaAtualParaAtualizar.cells[8];
                const locacaoCell = linhaAtualParaAtualizar.cells[9];

                // Atualiza o dropdown de Local
                const newLocalSelect = document.createElement('select');
                newLocalSelect.className = 'form-control xml-local-select';
                newLocalSelect.required = true;
                let localOptionsHtml = '<option value="">Local...</option>';
                const locaisUnicos = [...new Set(novoProduto.locacoes.map(l => l.localId))];
                locaisUnicos.forEach(localId => {
                    const localNome = configData.locais[localId]?.nome || 'Desconhecido';
                    localOptionsHtml += `<option value="${localId}">${localNome}</option>`;
                });
                newLocalSelect.innerHTML = localOptionsHtml;
                localCell.innerHTML = '';
                localCell.appendChild(newLocalSelect);

                // Atualiza o dropdown de Locação
                const newLocacaoSelect = document.createElement('select');
                newLocacaoSelect.className = 'form-control xml-locacao-select';
                newLocacaoSelect.required = true;

                let optionsHtml = '<option value="">Locação...</option>';
                if (novoProduto.locacoes && novoProduto.locacoes.length > 0) {
                    novoProduto.locacoes.forEach(loc => {
                        optionsHtml += `<option value="${loc.locacao}">${loc.locacao}</option>`;
                    });
                } else {
                    optionsHtml = '<option value="">Nenhuma</option>';
                    newLocacaoSelect.disabled = true;
                }
                newLocacaoSelect.innerHTML = optionsHtml;

                locacaoCell.innerHTML = ''; // Limpa a célula
                locacaoCell.appendChild(newLocacaoSelect); // Adiciona o novo select
            }

            productsMap[docRef.id] = { id: docRef.id, ...novoProduto };
            formNovoProdutoModal.reset();
            cadastroProdutoModal.style.display = 'none';
        } catch (error) {
            console.error("Erro ao cadastrar novo produto:", error);
            alert("Falha ao cadastrar produto: " + error.message);
        }
    });

    async function loadInitialData() {
        const tipoEntradaSelect = document.getElementById('mov-tipo-entrada');
        const tipoSaidaSelect = document.getElementById('mov-tipo-saida');
        const obraSelect = document.getElementById('mov-obra');


        configData.tipos_entrada = await loadConfigToSelect(tipoEntradaSelect, 'tipos_entrada', 'nome', 'Tipo de Entrada...');
        configData.tipos_saida = await loadConfigToSelect(tipoSaidaSelect, 'tipos_saida', 'nome', 'Tipo de Saída...');
        configData.obras = await loadConfigToSelect(obraSelect, 'obras', 'nome', 'Obra...');
        configData.fornecedores = await loadConfigToMap('fornecedores');
        configData.grupos = await loadConfigToMap('grupos');
        configData.conversoes = await loadConfigToMap('conversoes');
        configData.locais = await loadConfigToMap('locais');
    }

    async function loadConfigToSelect(selectElement, collectionName, field, placeholder = 'Selecione...') {
        const snapshot = await getDocs(collection(db, collectionName));
        const items = {};
        selectElement.innerHTML = `<option value="">${placeholder}</option>`;
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

    function popularDropdownsCadastroModal() {
        const selects = {
            'modal-produto-local': configData.locais,
            'modal-produto-fornecedor': configData.fornecedores,
            'modal-produto-grupo': configData.grupos,
            'modal-produto-conversao': configData.conversoes
        };

        for (const [selectId, data] of Object.entries(selects)) {
            const select = document.getElementById(selectId);
            while (select.options.length > 1) select.remove(1);
            for (const [id, item] of Object.entries(data)) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = item.nome || item.nome_regra || 'N/A';
                select.appendChild(option);
            }
        }
    }


    // --- LÓGICA DO CAMPO DE BUSCA DE PRODUTO ---
    const productSearchInput = document.getElementById('mov-produto-search');
    const productSearchIdInput = document.getElementById('mov-produto-id');
    const productResultsDiv = document.getElementById('mov-produto-results');

    const showAndFilterProducts = () => {
        const searchTerm = productSearchInput.value.toLowerCase();
        productResultsDiv.innerHTML = '';
        productResultsDiv.style.display = 'none';

        const filteredProducts = Object.values(productsMap).filter(p =>
            p.codigo.toLowerCase().includes(searchTerm) ||
            p.descricao.toLowerCase().includes(searchTerm)
        );

        if (filteredProducts.length > 0) {
            productResultsDiv.style.display = 'block';
            filteredProducts.forEach(p => { // Removido o slice para mostrar todos os resultados
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.textContent = `${p.codigo} - ${p.descricao}`;
                div.dataset.id = p.id;
                productResultsDiv.appendChild(div);
            });
        }
    };

    productSearchInput.addEventListener('focus', showAndFilterProducts);
    productSearchInput.addEventListener('input', showAndFilterProducts);

    productResultsDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('search-result-item')) {
            const productId = e.target.dataset.id;
            const product = productsMap[productId];

            productSearchInput.value = `${product.codigo} - ${product.descricao}`;
            productSearchIdInput.value = productId;

            productResultsDiv.innerHTML = '';
            productResultsDiv.style.display = 'none';

            await updateProductInfo(); // Chama a função para atualizar o resto do formulário
        }
    });

    // Esconde os resultados se clicar fora
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            productResultsDiv.style.display = 'none';
        }
    });

    // --- FIM DA LÓGICA DE BUSCA ---

    document.getElementById('headers-row').addEventListener('click', e => {
        // ... (lógica de ordenação da tabela mantida)
    });

    document.getElementById('history-filters-container').addEventListener('input', e => {
        const target = e.target;
        const column = target.dataset.column;
        if (column) {
            filterState[column] = target.value;
            updateTable();
        }
    });

    function popularFiltros() {
        const filtroSubtipo = document.getElementById('filtro-subtipo');
        const filtroObra = document.getElementById('filtro-obra');

        // Popula Sub-Tipos
        const subTipos = new Set();
        Object.values(configData.tipos_entrada || {}).forEach(tipo => subTipos.add(tipo.nome));
        Object.values(configData.tipos_saida || {}).forEach(tipo => subTipos.add(tipo.nome));
        subTipos.add('Importação NF'); // Adicionado manualmente

        filtroSubtipo.innerHTML = '<option value="">Todos</option>';
        subTipos.forEach(subTipo => {
            filtroSubtipo.innerHTML += `<option value="${subTipo}">${subTipo}</option>`;
        });

        // Popula Obras
        filtroObra.innerHTML = '<option value="">Todas</option>';
        Object.values(configData.obras || {}).forEach(obra => {
            filtroObra.innerHTML += `<option value="${obra.nome}">${obra.nome}</option>`;
        });

        // Popula Fornecedores
        const filtroFornecedor = document.getElementById('filtro-fornecedor');
        filtroFornecedor.innerHTML = '<option value="">Todos</option>';
        for (const fornecedorId in configData.fornecedores) {
            const fornecedor = configData.fornecedores[fornecedorId];
            filtroFornecedor.innerHTML += `<option value="${fornecedorId}">${fornecedor.nome}</option>`;
        }
    }

    // Listener para produtos em tempo real
    onSnapshot(query(collection(db, 'produtos'), where("arquivado", "!=", true)), (snapshot) => {
        const tempMap = {};
        snapshot.forEach(doc => {
            tempMap[doc.id] = { id: doc.id, ...doc.data() };
        });
        productsMap = tempMap;
        // Opcional: log para confirmar a atualização em tempo real
        // console.log('Products map updated in real-time.', Object.keys(productsMap).length, 'products loaded.');
    });

    onSnapshot(query(collection(db, 'movimentacoes'), orderBy('data', 'desc')), (snapshot) => {
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
        popularDropdownsCadastroModal();
        popularFiltros(); // Popula os filtros
        // Exibe o formulário que estava oculto por padrão
        document.getElementById('movement-wrapper').style.display = 'block';
    });
});

// Substitua a função inteira em js/movimentacoes.js por esta versão CORRIGIDA:
async function atualizarCustoMedioProduto(produtoId) {
    if (!produtoId) return;

    const q = query(collection(db, 'movimentacoes'), where("productId", "==", produtoId));
    const movementsSnapshot = await getDocs(q);
    const productMovements = [];
    movementsSnapshot.forEach(doc => {
        productMovements.push(doc.data());
    });

    // Ordena as movimentações por data para o cálculo correto do custo médio
    productMovements.sort((a, b) => a.data.toMillis() - b.data.toMillis());

    let totalQuantity = 0;
    let totalCost = 0;

    productMovements.forEach(mov => {
        if (mov.tipo === 'entrada' && mov.custo_total_entrada) {
            totalCost += mov.custo_total_entrada;
            totalQuantity += mov.quantidade;
        } else if (mov.tipo === 'saida') {
            const currentAvgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
            totalCost -= mov.quantidade * currentAvgCost;
            totalQuantity -= mov.quantidade;
        }
    });

    const novoCustoMedio = totalQuantity > 0 ? totalCost / totalQuantity : 0;
    const productRef = doc(db, 'produtos', produtoId);
    await setDoc(productRef, { valorMedio: novoCustoMedio }, { merge: true });

    console.log(`Custo médio do produto ${produtoId} atualizado para ${novoCustoMedio.toFixed(3)}`);
}
