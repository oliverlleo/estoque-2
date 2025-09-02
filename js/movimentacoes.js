function showInfoModal(message) {
    document.getElementById('info-modal-message').textContent = message;
    document.getElementById('info-modal').style.display = 'block';
}

import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, onSnapshot, runTransaction, doc, serverTimestamp, query, where, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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
        document.getElementById('mov-tipo-entrada'), document.getElementById('mov-nf'),
        document.getElementById('mov-valor-unitario'), document.getElementById('mov-icms'),
        document.getElementById('mov-ipi'), document.getElementById('mov-frete')
    ];
    const saidaFields = [
        document.getElementById('mov-tipo-saida'), document.getElementById('mov-requisitante'),
        document.getElementById('mov-estoque-display-wrapper')
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

    function updateProductInfo() {
        const productId = document.getElementById('mov-produto').value;
        const product = productsMap[productId];
        const locacaoSelect = document.getElementById('mov-locacao');
        const isEntrada = document.getElementById('movement-toggle').checked;

        // Limpa e desabilita o select de locação
        locacaoSelect.innerHTML = '<option value="">Selecione a Locação...</option>';
        locacaoSelect.disabled = true;

        // Esconde o display de estoque antigo
        document.getElementById('mov-estoque-display-wrapper').style.display = 'none';

        if (product) {
            document.getElementById('mov-codigo-display').textContent = product.codigo;
            document.getElementById('mov-descricao-display').textContent = product.descricao;
            document.getElementById('mov-un-display').textContent = product.un;

            if (product.locacoes && product.locacoes.length > 0) {
                product.locacoes.forEach(loc => {
                    const option = document.createElement('option');
                    option.value = loc.locacao; // Usar o código da locação como valor

                    let text = loc.locacao;
                    if (!isEntrada) { // Se for SAÍDA, mostra o estoque
                        text += ` (Estoque: ${loc.estoque || 0})`;
                    }
                    option.textContent = text;
                    locacaoSelect.appendChild(option);
                });
                locacaoSelect.disabled = false;
            }
        } else {
            // Limpa os campos se nenhum produto for selecionado
            document.getElementById('mov-codigo-display').textContent = '-';
            document.getElementById('mov-descricao-display').textContent = '-';
            document.getElementById('mov-un-display').textContent = '-';
        }

        const isSobra = product && product.e_sobra === true;
        const costFields = ['mov-valor-unitario', 'mov-icms', 'mov-ipi', 'mov-frete'];
        const quantField = document.getElementById('mov-quantidade');

        if (isEntrada) {
            costFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                field.disabled = isSobra;
                if (isSobra) field.value = '';
            });
            quantField.disabled = isSobra;
            if (isSobra) {
                quantField.value = 1;
                quantField.placeholder = "Entrada de sobra é sempre 1 Unidade";
            } else {
                quantField.placeholder = "Quantidade";
            }
        } else {
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

            const processedMov = {
                ...mov,
                custoUnitario: custoUnitario, // Adiciona o custo unitário calculado ao objeto principal
                _search_data: {
                    data: mov.data ? new Date(mov.data.seconds * 1000).toLocaleString('pt-BR') : '',
                    tipo: mov.tipo || '',
                    codigo: product.codigo || '',
                    descricao: product.descricao || '',
                    un: product.un || '',
                    quantidade: mov.quantidade?.toString() || '',
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
            return processedMov;
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
            const custoUnitarioFmt = mov.custoUnitario > 0 ? mov.custoUnitario.toFixed(2) : '-';

            row.innerHTML = `
                <td>${searchData.data}</td>
                <td class="${searchData.tipo}">${searchData.tipo === 'reserva_cancelada' ? 'RESERVA CANCELADA' : searchData.tipo.toUpperCase()}</td>
                <td>${searchData.codigo || 'N/A'}</td>
                <td>${searchData.descricao || 'Produto não encontrado'}</td>
                <td>${searchData.un || 'N/A'}</td>
                <td>${searchData.quantidade}</td>
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

    function handleToggleChange() {
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
        updateProductInfo();
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
        const productId = document.getElementById('mov-produto').value;
        const locacaoSelecionada = document.getElementById('mov-locacao').value;
        const quantidade = parseFloat(document.getElementById('mov-quantidade').value);

        if (!productId || !locacaoSelecionada || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto, a locação e a quantidade corretamente.');
            return;
        }

        if (isEntrada) {
            // LÓGICA DE ENTRADA NORMAL (a lógica de sobra foi ignorada por enquanto)
            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) { throw new Error("Produto não encontrado!"); }

                    const productData = productDoc.data();
                    const locacoes = productData.locacoes || [];
                    const locacaoIndex = locacoes.findIndex(l => l.locacao === locacaoSelecionada);

                    if (locacaoIndex === -1) {
                        throw new Error("Locação selecionada não encontrada no produto.");
                    }

                    // Lógica de conversão (mantida)
                    const conversaoId = productData.conversaoId;
                    let quantidadeParaEstoque = quantidade;
                    if (conversaoId) {
                        const conversaoRef = doc(db, 'conversoes', conversaoId);
                        const conversaoDoc = await transaction.get(conversaoRef); // Usar transaction.get
                        if (conversaoDoc.exists()) {
                            const regra = conversaoDoc.data();
                            const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                            const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                            if (fator_qtd_compra > 0) {
                                quantidadeParaEstoque = (quantidade / fator_qtd_compra) * fator_qtd_padrao;
                            }
                        }
                    }

                    const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                    const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];

                    if (tipoEntradaConfig && tipoEntradaConfig.movimenta_estoque == true) {
                        locacoes[locacaoIndex].estoque = (locacoes[locacaoIndex].estoque || 0) + quantidadeParaEstoque;
                        transaction.update(productRef, { locacoes: locacoes });
                    }

                    // Cálculo de custo (mantido)
                    const valorUnitario = parseFloat(document.getElementById('mov-valor-unitario').value) || 0;
                    const icms = parseFloat(document.getElementById('mov-icms').value) || 0;
                    const ipi = parseFloat(document.getElementById('mov-ipi').value) || 0;
                    const frete = parseFloat(document.getElementById('mov-frete').value) || 0;
                    let custoTotalEntrada = (quantidade * valorUnitario) + icms + ipi + frete;

                    // Criação do documento de movimentação
                    const movementRef = doc(collection(db, 'movimentacoes'));
                    const movementData = {
                        tipo: 'entrada',
                        productId,
                        locacao: locacaoSelecionada, // Campo novo
                        data: serverTimestamp(),
                        tipo_entradaId: tipoEntradaId,
                        nf: document.getElementById('mov-nf').value,
                        valor_unitario: valorUnitario,
                        icms: icms,
                        ipi: ipi,
                        frete: frete,
                        observacao: document.getElementById('mov-observacao').value,
                        quantidade: quantidadeParaEstoque,
                        quantidade_compra: quantidade,
                        custo_total_entrada: custoTotalEntrada
                    };
                    transaction.set(movementRef, movementData);
                });
                alert('Entrada registrada com sucesso!');
                // ATUALIZA O MAPA DE PRODUTOS LOCAL
                const productData = productsMap[productId];
                if (productData && productData.locacoes) {
                    const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === locacaoSelecionada);
                    if (locacaoIndex !== -1) {
                        // Esta é uma aproximação. A quantidade real adicionada ao estoque é `quantidadeParaEstoque`.
                        // A lógica de conversão precisaria ser replicada aqui para uma atualização 100% precisa.
                        // Por simplicidade, vamos assumir 1-para-1 por enquanto, ou buscar o doc novamente.
                        // A forma mais segura é recarregar os dados do produto.
                        const productRef = doc(db, 'produtos', productId);
                        const updatedDoc = await getDoc(productRef);
                        productsMap[productId] = { id: productId, ...updatedDoc.data() };
                    }
                }
                formMovimentacao.reset();
                handleToggleChange();
            } catch (error) {
                console.error("Erro na transação de entrada:", error);
                showInfoModal(error.message);
            }
        } else { // Saída
            const tipoSaidaId = document.getElementById('mov-tipo-saida').value;
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
                        observacao: document.getElementById('mov-observacao').value,
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
                            observacao: document.getElementById('mov-observacao').value,
                            valorMedioHistorico: pData.valorMedio || 0
                        });
                    });
                    alert('Saída registrada com sucesso!');

                    // ATUALIZA O MAPA DE PRODUTOS LOCAL
                    const productData = productsMap[productId];
                    if (productData && productData.locacoes) {
                        const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === locacaoSelecionada);
                        if (locacaoIndex !== -1) {
                            productsMap[productId].locacoes[locacaoIndex].estoque -= quantidade;
                        }
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
        transfOrigemSelect.innerHTML = '<option value="">Selecione a origem...</option>';
        transfOrigemSelect.disabled = true;
        transfDestinoSelect.innerHTML = '<option value="">Selecione o destino...</option>';
        transfDestinoSelect.disabled = true;
        document.getElementById('transf-estoque-origem-display').textContent = '0';
        document.getElementById('transf-codigo-display').textContent = '-';
        document.getElementById('transf-descricao-display').textContent = '-';

        if (product) {
            document.getElementById('transf-codigo-display').textContent = product.codigo;
            document.getElementById('transf-descricao-display').textContent = product.descricao;

            if (product.locacoes && product.locacoes.length > 0) {
                // Popula locações de ORIGEM (apenas com estoque)
                product.locacoes.forEach(loc => {
                    if (loc.estoque > 0) {
                        const option = document.createElement('option');
                        option.value = loc.locacao;
                        option.textContent = `${loc.locacao} (Estoque: ${loc.estoque})`;
                        transfOrigemSelect.appendChild(option);
                    }
                });

                // Popula locações de DESTINO (todas)
                product.locacoes.forEach(loc => {
                    const option = document.createElement('option');
                    option.value = loc.locacao;
                    option.textContent = loc.locacao;
                    transfDestinoSelect.appendChild(option);
                });

                transfOrigemSelect.disabled = false;
                transfDestinoSelect.disabled = false;
            }
        }
    });

    // Lógica de seleção de locação de origem
    transfOrigemSelect.addEventListener('change', () => {
        const productId = transfProdutoSelect.value;
        const product = productsMap[productId];
        const origem = transfOrigemSelect.value;

        if (product && origem) {
            const locacaoData = product.locacoes.find(l => l.locacao === origem);
            document.getElementById('transf-estoque-origem-display').textContent = locacaoData ? locacaoData.estoque : '0';
        } else {
            document.getElementById('transf-estoque-origem-display').textContent = '0';
        }

        // Filtra o select de destino para não mostrar a origem
        const destino = transfDestinoSelect.value;
        transfDestinoSelect.innerHTML = '<option value="">Selecione o destino...</option>';
        product.locacoes.forEach(loc => {
            if (loc.locacao !== origem) {
                const option = document.createElement('option');
                option.value = loc.locacao;
                option.textContent = loc.locacao;
                transfDestinoSelect.appendChild(option);
            }
        });
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
        const locacaoOrigemData = product.locacoes.find(l => l.locacao === origem);
        if (!locacaoOrigemData || locacaoOrigemData.estoque < quantidade) {
            alert(`Quantidade a transferir excede o estoque disponível na origem (${locacaoOrigemData.estoque || 0}).`);
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) {
                    throw new Error('Produto não encontrado no banco de dados.');
                }

                const pData = productDoc.data();
                const locacoes = pData.locacoes || [];
                const origemIndex = locacoes.findIndex(l => l.locacao === origem);
                const destinoIndex = locacoes.findIndex(l => l.locacao === destino);

                if (origemIndex === -1 || destinoIndex === -1) {
                    throw new Error('Locação de origem ou destino não encontrada.');
                }

                // Re-valida o estoque dentro da transação
                if (locacoes[origemIndex].estoque < quantidade) {
                    throw new Error('Estoque insuficiente na origem. A transação foi cancelada.');
                }

                // Realiza a transferência
                locacoes[origemIndex].estoque -= quantidade;
                locacoes[destinoIndex].estoque += quantidade;

                transaction.update(productRef, { locacoes: locacoes });

                // Cria um registro de movimentação
                const movementRef = doc(collection(db, 'movimentacoes'));
                transaction.set(movementRef, {
                    tipo: 'transferencia',
                    productId,
                    quantidade,
                    data: serverTimestamp(),
                    observacao: `Transferência da locação ${origem} para ${destino}.`
                });
            });

            alert('Transferência realizada com sucesso!');

            // Atualiza o mapa local para refletir a mudança
            const locOrigem = productsMap[productId].locacoes.find(l => l.locacao === origem);
            const locDestino = productsMap[productId].locacoes.find(l => l.locacao === destino);
            if (locOrigem) locOrigem.estoque -= quantidade;
            if (locDestino) locDestino.estoque += quantidade;

            formTransferencia.reset();
            transferenciaModal.style.display = 'none';
            updateProductInfo(); // Atualiza a info do produto principal se estiver selecionado
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
        const reader = new FileReader();
        reader.onload = (e) => parseNFeXML(e.target.result);
        reader.readAsText(file);
    });

    function parseNFeXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        xmlProductsTableBody.innerHTML = '';
        inputNfeNumero.value = xmlDoc.querySelector('nNF')?.textContent || '';
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

            const row = xmlProductsTableBody.insertRow();
            if (!produtoNoSistema) row.style.backgroundColor = '#ffdddd';
            row.dataset.productId = produtoIdSistema;

            row.innerHTML = `
                <td><input type="text" class="form-control" value="${cProd}" disabled></td>
                <td><input type="text" class="form-control" value="${descricaoSistema}" disabled></td>
                <td><input type="text" class="form-control" value="${uCom}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(item.querySelector('qCom')?.textContent || 0)}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(item.querySelector('vUnCom')?.textContent || 0)}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(item.querySelector('vICMS')?.textContent || 0)}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(item.querySelector('vIPI')?.textContent || 0)}"></td>
                <td><input type="number" step="any" class="form-control" value="${freteRateado.toFixed(2)}"></td>
                <td>${acaoHtml}</td>
            `;
        });
    }

    btnConfirmarXmlImport.addEventListener('click', async () => {
        const nf = document.getElementById('xml-nfe-numero').value;
        const rows = document.querySelectorAll('#xml-products-table tbody tr');
        let sucessoCount = 0;
        let erroCount = 0;
        const produtosParaAtualizarCusto = new Set();

        if (rows.length === 0) {
            return alert("Não há produtos para importar.");
        }

        if (confirm(`Confirmar a entrada de ${rows.length} item(ns) da NF-e ${nf}?`)) {
            for (const row of rows) {
                const productId = row.dataset.productId;

                // Pula a linha se o produto não estiver cadastrado no sistema
                if (!productId) {
                    continue;
                }

                try {
                    const quantidadeInformada = parseFloat(row.cells[3].querySelector('input').value);
                    const valorUnitario = parseFloat(row.cells[4].querySelector('input').value);
                    const icms = parseFloat(row.cells[5].querySelector('input').value) || 0;
                    const ipi = parseFloat(row.cells[6].querySelector('input').value) || 0;
                    const frete = parseFloat(row.cells[7].querySelector('input').value) || 0;

                    if (isNaN(quantidadeInformada) || quantidadeInformada <= 0 || isNaN(valorUnitario)) {
                        console.warn(`Produto com ID ${productId} pulado por dados inválidos.`);
                        continue;
                    }

                    await runTransaction(db, async (transaction) => {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) {
                            throw new Error(`Produto com ID ${productId} não encontrado no banco de dados.`);
                        }

                        const productData = productDoc.data();
                        let quantidadeParaEstoque = quantidadeInformada;

                        // 1. Lógica de Conversão de Unidades
                        if (productData.conversaoId) {
                            const conversaoRef = doc(db, 'conversoes', productData.conversaoId);
                            const conversaoDoc = await transaction.get(conversaoRef);
                            if (conversaoDoc.exists()) {
                                const regra = conversaoDoc.data();
                                const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                                const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                                if (fator_qtd_compra > 0) {
                                    quantidadeParaEstoque = (quantidadeInformada / fator_qtd_compra) * fator_qtd_padrao;
                                }
                            }
                        }

                        // 2. Lógica de Cálculo de Custo Total
                        let custoTotalEntrada = (quantidadeInformada * valorUnitario) + icms + ipi + frete;
                        if (productData.fornecedorId && configData.fornecedores[productData.fornecedorId]) {
                            const fornecedor = configData.fornecedores[productData.fornecedorId];
                            const impostoStPercent = parseFloat(fornecedor.imposto) || 0;
                            if (impostoStPercent > 0) {
                                custoTotalEntrada *= (1 + (impostoStPercent / 100));
                            }
                        }

                        // 3. Atualiza o Estoque do Produto
                        const currentEstoque = productData.estoque || 0;
                        const newEstoque = currentEstoque + quantidadeParaEstoque;
                        transaction.update(productRef, { estoque: newEstoque });

                        // 4. Cria o Registro de Movimentação
                        const movementRef = doc(collection(db, 'movimentacoes'));
                        const movementData = {
                            tipo: 'entrada',
                            productId,
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
                    console.error(`Falha ao importar produto com ID ${productId}:`, error);
                }
            }

            // 5. Atualiza o Custo Médio de todos os produtos importados
            for (const id of produtosParaAtualizarCusto) {
                await atualizarCustoMedioProduto(id);
            }

            alert(`${sucessoCount} produto(s) importado(s) com sucesso!\n${erroCount} produto(s) falharam (verifique o console).`);
            xmlProductsTableBody.innerHTML = '';
            xmlImportModal.style.display = 'none';
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

    formNovoProdutoModal.addEventListener('submit', async (e) => {
        e.preventDefault();
        const novoProduto = {
            codigo: document.getElementById('modal-produto-codigo').value,
            descricao: document.getElementById('modal-produto-descricao').value,
            un: document.getElementById('modal-produto-un').value,
            cor: document.getElementById('modal-produto-cor').value,
            localId: document.getElementById('modal-produto-local').value,
            locacao: document.getElementById('modal-produto-locacao').value,
            conversaoId: document.getElementById('modal-produto-conversao').value,
            fornecedorId: document.getElementById('modal-produto-fornecedor').value,
            grupoId: document.getElementById('modal-produto-grupo').value,
            arquivado: false,
            estoque: 0
        };

        try {
            const docRef = await addDoc(collection(db, 'produtos'), novoProduto);
            alert('Produto cadastrado com sucesso!');

            if (linhaAtualParaAtualizar) {
                linhaAtualParaAtualizar.dataset.productId = docRef.id;
                linhaAtualParaAtualizar.style.backgroundColor = '#d4edda';
                linhaAtualParaAtualizar.cells[1].querySelector('input').value = novoProduto.descricao;
                linhaAtualParaAtualizar.cells[8].innerHTML = 'Cadastrado!';
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
        configData.fornecedores = await loadConfigToMap('fornecedores');
        configData.grupos = await loadConfigToMap('grupos');
        configData.conversoes = await loadConfigToMap('conversoes');
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


    document.getElementById('mov-produto').addEventListener('change', updateProductInfo);


    document.getElementById('headers-row').addEventListener('click', e => {
        // ... (lógica de ordenação da tabela mantida)
    });

    document.getElementById('history-filters-container').addEventListener('input', e => {
        // ... (lógica de filtro da tabela mantida)
    });

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
        popularDropdownsCadastroModal();
    });
});

// Substitua a função inteira em js/movimentacoes.js por esta versão CORRIGIDA:
async function atualizarCustoMedioProduto(produtoId) {
    if (!produtoId) return;

    // A busca aqui foi corrigida para usar 'produtoId', a variável que a função recebe.
    // Este era o ponto do erro.
    const q = query(
        collection(db, 'movimentacoes'),
        where("productId", "==", produtoId), // <-- CORRIGIDO AQUI
        where("tipo", "==", "entrada")
    );
    const movementsSnapshot = await getDocs(q);

    let totalCost = 0;
    let totalQuantityForAvg = 0;

    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        if (mov.custo_total_entrada && mov.custo_total_entrada > 0) {
            if (mov.quantidade > 0) {
                totalCost += mov.custo_total_entrada;
                totalQuantityForAvg += mov.quantidade;
            }
        }
    });

    const novoCustoMedio = totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;
    const productRef = doc(db, 'produtos', produtoId);
    await setDoc(productRef, { valorMedio: novoCustoMedio }, { merge: true });

    console.log(`Custo médio do produto ${produtoId} atualizado para ${novoCustoMedio.toFixed(2)}`);
}
