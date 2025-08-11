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

    toggle.addEventListener('change', handleToggleChange);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-saida').addEventListener('change', toggleObraRequirement);
    document.getElementById('mov-tipo-entrada').addEventListener('change', toggleValorUnitarioRequirement);

    formMovimentacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnMovimentacao.disabled = true;
        btnMovimentacao.textContent = 'Processando...';

        const isEntrada = toggle.checked;
        const productId = document.getElementById('mov-produto').value;
        const quantidade = parseFloat(document.getElementById('mov-quantidade').value);
        const observacao = document.getElementById('mov-observacao').value;

        if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha todos os campos obrigatórios corretamente.');
            btnMovimentacao.disabled = false;
            handleToggleChange(); // Restaura o texto do botão
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) {
                    throw new Error("Produto não encontrado.");
                }

                const productData = productDoc.data();
                const currentEstoque = productData.estoque || 0;
                let newEstoque;
                const movementData = {
                    productId,
                    quantidade,
                    observacao,
                    data: serverTimestamp(),
                    userId: 'defaultUser' // Substituir por usuário logado se houver autenticação
                };

                if (isEntrada) {
                    const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                    const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];

                    if (tipoEntradaConfig?.movimenta_estoque === false) {
                        newEstoque = currentEstoque; // Não altera o estoque
                    } else {
                        newEstoque = currentEstoque + quantidade;
                    }

                    const valorUnitario = parseFloat(document.getElementById('mov-valor-unitario').value) || 0;
                    const icms = parseFloat(document.getElementById('mov-icms').value) || 0;
                    const ipi = parseFloat(document.getElementById('mov-ipi').value) || 0;
                    const frete = parseFloat(document.getElementById('mov-frete').value) || 0;
                    const custoTotal = (valorUnitario * quantidade) + icms + ipi + frete;

                    Object.assign(movementData, {
                        tipo: 'entrada',
                        tipoEntradaId,
                        nf: document.getElementById('mov-nf').value,
                        valor_unitario: valorUnitario,
                        icms,
                        ipi,
                        frete,
                        custo_total_entrada: custoTotal
                    });

                } else { // É Saída
                    const tipoSaidaId = document.getElementById('mov-tipo-saida').value;
                    const tipoSaidaConfig = configData.tipos_saida[tipoSaidaId];

                    if (tipoSaidaConfig?.movimenta_estoque === false) {
                        newEstoque = currentEstoque;
                    } else {
                        if (currentEstoque < quantidade) {
                            throw new Error('Estoque insuficiente para a saída.');
                        }
                        newEstoque = currentEstoque - quantidade;
                    }

                    Object.assign(movementData, {
                        tipo: 'saida',
                        tipoSaidaId,
                        requisitante: document.getElementById('mov-requisitante').value,
                        obraId: document.getElementById('mov-obra').value
                    });
                }

                transaction.update(productRef, { estoque: newEstoque });
                const movementRef = doc(collection(db, 'movimentacoes'));
                transaction.set(movementRef, movementData);
            });

            // Apenas recalcula o custo se for uma entrada que informa valor
            if (isEntrada) {
                 const tipoEntradaId = document.getElementById('mov-tipo-entrada').value;
                 const tipoEntradaConfig = configData.tipos_entrada[tipoEntradaId];
                 if (tipoEntradaConfig?.recalcula_custo_medio === true) {
                    await atualizarCustoMedioProduto(productId);
                 }
            }

            alert('Movimentação registrada com sucesso!');
            formMovimentacao.reset();
            updateProductInfo(); // Limpa os campos de info do produto
            toggleObraRequirement(); // Reseta a obrigatoriedade
            toggleValorUnitarioRequirement(); // Reseta a obrigatoriedade

        } catch (error) {
            console.error("Erro ao registrar movimentação: ", error);
            alert(`Falha ao registrar movimentação: ${error.message}`);
        } finally {
            btnMovimentacao.disabled = false;
            handleToggleChange(); // Restaura o texto e estado do botão
        }
    });

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
        // ... (lógica de confirmação da importação mantida)
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

    function updateProductInfo() {
        // ... (lógica de atualização de info do produto mantida)
    }

    document.getElementById('mov-produto').addEventListener('change', updateProductInfo);

    function updateTable() {
        // ... (lógica de atualização da tabela de histórico mantida)
    }

    document.getElementById('headers-row').addEventListener('click', e => {
        // ... (lógica de ordenação da tabela mantida)
    });

    document.getElementById('history-filters-container').addEventListener('input', e => {
        // ... (lógica de filtro da tabela mantida)
    });

    onSnapshot(collection(db, 'movimentacoes'), (snapshot) => {
        allMovements = snapshot.docs.map(doc => ({ id: doc.id, ...data }));
        if (initialDataLoaded) updateTable();
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
