import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, onSnapshot, doc, setDoc, deleteDoc, query, where, runTransaction, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Produtos carregada.");

    const form = document.getElementById('form-produto');
    const tableBody = document.querySelector('#table-produtos tbody');
    const filterInput = document.getElementById('filter-produtos');
    const formToggle = document.getElementById('form-toggle');
    const formWrapperProduto = document.getElementById('form-wrapper-produto');
    const formWrapperSobra = document.getElementById('form-wrapper-sobra');
    const formSobra = document.getElementById('form-sobra');
    const formTitle = document.getElementById('form-title');
    const labelSobra = document.getElementById('toggle-label-sobra');
    const labelProduto = document.getElementById('toggle-label-produto');
    const selectSobraOriginal = document.getElementById('sobra-produto-original');

    const codigoInput = document.getElementById('produto-codigo');
    const productIdInput = document.getElementById('produto-id');

    let productsData = [];
    const configData = {};

    // --- Lógica para Múltiplas Locações ---
    const btnAddLocacao = document.getElementById('btn-add-locacao');
    const locacoesContainer = document.getElementById('locacoes-container');

    const createLocacaoItem = (locacao = {}) => {
        const locacaoItem = document.createElement('div');
        locacaoItem.className = 'locacao-item';

        const codigoInputEl = document.createElement('input');
        codigoInputEl.type = 'text';
        codigoInputEl.placeholder = 'Ex: 10-A-01-B';
        codigoInputEl.className = 'form-control locacao-codigo-input';
        codigoInputEl.pattern = '\\d{2}-[A-Za-z]-\\d{2}-[A-Za-z]';
        codigoInputEl.title = 'Formato esperado: XX-L-XX-L (ex: 10-A-01-B)';
        codigoInputEl.value = locacao.codigo || '';
        codigoInputEl.required = true;

        const localSelect = document.createElement('select');
        localSelect.className = 'form-control locacao-local-select';
        localSelect.required = true;

        localSelect.innerHTML = `<option value="">Selecione o Local...</option>`;
        for (const [id, local] of Object.entries(configData.locais)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = local.nome;
            if (locacao.localId === id) {
                option.selected = true;
            }
            localSelect.appendChild(option);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remover';
        removeBtn.className = 'btn btn-danger btn-remove-locacao';
        removeBtn.addEventListener('click', () => {
            locacaoItem.remove();
        });

        locacaoItem.appendChild(codigoInputEl);
        locacaoItem.appendChild(localSelect);
        locacaoItem.appendChild(removeBtn);

        locacoesContainer.appendChild(locacaoItem);
    };

    function applyFilters() {
        const generalSearchTerm = filterInput.value.toLowerCase();

        const filteredData = productsData.filter(product => {
            if (generalSearchTerm === '') return true;

            const pData = product.data;

            const textToSearch = [
                pData.codigo,
                pData.descricao,
                pData.un,
                pData.cor,
                configData.fornecedores[pData.fornecedorId]?.nome,
                configData.grupos[pData.grupoId]?.nome,
            ].join(' ').toLowerCase();

            const matchesGeneral = textToSearch.includes(generalSearchTerm);

            const matchesLocacao = pData.locacoes && pData.locacoes.some(loc => {
                const localNome = configData.locais[loc.localId]?.nome || '';
                const locacaoCompleta = `${localNome} - ${loc.codigo}`;
                return locacaoCompleta.toLowerCase().includes(generalSearchTerm);
            });

            return matchesGeneral || matchesLocacao;
        });

        renderTable(filteredData);
    }

    // --- Validação de Código Duplicado em Tempo Real ---
    codigoInput.addEventListener('input', () => {
        const codigo = codigoInput.value.trim();
        const currentId = productIdInput.value;

        if (!codigo) {
            codigoInput.classList.remove('is-invalid');
            return;
        }

        const isDuplicate = productsData.some(product =>
            product.data.codigo.toLowerCase() === codigo.toLowerCase() && product.id !== currentId
        );

        if (isDuplicate) {
            codigoInput.classList.add('is-invalid');
        } else {
            codigoInput.classList.remove('is-invalid');
        }
    });

    formToggle.addEventListener('change', () => {
        const isProduto = formToggle.checked;
        if (isProduto) {
             formWrapperProduto.style.display = 'block';
             formWrapperSobra.style.display = 'none';
             formTitle.textContent = 'Cadastro de Produto';
             labelProduto.style.fontWeight = 'bold';
             labelProduto.style.color = '#0d6efd';
             labelSobra.style.fontWeight = 'normal';
             labelSobra.style.color = '#6c757d';
        } else {
            formWrapperProduto.style.display = 'none';
            formWrapperSobra.style.display = 'block';
            formTitle.textContent = 'Cadastro de Sobra';
            labelSobra.style.fontWeight = 'bold';
            labelSobra.style.color = '#0d6efd';
            labelProduto.style.fontWeight = 'normal';
            labelProduto.style.color = '#6c757d';
        }
    });

    // 1. Fetch all configuration data for dropdowns and mapping
    const configCollections = [
        { name: 'fornecedor', collectionName: 'fornecedores', displayField: 'nome' },
        { name: 'grupo', collectionName: 'grupos', displayField: 'nome' },
        { name: 'local', collectionName: 'locais', displayField: 'nome' },
    ];

    for (const config of configCollections) {
        const selectElement = document.getElementById(`produto-${config.name}`);
        const colRef = collection(db, config.collectionName);
        const snapshot = await getDocs(colRef);

        configData[config.collectionName] = {};
        if (selectElement) {
             selectElement.innerHTML = `<option value="">Selecione ${config.name}...</option>`;
        }

        snapshot.docs.forEach(doc => {
            const id = doc.id;
            const data = doc.data();
            configData[config.collectionName][id] = data;

            if (selectElement) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = config.displayFunction ? config.displayFunction(data, configData) : data[config.displayField];
                selectElement.appendChild(option);
            }
        });
    }

    // Populate Conversions Select
    const conversaoSelect = document.getElementById('produto-conversao');
    const conversoesSnapshot = await getDocs(collection(db, 'conversoes'));
    conversoesSnapshot.forEach(doc => {
        const conversao = doc.data();
        const displayText = `${conversao.qtd_compra}${conversao.medida_compra} X ${conversao.qtd_padrao}${conversao.medida_padrao}`;
        conversaoSelect.innerHTML += `<option value="${doc.id}" title="${conversao.nome_regra}">${displayText}</option>`;
    });

    btnAddLocacao.addEventListener('click', () => createLocacaoItem());

    const fileInput = document.getElementById('import-excel-input');
    fileInput.addEventListener('change', handleFileImport);

    function setupMultiSelect(containerId, items) {
        const container = document.getElementById(containerId);
        const displayArea = container.querySelector('.multiselect-display-area');
        const placeholder = container.querySelector('.multiselect-placeholder');
        const optionsContainer = container.querySelector('.multiselect-options');

        optionsContainer.innerHTML = '';
        const list = document.createElement('ul');
        for (const [id, data] of Object.entries(items)) {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<input type="checkbox" data-id="${id}" data-name="${data.nome}"> ${data.nome}`;
            list.appendChild(listItem);
        }
        optionsContainer.appendChild(list);

        displayArea.addEventListener('click', () => {
            optionsContainer.style.display = optionsContainer.style.display === 'block' ? 'none' : 'block';
        });

        optionsContainer.addEventListener('change', () => {
            const selected = optionsContainer.querySelectorAll('input[type="checkbox"]:checked');
            if (selected.length === 0) {
                placeholder.textContent = `Selecione...`;
                placeholder.style.color = '';
            } else {
                placeholder.textContent = `${selected.length} selecionado(s)`;
                placeholder.style.color = '#212529';
            }
        });

        return {
            getSelectedIds: () => Array.from(optionsContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.id),
            setSelectedIds: (ids = []) => {
                optionsContainer.querySelectorAll('input').forEach(cb => {
                    cb.checked = ids.includes(cb.dataset.id);
                });
                optionsContainer.dispatchEvent(new Event('change'));
            }
        };
    }

    const aplicacoesSnapshot = await getDocs(collection(db, 'aplicacoes'));
    configData['aplicacoes'] = {};
    aplicacoesSnapshot.forEach(doc => configData['aplicacoes'][doc.id] = doc.data());
    const aplicacaoSelect = setupMultiSelect('multiselect-aplicacao', configData['aplicacoes']);

    const conjuntosSnapshot = await getDocs(collection(db, 'conjuntos'));
    configData['conjuntos'] = {};
    conjuntosSnapshot.forEach(doc => configData['conjuntos'][doc.id] = doc.data());
    const conjuntoSelect = setupMultiSelect('multiselect-conjunto', configData['conjuntos']);

    window.addEventListener('click', function(e) {
        if (!document.getElementById('multiselect-aplicacao').contains(e.target)) {
            document.querySelector('#multiselect-aplicacao .multiselect-options').style.display = 'none';
        }
        if (!document.getElementById('multiselect-conjunto').contains(e.target)) {
            document.querySelector('#multiselect-conjunto .multiselect-options').style.display = 'none';
        }
    });

    function populateSobraSelect() {
        const firstOption = selectSobraOriginal.options[0];
        selectSobraOriginal.innerHTML = '';
        selectSobraOriginal.appendChild(firstOption);

        productsData.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.data.codigo} - ${product.data.descricao}`;
            selectSobraOriginal.appendChild(option);
        });
    }

    selectSobraOriginal.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const displayInfo = {
            codigo: '-', descricao: '-', un: '-', locacao: '-'
        };

        if (selectedId) {
            const product = productsData.find(p => p.id === selectedId);
            if (product) {
                let locacaoCompleta = 'N/A';
                if (product.data.locacoes && Array.isArray(product.data.locacoes) && product.data.locacoes.length > 0) {
                    locacaoCompleta = product.data.locacoes.map(loc => {
                        const localNome = configData.locais[loc.localId]?.nome || 'Local desconhecido';
                        return `${localNome} - ${loc.codigo}`;
                    }).join(', ');
                }

                displayInfo.codigo = product.data.codigo;
                displayInfo.descricao = product.data.descricao;
                displayInfo.un = product.data.un;
                displayInfo.locacao = locacaoCompleta;
            }
        }
        document.getElementById('sobra-codigo-display').textContent = displayInfo.codigo;
        document.getElementById('sobra-descricao-display').textContent = displayInfo.descricao;
        document.getElementById('sobra-un-display').textContent = displayInfo.un;
        document.getElementById('sobra-locacao-display').textContent = displayInfo.locacao;
    });

    formSobra.addEventListener('submit', async (e) => {
        e.preventDefault();
        const originalProductId = selectSobraOriginal.value;
        const medidaSobraStr = document.getElementById('sobra-medida').value;

        if (!originalProductId || !medidaSobraStr) {
            alert('Por favor, selecione um produto original e informe a medida da sobra.');
            return;
        }

        const medidaSobra = parseFloat(medidaSobraStr.replace(',', '.'));

        try {
            const originalProductData = productsData.find(p => p.id === originalProductId)?.data;
            if (!originalProductData) {
                throw new Error('Produto original não encontrado.');
            }

            const movementsSnapshot = await getDocs(collection(db, 'movimentacoes'));
            const productMovements = movementsSnapshot.docs
                .map(doc => doc.data())
                .filter(mov => mov.productId === originalProductId && mov.tipo === 'entrada' && mov.custo_total_entrada > 0);

            let totalCost = 0;
            let totalQuantityForAvg = 0;
            productMovements.forEach(m => {
                totalCost += (m.custo_total_entrada || 0);
                totalQuantityForAvg += m.quantidade;
            });
            const custoMedioDaPecaOriginal = totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;

            if (custoMedioDaPecaOriginal === 0) {
                throw new Error('Não foi possível calcular o custo do produto original. Verifique se ele possui movimentações de entrada com custo.');
            }

            if (!originalProductData.conversaoId) {
                throw new Error('O produto original não possui uma regra de conversão associada. Não é possível calcular o custo proporcional.');
            }
            const conversaoRef = doc(db, 'conversoes', originalProductData.conversaoId);
            const conversaoSnap = await getDoc(conversaoRef);
            if (!conversaoSnap.exists()) {
                throw new Error('Regra de conversão não encontrada.');
            }
            const conversaoData = conversaoSnap.data();

            const qtdCompra = parseFloat(String(conversaoData.qtd_compra).replace(',', '.'));
            const medidaCompra = conversaoData.medida_compra.toLowerCase();
            let dimensaoPadraoNaUnidadeSobra = qtdCompra;

            if (medidaCompra === 'm') {
                dimensaoPadraoNaUnidadeSobra *= 1000;
            } else if (medidaCompra === 'cm') {
                dimensaoPadraoNaUnidadeSobra *= 10;
            }

            if (dimensaoPadraoNaUnidadeSobra <= 0) {
                throw new Error('A dimensão padrão na regra de conversão é inválida.');
            }

            const custoProporcionalDaSobra = (medidaSobra / dimensaoPadraoNaUnidadeSobra) * custoMedioDaPecaOriginal;

            await runTransaction(db, async (transaction) => {
                const newSobraProductData = {
                    ...originalProductData,
                    codigo: `${originalProductData.codigo}-S${medidaSobraStr}`,
                    medida_sobra: medidaSobraStr,
                    estoque: 1, // Estoque legado, pode ser removido no futuro
                };
                delete newSobraProductData.id;

                const newProductRef = doc(collection(db, 'produtos'));
                transaction.set(newProductRef, newSobraProductData);

                const newMovementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'entrada',
                    productId: newProductRef.id,
                    quantidade: 1,
                    custo_total_entrada: custoProporcionalDaSobra,
                    data: serverTimestamp(),
                    observacao: `Entrada de sobra proporcional do produto ${originalProductData.codigo}`,
                    locacaoCodigo: newSobraProductData.locacoes[0]?.codigo || 'N/A' // Pega a primeira locação
                };
                transaction.set(newMovementRef, movementData);

                // Cria o estoque na subcoleção
                if (newSobraProductData.locacoes && newSobraProductData.locacoes.length > 0) {
                    const estoqueRef = doc(db, 'produtos', newProductRef.id, 'estoquePorLocacao', newSobraProductData.locacoes[0].codigo);
                    transaction.set(estoqueRef, { quantidade: 1 });
                }
            });

            alert(`Sobra cadastrada com sucesso! Custo proporcional calculado: R$ ${custoProporcionalDaSobra.toFixed(2)}`);
            formSobra.reset();
            selectSobraOriginal.dispatchEvent(new Event('change'));

        } catch (error) {
            console.error("Erro detalhado ao salvar sobra:", error);
            alert(`Erro ao salvar a sobra: ${error.message}`);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (codigoInput.classList.contains('is-invalid')) {
            alert('O código do produto já existe. Por favor, insira um código único.');
            return;
        }

        const productId = document.getElementById('produto-id').value;
        const newCode = document.getElementById('produto-codigo').value;
        const isDuplicate = productsData.some(
            product => product.data.codigo.toLowerCase() === newCode.toLowerCase() && product.id !== productId
        );

        if (isDuplicate) {
            alert(`Erro: O código "${newCode}" já está cadastrado.`);
            return;
        }

        const locacoes = [];
        document.querySelectorAll('#locacoes-container .locacao-item').forEach(item => {
            const codigo = item.querySelector('.locacao-codigo-input').value.trim();
            const localId = item.querySelector('.locacao-local-select').value;
            if (codigo && localId) {
                locacoes.push({ codigo, localId });
            }
        });

        if (locacoes.length === 0) {
            alert('Adicione pelo menos uma locação para o produto.');
            return;
        }

        const product = {
            codigo: newCode,
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            cor: document.getElementById('produto-cor').value,
            locacoes: locacoes,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            aplicacaoIds: aplicacaoSelect.getSelectedIds(),
            conjuntoIds: conjuntoSelect.getSelectedIds(),
            conversaoId: document.getElementById('produto-conversao').value,
            arquivado: false
        };

        try {
            if (productId) {
                await setDoc(doc(db, 'produtos', productId), product, { merge: true });
                alert('Produto atualizado com sucesso!');
            } else {
                await addDoc(collection(db, 'produtos'), product);
                alert('Produto cadastrado com sucesso!');
            }
            form.reset();
            document.getElementById('produto-id').value = '';
            locacoesContainer.innerHTML = '';
            aplicacaoSelect.setSelectedIds([]);
            conjuntoSelect.setSelectedIds([]);
            codigoInput.classList.remove('is-invalid');
            filterInput.value = '';
            applyFilters();

        } catch (error) {
            console.error("Erro ao salvar produto:", error);
            alert(`Erro ao salvar: ${error.message}`);
        }
    });

    const renderTable = (data) => {
        tableBody.innerHTML = '';
        data.forEach(product => {
            const row = document.createElement('tr');
            const pData = product.data;

            const fornecedor = configData.fornecedores[pData.fornecedorId]?.nome || 'N/A';
            const grupo = configData.grupos[pData.grupoId]?.nome || 'N/A';

            let locacaoCompleta = 'N/A';
            if (pData.locacoes && Array.isArray(pData.locacoes) && pData.locacoes.length > 0) {
                locacaoCompleta = pData.locacoes.map(loc => {
                    const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                    return `${localNome} - ${loc.codigo}`;
                }).join(', ');
            }

            const aplicacoesNomes = (pData.aplicacaoIds || [])
                .map(id => configData.aplicacoes[id]?.nome || 'N/A')
                .join(', ');

            row.innerHTML = `
                <td><input type="checkbox" class="produto-checkbox" data-id="${product.id}"></td>
                <td>${pData.codigo}</td>
                <td>${pData.descricao}</td>
                <td>${pData.un}</td>
                <td>${pData.cor}</td>
                <td>${fornecedor}</td>
                <td>${grupo}</td>
                <td>${aplicacoesNomes}</td>
                <td>${locacaoCompleta}</td>
                <td>${pData.medida_sobra || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
    };

    const q = query(collection(db, 'produtos'), where("arquivado", "!=", true));
    onSnapshot(q, (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        applyFilters();
        populateSobraSelect();
    });

    document.getElementById('btn-importar-excel').addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    document.getElementById('btn-exportar-modelo').addEventListener('click', (e) => { e.preventDefault(); exportarModeloExcel(); });

    const btnEditarSelecionado = document.getElementById('btn-editar-selecionado');
    const btnExcluirSelecionados = document.getElementById('btn-excluir-selecionados');
    const checkboxMestre = document.getElementById('checkbox-mestre');

    checkboxMestre.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.produto-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });

    tableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('produto-checkbox')) {
            const todosCheckboxes = document.querySelectorAll('.produto-checkbox');
            const total = todosCheckboxes.length;
            const marcados = document.querySelectorAll('.produto-checkbox:checked').length;

            if (marcados === 0) {
                checkboxMestre.checked = false;
                checkboxMestre.indeterminate = false;
            } else if (marcados === total) {
                checkboxMestre.checked = true;
                checkboxMestre.indeterminate = false;
            } else {
                checkboxMestre.indeterminate = true;
            }
        }
    });

    btnExcluirSelecionados.addEventListener('click', async () => {
        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length === 0) {
            alert('Por favor, selecione ao menos um produto para excluir.');
            return;
        }

        if (confirm(`Tem certeza que deseja ARQUIVAR ${checkboxesMarcados.length} produto(s)? Eles não aparecerão nas listas, mas seu histórico será mantido.`)) {
            const promises = [];
            checkboxesMarcados.forEach(checkbox => {
                const id = checkbox.dataset.id;
                promises.push(setDoc(doc(db, 'produtos', id), { arquivado: true }, { merge: true }));
            });

            try {
                await Promise.all(promises);
                alert(`${promises.length} produto(s) arquivado(s) com sucesso!`);
                checkboxMestre.checked = false;
            } catch (error) {
                alert(`Erro ao arquivar produtos: ${error.message}`);
                console.error("Erro ao arquivar em lote:", error);
            }
        }
    });

    btnEditarSelecionado.addEventListener('click', () => {
        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length !== 1) {
            alert('Por favor, selecione exatamente um produto para editar.');
            return;
        }

        const id = checkboxesMarcados[0].dataset.id;
        const product = productsData.find(p => p.id === id);

        if (product) {
            locacoesContainer.innerHTML = '';
            document.getElementById('produto-id').value = product.id;
            document.getElementById('produto-codigo').value = product.data.codigo;
            document.getElementById('produto-descricao').value = product.data.descricao;
            document.getElementById('produto-un').value = product.data.un;
            document.getElementById('produto-cor').value = product.data.cor;
            document.getElementById('produto-fornecedor').value = product.data.fornecedorId;
            document.getElementById('produto-grupo').value = product.data.grupoId;
            document.getElementById('produto-conversao').value = product.data.conversaoId || "";

            aplicacaoSelect.setSelectedIds(product.data.aplicacaoIds);
            conjuntoSelect.setSelectedIds(product.data.conjuntoIds);

            if (product.data.locacoes && Array.isArray(product.data.locacoes)) {
                product.data.locacoes.forEach(loc => createLocacaoItem(loc));
            }

            form.scrollIntoView({ behavior: 'smooth' });
        }
    });

    filterInput.addEventListener('input', applyFilters);

    document.getElementById('btn-gerar-etiquetas').addEventListener('click', (e) => {
        e.preventDefault();

        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length === 0) {
            return alert("Selecione ao menos um produto para gerar etiquetas.");
        }

        const idsSelecionados = Array.from(checkboxesMarcados).map(cb => cb.dataset.id);

        const dadosParaEtiqueta = productsData
            .filter(product => idsSelecionados.includes(product.id))
            .map(product => {
                const pData = product.data;
                let locacaoCompleta = 'N/A';
                if (pData.locacoes && Array.isArray(pData.locacoes) && pData.locacoes.length > 0) {
                    locacaoCompleta = pData.locacoes.map(loc => {
                        const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                        return `${localNome} - ${loc.codigo}`;
                    }).join(', ');
                }

                return {
                    id: product.id,
                    data: pData,
                    enderecamento: locacaoCompleta
                };
            });

        if (dadosParaEtiqueta.length > 0) {
            localStorage.setItem('etiquetasParaImprimir', JSON.stringify(dadosParaEtiqueta));
            window.open('etiquetas.html', '_blank');
        }
    });

    const dropdownBtn = document.querySelector('.dropdown .btn');
    const dropdownContainer = document.querySelector('.dropdown');

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContainer.classList.toggle('active');
    });

    window.addEventListener('click', () => {
        if (dropdownContainer.classList.contains('active')) {
            dropdownContainer.classList.remove('active');
        }
    });

    const progressModal = document.getElementById('import-progress-modal');
    const progressMessage = document.getElementById('import-progress-message');
    const progressBar = document.getElementById('import-progress-bar');

    async function findIdByName(collectionName, fieldName, value, cache) {
        if (!value) return null;
        const lowerCaseValue = String(value).trim().toLowerCase();

        const data = cache[collectionName];
        if (!data) {
            console.error(`Cache para ${collectionName} não foi pré-carregado.`);
            return null;
        }

        const found = data.find(item => String(item[fieldName]).trim().toLowerCase() === lowerCaseValue);
        return found ? found.id : null;
    }

    function findConversaoId(valorPlanilha, todasConversoes) {
        if (!valorPlanilha) return null;
        const normalize = (str) => String(str).toLowerCase().replace(/,/g, '.').replace(/[^a-z0-9.]/g, '');
        const valorNormalizado = normalize(valorPlanilha);
        for (const conv of todasConversoes) {
            if (normalize(conv.nome_regra) === valorNormalizado) return conv.id;
            const formula = `${conv.qtd_compra}${conv.medida_compra}X${conv.qtd_padrao}${conv.medida_padrao}`;
            if (normalize(formula) === valorNormalizado) return conv.id;
        }
        return null;
    }

    async function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { raw: false });

            if (json.length === 0) {
                alert("A planilha está vazia ou em um formato inválido.");
                return;
            }

            progressModal.style.display = 'block';

            const cache = {};
            const collectionsToCache = ['fornecedores', 'grupos', 'aplicacoes', 'conjuntos', 'locais', 'conversoes'];
            for (const name of collectionsToCache) {
                const snapshot = await getDocs(collection(db, name));
                cache[name] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            let successCount = 0;
            let errorCount = 0;
            let errors = [];
            const totalRows = json.length;

            for (let i = 0; i < totalRows; i++) {
                const row = json[i];
                const progress = ((i + 1) / totalRows) * 100;
                progressMessage.textContent = `Importando ${i + 1} de ${totalRows}...`;
                progressBar.style.width = `${progress}%`;

                try {
                    const valorConversaoPlanilha = row.conversao_nome_regra || row['regra de conversao'] || row.conversao;
                    const conversaoId = findConversaoId(valorConversaoPlanilha, cache['conversoes']);

                    const fornecedorId = await findIdByName('fornecedores', 'nome', row.fornecedor_nome, cache);
                    const grupoId = await findIdByName('grupos', 'nome', row.grupo_nome, cache);

                    const aplicacaoNomes = row.aplicacao_nome || row.aplicacoes || '';
                    const aplicacaoIds = aplicacaoNomes ? (await Promise.all(aplicacaoNomes.split(',').map(name => findIdByName('aplicacoes', 'nome', name, cache)))).filter(Boolean) : [];

                    const conjuntoNomes = row.conjunto_nome || row.conjuntos || '';
                    const conjuntoIds = conjuntoNomes ? (await Promise.all(conjuntoNomes.split(',').map(name => findIdByName('conjuntos', 'nome', name, cache)))).filter(Boolean) : [];

                    if (!row.codigo || !row.descricao) throw new Error(`Linha ${i + 2} não tem código ou descrição.`);

                    const localId = await findIdByName('locais', 'nome', row.local_nome, cache);
                    const locacoes = [];
                    if (localId && row.locacao) {
                        locacoes.push({ codigo: row.locacao, localId: localId });
                    }

                    const product = {
                        codigo: row.codigo,
                        descricao: row.descricao,
                        un: row.un || "",
                        cor: row.cor || "",
                        fornecedorId: fornecedorId || "",
                        grupoId: grupoId || "",
                        aplicacaoIds: aplicacaoIds || [],
                        conjuntoIds: conjuntoIds || [],
                        locacoes: locacoes,
                        conversaoId: conversaoId || "",
                        arquivado: false
                    };

                    await addDoc(collection(db, 'produtos'), product);
                    successCount++;

                } catch (error) {
                    errorCount++;
                    errors.push(`Erro na linha ${i + 2} (Código '${row.codigo || "N/A"}'): ${error.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 10));
            }

            progressModal.style.display = 'none';

            let finalMessage = `${successCount} produtos importados com sucesso!`;
            if (errorCount > 0) {
                finalMessage += `\n\n${errorCount} produtos falharam: \n${errors.join("\n")}`;
            }
            alert(finalMessage);

            fileInput.value = '';
        };
        reader.readAsArrayBuffer(file);
    }
});

async function exportarModeloExcel() {
    alert("Gerando modelo inteligente... Por favor, aguarde.");
    try {
        const dataSources = {
            fornecedores: { collectionName: 'fornecedores', field: 'nome' },
            grupos: { collectionName: 'grupos', field: 'nome' },
            aplicacoes: { collectionName: 'aplicacoes', field: 'nome' },
            conjuntos: { collectionName: 'conjuntos', field: 'nome' },
            locais: { collectionName: 'locais', field: 'nome' },
            conversoes: { collectionName: 'conversoes', field: 'nome_regra' }
        };

        const fetchedData = {};
        const promises = Object.keys(dataSources).map(async (key) => {
            const source = dataSources[key];
            const snapshot = await getDocs(collection(db, source.collectionName));
            fetchedData[key] = snapshot.docs.map(doc => doc.data()[source.field]).filter(Boolean);
        });
        await Promise.all(promises);

        const workbook = XLSX.utils.book_new();

        Object.keys(fetchedData).forEach(key => {
            const sheetName = `_dados_${key}`;
            const data = fetchedData[key].map(item => [item]);
            if (data.length > 0) {
                const dataSheet = XLSX.utils.aoa_to_sheet(data);
                XLSX.utils.book_append_sheet(workbook, dataSheet, sheetName);
            }
        });

        const headers = ["codigo", "descricao", "un", "cor", "fornecedor_nome", "grupo_nome", "aplicacao_nome", "conjunto_nome", "local_nome", "locacao", "conversao_nome_regra"];
        const mainSheet = XLSX.utils.json_to_sheet([{}], { header: headers });

        const validations = [
            { col: 'E', source: '_dados_fornecedores' },
            { col: 'F', source: '_dados_grupos' },
            { col: 'G', source: '_dados_aplicacoes' },
            { col: 'H', source: '_dados_conjuntos' },
            { col: 'I', source: '_dados_locais' },
            { col: 'K', source: '_dados_conversoes' }
        ];

        const numRowsToApplyValidation = 1000;
        mainSheet['!dataValidations'] = [];

        validations.forEach(v => {
            if (workbook.SheetNames.includes(v.source)) {
                mainSheet['!dataValidations'].push({
                    sqref: `${v.col}2:${v.col}${numRowsToApplyValidation}`,
                    validation: {
                        type: 'list',
                        allowBlank: true,
                        showDropDown: true,
                        formula1: `=${v.source}!$A$1:$A$${fetchedData[v.source.replace('_dados_','')].length}`
                    }
                });
            }
        });

        XLSX.utils.book_append_sheet(workbook, mainSheet, "Produtos");

        Object.keys(fetchedData).forEach(key => {
            const sheetName = `_dados_${key}`;
            if(workbook.Sheets[sheetName]) {
                workbook.Sheets[sheetName].Hidden = 1;
            }
        });

        XLSX.writeFile(workbook, "modelo_importacao_produtos_inteligente.xlsx");

    } catch (error) {
        console.error("Erro ao gerar modelo Excel:", error);
        alert("Ocorreu um erro ao gerar o modelo. Verifique o console para mais detalhes.");
    }
}
