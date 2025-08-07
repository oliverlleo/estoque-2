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

    // --- Campos do Formulário ---
    const entradaFields = [
        document.getElementById('mov-tipo-entrada'), document.getElementById('mov-nf'),
        document.getElementById('mov-valor-unitario'), document.getElementById('mov-icms'),
        document.getElementById('mov-ipi'), document.getElementById('mov-frete')
        // O campo 'mov-obra' será visível em ambos os modos
    ];
    const saidaFields = [
        document.getElementById('mov-tipo-saida'), document.getElementById('mov-requisitante'),
        document.getElementById('mov-estoque-display-wrapper')
        // Remova 'mov-obra' daqui, se estiver aqui.
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
                // Adiciona a classe no elemento pai (div ou form-group) se houver,
                // caso contrário, no próprio input.
                valorUnitarioInput.classList.add('required-field-visual-input');
            } else {
                valorUnitarioInput.required = false;
                valorUnitarioInput.classList.remove('required-field-visual-input');
            }
        } else {
            // Em modo Saída, o campo nunca é obrigatório e geralmente está oculto.
            valorUnitarioInput.required = false;
            valorUnitarioInput.classList.remove('required-field-visual-input');
        }
    }

    function toggleObraRequirement() {
        const isEntrada = toggle.checked;
        const obraSelect = document.getElementById('mov-obra');

        if (isEntrada) {
            // No modo de entrada, o campo Obra nunca é obrigatório.
            obraSelect.required = false;
            obraSelect.parentElement.classList.remove('required-field-visual');
            return;
        }

        // A lógica abaixo agora só se aplica ao modo de Saída.
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

    // --- Lógica do Interruptor (Toggle) ---
    function handleToggleChange() {
        const isEntrada = toggle.checked; // true para Entrada, false para Saída

        // Lógica de visibilidade do botão de importação
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

    toggle.addEventListener('change', handleToggleChange);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-saida').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleValorUnitarioRequirement);

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
            const productData = productsMap[productId];

            if (productData.e_sobra === true) {
                // É UMA SOBRA! CÁLCULO AUTOMÁTICO.
                try {
                    // 1. Buscar o custo médio do pai
                    const custoMedioPai = await calcularCustoMedioProduto(productData.produto_pai_id);
                    if (custoMedioPai <= 0) {
                        throw new Error("Não foi possível calcular o custo da sobra pois o produto original não possui custo de entrada.");
                    }

                    // 2. Buscar a regra de conversão
                    const conversaoRef = doc(db, 'conversoes', productData.conversaoId);
                    const conversaoDoc = await getDoc(conversaoRef);
                    if (!conversaoDoc.exists()) {
                        throw new Error("Regra de conversão não encontrada para este produto.");
                    }
                    const regra = conversaoDoc.data();
                    const fatorConversao = parseFloat(regra.fator_conversao_sobra);
                    if (!fatorConversao || fatorConversao <= 0) {
                        throw new Error("A regra de conversão não possui um 'fator de conversão para sobra' válido.");
                    }

                    // 3. Calcular o custo da sobra
                    const custoPorUnidadeSobra = custoMedioPai / fatorConversao;
                    const medidaDaSobra = parseFloat(productData.medida_sobra);
                    const custoCalculadoDaSobra = custoPorUnidadeSobra * medidaDaSobra;

                    // 4. Rodar a transação com o custo calculado
                    await runTransaction(db, async (transaction) => {
                        const productRef = doc(db, 'produtos', productId);
                        const pDoc = await transaction.get(productRef);
                        const newEstoque = (pDoc.data().estoque || 0) + 1; // Entrada de sobra é sempre 1 unidade
                        transaction.update(productRef, { estoque: newEstoque });

                        const movementRef = doc(collection(db, 'movimentacoes'));
                        transaction.set(movementRef, {
                            tipo: 'entrada',
                            productId,
                            data: serverTimestamp(),
                            quantidade: 1, // Sempre 1
                            custo_total_entrada: custoCalculadoDaSobra, // CUSTO CALCULADO!
                            observacao: `Entrada de sobra com custo calculado a partir do produto pai.`
                        });
                    });
                    alert('Entrada de sobra registrada com sucesso!');
                    formMovimentacao.reset();
                    handleToggleChange();

                } catch (error) {
                    console.error("Erro ao registrar entrada de sobra:", error);
                    showInfoModal(error.message); // Use seu modal de aviso
                }

            } else {
                // LÓGICA DE ENTRADA NORMAL (COMO JÁ EXISTE HOJE)
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
                        const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                        const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];

                        if (tipoEntradaConfig && tipoEntradaConfig.movimenta_estoque === true) {
                            const currentEstoque = productDoc.data().estoque || 0;
                            const newEstoque = currentEstoque + quantidadeParaEstoque; // quantidadeParaEstoque já foi calculada
                            transaction.update(productRef, { estoque: newEstoque });
                        }

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
                            quantidade: quantidadeParaEstoque,
                            quantidade_compra: quantidadeOriginalCompra,
                            custo_total_entrada: custoTotalEntrada // <-- NOSSO NOVO CAMPO!
                        };

                        transaction.set(movementRef, movementData);
                    });
                    alert('Entrada registrada com sucesso!');

                    const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                    const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];

                    if (tipoEntradaConfig && tipoEntradaConfig.recalcula_custo_medio === true) {
                        await atualizarCustoMedioProduto(productId);
                    }

                    formMovimentacao.reset();
                    handleToggleChange();
                } catch (error) {
                    console.error("Erro na transação de entrada:", error);
                    showInfoModal(error.message);
                }
            }
        } else { // Saída
            const tipoSaidaId = document.getElementById('mov-tipo-saida').value;
            const tipoSaidaConfig = configData.tipos_saida[tipoSaidaId];

            if (tipoSaidaConfig && tipoSaidaConfig.reservar_estoque === true) {
                // Lógica de Reserva
                try {
                    const movementData = {
                        tipo: 'reserva',
                        productId,
                        quantidade,
                        data: serverTimestamp(),
                        tipo_saidaId: tipoSaidaId,
                        requisitante: document.getElementById('mov-requisitante').value,
                        obraId: document.getElementById('mov-obra').value,
                        observacao: document.getElementById('mov-observacao').value,
                    };
                    await addDoc(collection(db, 'movimentacoes'), movementData);
                    alert('Reserva registrada com sucesso!');
                    formMovimentacao.reset();
                    handleToggleChange();
                } catch (error) {
                    console.error("Erro ao registrar reserva:", error);
                    showInfoModal(error.message);
                }
            } else {
                // Lógica de Saída Normal
                try {
                    await runTransaction(db, async (transaction) => {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error("Produto não encontrado!");

                        if (tipoSaidaConfig && tipoSaidaConfig.movimenta_estoque === true) {
                            const currentEstoque = productDoc.data().estoque || 0;
                            if (currentEstoque < quantidade) {
                                throw new Error(`Estoque insuficiente! Disponível: ${currentEstoque}`);
                            }
                            const newEstoque = currentEstoque - quantidade;
                            transaction.update(productRef, { estoque: newEstoque });
                        }

                        const movementRef = doc(collection(db, 'movimentacoes'));
                        const movementData = {
                            tipo: 'saida',
                            productId,
                            quantidade,
                            data: serverTimestamp(),
                            tipo_saidaId: tipoSaidaId,
                            requisitante: document.getElementById('mov-requisitante').value,
                            obraId: document.getElementById('mov-obra').value,
                            observacao: document.getElementById('mov-observacao').value,
                            valorMedioHistorico: productDoc.data().valorMedio || 0
                        };
                        transaction.set(movementRef, movementData);
                    });
                    alert('Saída registrada com sucesso!');
                    formMovimentacao.reset();
                    handleToggleChange();
                } catch (error) {
                    console.error("Erro ao registrar saída:", error);
                    showInfoModal(error.message);
                }
            }
        }
    });

    // --- Lógica do Modal de Importação XML ---
    btnImportarXml.addEventListener('click', () => {
        xmlImportModal.style.display = 'block';
    });
    xmlModalClose.addEventListener('click', () => {
        xmlImportModal.style.display = 'none';
    });
    window.addEventListener('click', (event) => {
        if (event.target == xmlImportModal) {
            xmlImportModal.style.display = 'none';
        }
    });

    // Listener para o input de arquivo
    xmlFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const xmlText = e.target.result;
            parseNFeXML(xmlText);
        };
        reader.readAsText(file);
    });

    function parseNFeXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Limpa a tabela antes de popular
        xmlProductsTableBody.innerHTML = '';

        const nfeNumero = xmlDoc.querySelector('nNF')?.textContent || '';
        inputNfeNumero.value = nfeNumero;

        const totalFrete = parseFloat(xmlDoc.querySelector('ICMSTot vFrete')?.textContent || 0);
        const totalProdutos = parseFloat(xmlDoc.querySelector('ICMSTot vProd')?.textContent || 0);

        const items = xmlDoc.querySelectorAll('det');
        items.forEach(item => {
            const cProd = item.querySelector('cProd')?.textContent;

            // Busca o produto no sistema
            const produtoNoSistema = Object.values(productsMap).find(p => p.codigo === cProd);
            const descricaoSistema = produtoNoSistema ? produtoNoSistema.descricao : 'PRODUTO NÃO CADASTRADO';
            const produtoIdSistema = produtoNoSistema ? produtoNoSistema.id : '';

            const qCom = item.querySelector('qCom')?.textContent;
            const uCom = item.querySelector('uCom')?.textContent;
            const vUnCom = item.querySelector('vUnCom')?.textContent;
            const vProd = parseFloat(item.querySelector('vProd')?.textContent || 0);

            // ICMS e IPI (pegando o primeiro valor que encontrar, robustez básica)
            const vICMS = item.querySelector('vICMS')?.textContent || '0.00';
            const vIPI = item.querySelector('vIPI')?.textContent || '0.00';

            // Rateio do frete
            const freteRateado = (totalProdutos > 0) ? (vProd / totalProdutos) * totalFrete : 0;

            const row = document.createElement('tr');
            row.dataset.productId = produtoIdSistema; // Armazena o ID do produto do sistema

            if (!produtoNoSistema) {
              row.style.backgroundColor = '#ffdddd'; // Destaca linha de produto não encontrado
            }

            row.innerHTML = `
                <td><input type="text" class="form-control" value="${cProd}" disabled></td>
                <td><input type="text" class="form-control" value="${descricaoSistema}" disabled></td>
                <td><input type="text" class="form-control" value="${uCom}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(qCom)}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(vUnCom)}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(vICMS)}"></td>
                <td><input type="number" step="any" class="form-control" value="${parseFloat(vIPI)}"></td>
                <td><input type="number" step="any" class="form-control" value="${freteRateado.toFixed(2)}"></td>
            `;
            xmlProductsTableBody.appendChild(row);
        });
    }

    btnConfirmarXmlImport.addEventListener('click', async () => {
        const nfNumero = inputNfeNumero.value;
        const rows = xmlProductsTableBody.querySelectorAll('tr');
        if (rows.length === 0) {
            alert("Nenhum produto na lista para importar.");
            return;
        }

        if (!confirm(`Confirmar a entrada de ${rows.length} item(ns) da NF-e ${nfNumero}?`)) {
            return;
        }

        for (const row of rows) {
            const productId = row.dataset.productId;
            if (!productId) {
                const codigo = row.cells[0].querySelector('input').value;
                alert(`Produto com código ${codigo} não está cadastrado e será ignorado.`);
                continue; // Pula para o próximo item
            }

            const inputs = row.querySelectorAll('input');
            const quantidade = parseFloat(inputs[3].value);
            const valorUnitario = parseFloat(inputs[4].value);
            const icms = parseFloat(inputs[5].value);
            const ipi = parseFloat(inputs[6].value);
            const frete = parseFloat(inputs[7].value);

            // Calcula o custo total da entrada para este item
            const custoTotalItem = (quantidade * valorUnitario) + icms + ipi + frete;

            try {
                await runTransaction(db, async (transaction) => {
                    const productRef = doc(db, 'produtos', productId);
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) {
                        throw new Error(`Produto com ID ${productId} não foi encontrado.`);
                    }

                    // A lógica de atualização de estoque e custo médio já existe
                    const currentEstoque = productDoc.data().estoque || 0;
                    const newEstoque = currentEstoque + quantidade;
                    transaction.update(productRef, { estoque: newEstoque });

                    const movementRef = doc(collection(db, 'movimentacoes'));
                    const movementData = {
                        tipo: 'entrada',
                        productId,
                        quantidade,
                        data: serverTimestamp(),
                        nf: nfNumero,
                        valor_unitario: valorUnitario,
                        icms: icms,
                        ipi: ipi,
                        frete: frete,
                        observacao: `Importado via XML da NF-e ${nfNumero}`,
                        custo_total_entrada: custoTotalItem
                    };
                    transaction.set(movementRef, movementData);
                });

                // Atualiza o custo médio após a transação ser bem sucedida
                await atualizarCustoMedioProduto(productId);

            } catch (error) {
                console.error("Erro ao importar item:", error);
                alert(`Falha ao importar o produto ${row.cells[0].querySelector('input').value}: ${error.message}`);
            }
        }

        alert("Importação finalizada. Verifique o histórico de movimentações.");
        xmlImportModal.style.display = 'none';
        xmlFileInput.value = ''; // Limpa o input de arquivo
        xmlProductsTableBody.innerHTML = '';
    });

    // --- Carregamento e preenchimento de dados ---
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

        const isSobra = product && product.e_sobra === true;
        const isEntrada = document.getElementById('movement-toggle').checked;

        const costFields = ['mov-valor-unitario', 'mov-icms', 'mov-ipi', 'mov-frete'];
        // Para sobras, a quantidade é sempre 1, então desabilitamos o campo de quantidade também.
        const quantField = document.getElementById('mov-quantidade');

        if(isEntrada) {
            costFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                field.disabled = isSobra;
                if (isSobra) field.value = ''; // Limpa o campo
            });

            quantField.disabled = isSobra;
            if (isSobra) {
                 quantField.value = 1; // Define a quantidade como 1 para sobras
                 quantField.placeholder = "Entrada de sobra é sempre 1 Unidade";
            } else {
                 quantField.placeholder = "Quantidade";
            }
        } else {
            // Garante que os campos de custo estejam sempre habilitados na saída (se visíveis)
            costFields.forEach(fieldId => document.getElementById(fieldId).disabled = false);
            quantField.disabled = false;
            quantField.placeholder = "Quantidade";
        }
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
