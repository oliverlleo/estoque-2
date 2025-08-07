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
    const locacaoInput = document.getElementById('produto-locacao');

    function applyFilters() {
        const generalSearchTerm = filterInput.value.toLowerCase();
        const locacaoSearchTerm = locacaoInput.value.toLowerCase();

        const filteredData = productsData.filter(product => {
            const pData = product.data;

            // Lógica do filtro geral (existente)
            const matchesGeneral = generalSearchTerm === '' || Object.values(pData).some(value =>
                String(value).toLowerCase().includes(generalSearchTerm)
            );

            // Lógica do novo filtro de locação
            // Reconstrói a string 'locacaoCompleta' da mesma forma que renderTable faz
            const localNome = configData.locais[pData.localId]?.nome || '';
            const locacaoDesc = pData.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ').toLowerCase();
            const matchesLocacao = locacaoSearchTerm === '' || locacaoCompleta.includes(locacaoSearchTerm);

            // Retorna verdadeiro apenas se o produto corresponder a AMBOS os filtros
            return matchesGeneral && matchesLocacao;
        });

        renderTable(filteredData);
    }

    // --- Validação de Código Duplicado em Tempo Real ---
    codigoInput.addEventListener('input', () => {
        const codigo = codigoInput.value.trim();
        const currentId = productIdInput.value;

        // Se o campo estiver vazio, remove o estilo de erro e para a execução
        if (!codigo) {
            codigoInput.classList.remove('is-invalid');
            return;
        }

        // Verifica se algum produto no array `productsData` tem o mesmo código,
        // ignorando o próprio produto que está sendo editado (se for o caso).
        const isDuplicate = productsData.some(product =>
            product.data.codigo.toLowerCase() === codigo.toLowerCase() && product.id !== currentId
        );

        // Adiciona ou remove a classe de erro com base no resultado
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
            // A chamada foi removida daqui
        }
    });

    locacaoInput.addEventListener('input', applyFilters);

    let productsData = [];
    const configData = {};

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


    const fileInput = document.getElementById('import-excel-input');
    // Listener para quando um arquivo é selecionado
    fileInput.addEventListener('change', handleFileImport);

    function setupMultiSelect(containerId, items) {
        const container = document.getElementById(containerId);
        const displayArea = container.querySelector('.multiselect-display-area');
        const placeholder = container.querySelector('.multiselect-placeholder');
        const optionsContainer = container.querySelector('.multiselect-options');

        // Limpa opções antigas e popula com as novas
        optionsContainer.innerHTML = '';
        const list = document.createElement('ul');
        for (const [id, data] of Object.entries(items)) {
            const listItem = document.createElement('li');
            listItem.innerHTML = `<input type="checkbox" data-id="${id}" data-name="${data.nome}"> ${data.nome}`;
            list.appendChild(listItem);
        }
        optionsContainer.appendChild(list);

        // Lógica para abrir/fechar o dropdown
        displayArea.addEventListener('click', () => {
            optionsContainer.style.display = optionsContainer.style.display === 'block' ? 'none' : 'block';
        });

        // Lógica para atualizar o texto do display
        optionsContainer.addEventListener('change', () => {
            const selected = optionsContainer.querySelectorAll('input[type="checkbox"]:checked');
            if (selected.length === 0) {
                placeholder.textContent = `Selecione...`;
                placeholder.style.color = '';
            } else {
                placeholder.textContent = `${selected.length} selecionado(s)`;
                placeholder.style.color = '#212529'; // Cor de texto normal
            }
        });

        return {
            getSelectedIds: () => Array.from(optionsContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.id),
            setSelectedIds: (ids = []) => {
                optionsContainer.querySelectorAll('input').forEach(cb => {
                    cb.checked = ids.includes(cb.dataset.id);
                });
                optionsContainer.dispatchEvent(new Event('change')); // Força a atualização do texto
            }
        };
    }

    // Popula e configura o multi-select de Aplicação
    const aplicacoesSnapshot = await getDocs(collection(db, 'aplicacoes'));
    configData['aplicacoes'] = {};
    aplicacoesSnapshot.forEach(doc => configData['aplicacoes'][doc.id] = doc.data());
    const aplicacaoSelect = setupMultiSelect('multiselect-aplicacao', configData['aplicacoes']);

    // Popula e configura o multi-select de Conjunto
    const conjuntosSnapshot = await getDocs(collection(db, 'conjuntos'));
    configData['conjuntos'] = {};
    conjuntosSnapshot.forEach(doc => configData['conjuntos'][doc.id] = doc.data());
    const conjuntoSelect = setupMultiSelect('multiselect-conjunto', configData['conjuntos']);

    // Fechar os dropdowns se clicar fora deles
    window.addEventListener('click', function(e) {
        if (!document.getElementById('multiselect-aplicacao').contains(e.target)) {
            document.querySelector('#multiselect-aplicacao .multiselect-options').style.display = 'none';
        }
        if (!document.getElementById('multiselect-conjunto').contains(e.target)) {
            document.querySelector('#multiselect-conjunto .multiselect-options').style.display = 'none';
        }
    });

    function populateSobraSelect() {
        // Guarda a opção "selecione" e limpa o resto
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
                const localNome = configData.locais[product.data.localId]?.nome || '';
                const locacaoDesc = product.data.locacao || '';

                displayInfo.codigo = product.data.codigo;
                displayInfo.descricao = product.data.descricao;
                displayInfo.un = product.data.un;
                displayInfo.locacao = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';
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

            // --- ETAPA 1: Calcular o Valor Médio da Peça Original (PAI) ---
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

            // --- ETAPA 2: Buscar a Regra de Conversão para achar a dimensão padrão ---
            if (!originalProductData.conversaoId) {
                throw new Error('O produto original não possui uma regra de conversão associada. Não é possível calcular o custo proporcional.');
            }
            const conversaoRef = doc(db, 'conversoes', originalProductData.conversaoId);
            const conversaoSnap = await getDoc(conversaoRef);
            if (!conversaoSnap.exists()) {
                throw new Error('Regra de conversão não encontrada.');
            }
            const conversaoData = conversaoSnap.data();

            // --- ETAPA 3: Calcular o Custo Proporcional da Sobra ---
            const qtdCompra = parseFloat(String(conversaoData.qtd_compra).replace(',', '.'));
            const medidaCompra = conversaoData.medida_compra.toLowerCase(); // ex: 'm'
            let dimensaoPadraoNaUnidadeSobra = qtdCompra;

            // Converte a dimensão padrão para a mesma unidade da sobra (assumindo mm)
            if (medidaCompra === 'm') {
                dimensaoPadraoNaUnidadeSobra *= 1000; // m para mm
            } else if (medidaCompra === 'cm') {
                dimensaoPadraoNaUnidadeSobra *= 10; // cm para mm
            }
            // Adicionar outras conversões se necessário

            if (dimensaoPadraoNaUnidadeSobra <= 0) {
                throw new Error('A dimensão padrão na regra de conversão é inválida.');
            }

            const custoProporcionalDaSobra = (medidaSobra / dimensaoPadraoNaUnidadeSobra) * custoMedioDaPecaOriginal;

            // --- ETAPA 4: Executar a Criação em uma Transação ---
            await runTransaction(db, async (transaction) => {
                const newSobraProductData = {
                    ...originalProductData,
                    codigo: `${originalProductData.codigo}-S${medidaSobraStr}`,
                    medida_sobra: medidaSobraStr,
                    estoque: 1,
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
                    observacao: `Entrada de sobra proporcional do produto ${originalProductData.codigo}`
                };
                transaction.set(newMovementRef, movementData);
            });

            alert(`Sobra cadastrada com sucesso! Custo proporcional calculado: R$ ${custoProporcionalDaSobra.toFixed(2)}`);
            formSobra.reset();
            selectSobraOriginal.dispatchEvent(new Event('change'));

        } catch (error) {
            console.error("Erro detalhado ao salvar sobra:", error);
            alert(`Erro ao salvar a sobra: ${error.message}`);
        }
    });


    // 2. Handle Product Form Submission (Create/Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // --- BLOQUEIO DE SUBMISSÃO ---
        // Se o campo de código está marcado como inválido, exibe um alerta e impede o envio.
        if (codigoInput.classList.contains('is-invalid')) {
            alert('O código do produto já existe. Por favor, insira um código único.');
            return; // Impede a continuação do processo de salvar
        }

        const productId = document.getElementById('produto-id').value;

        // --- INÍCIO DA VALIDAÇÃO DE CÓDIGO DUPLICADO ---
        if (!productId) { // Executa a validação apenas se for um NOVO produto
            const newCode = document.getElementById('produto-codigo').value;
            const isDuplicate = productsData.some(
                product => product.data.codigo.toLowerCase() === newCode.toLowerCase()
            );

            if (isDuplicate) {
                alert(`Erro: O código "${newCode}" já está cadastrado. Por favor, utilize outro código.`);
                return; // Interrompe a execução da função e não salva o produto
            }
        }
        // --- FIM DA VALIDAÇÃO DE CÓDIGO DUPLICADO ---

        const product = {
            codigo: document.getElementById('produto-codigo').value,
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            cor: document.getElementById('produto-cor').value,
            locacao: document.getElementById('produto-locacao').value,
            localId: document.getElementById('produto-local').value,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            aplicacaoIds: aplicacaoSelect.getSelectedIds(),
            conjuntoIds: conjuntoSelect.getSelectedIds(),
            conversaoId: document.getElementById('produto-conversao').value,
            arquivado: false // <-- ADICIONE ESTA LINHA
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
            codigoInput.classList.remove('is-invalid'); // Garante que o campo fique limpo
            filterInput.value = ''; // Limpa o filtro geral na caixa de pesquisa da tabela
            applyFilters(); // Re-aplica os filtros (agora vazios) para mostrar a tabela completa

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
            const localNome = configData.locais[pData.localId]?.nome || '';
            const locacaoDesc = pData.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';
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

    // 4. Listen for real-time updates
    const q = query(collection(db, 'produtos'), where("arquivado", "!=", true));
    onSnapshot(q, (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderTable(productsData);
        populateSobraSelect();
    });


    // Listener para o botão de importar (que aciona o input de arquivo)
    document.getElementById('btn-importar-excel').addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    document.getElementById('btn-exportar-modelo').addEventListener('click', (e) => { e.preventDefault(); exportarModeloExcel(); });

    const btnEditarSelecionado = document.getElementById('btn-editar-selecionado');
    const btnExcluirSelecionados = document.getElementById('btn-excluir-selecionados');
    const checkboxMestre = document.getElementById('checkbox-mestre');

    // Lógica para o checkbox mestre (selecionar todos)
    checkboxMestre.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.produto-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });

    // Lógica para atualizar o checkbox mestre quando um item é clicado individualmente
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

    // Listener para o botão EXCLUIR SELECIONADOS
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
                checkboxMestre.checked = false; // Desmarca o checkbox mestre
            } catch (error) {
                alert(`Erro ao arquivar produtos: ${error.message}`);
                console.error("Erro ao arquivar em lote:", error);
            }
        }
    });

    // Listener para o botão EDITAR SELECIONADO
    btnEditarSelecionado.addEventListener('click', () => {
        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length !== 1) {
            alert('Por favor, selecione exatamente um produto para editar.');
            return;
        }

        const id = checkboxesMarcados[0].dataset.id;
        const product = productsData.find(p => p.id === id);

        if (product) {
            // Reutiliza a mesma lógica de preenchimento do formulário que já existia
            document.getElementById('produto-id').value = product.id;
            document.getElementById('produto-codigo').value = product.data.codigo;
            document.getElementById('produto-descricao').value = product.data.descricao;
            document.getElementById('produto-un').value = product.data.un;
            document.getElementById('produto-cor').value = product.data.cor;
            document.getElementById('produto-locacao').value = product.data.locacao || '';
            document.getElementById('produto-local').value = product.data.localId;
            document.getElementById('produto-fornecedor').value = product.data.fornecedorId;
            document.getElementById('produto-grupo').value = product.data.grupoId;
            document.getElementById('produto-conversao').value = product.data.conversaoId || "";

            aplicacaoSelect.setSelectedIds(product.data.aplicacaoIds);
            conjuntoSelect.setSelectedIds(product.data.conjuntoIds);

            form.scrollIntoView({ behavior: 'smooth' });
        }
    });

    filterInput.addEventListener('input', applyFilters);

    document.getElementById('btn-gerar-etiquetas').addEventListener('click', (e) => {
        e.preventDefault(); // Previne o comportamento padrão do link

        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length === 0) {
            return alert("Selecione ao menos um produto para gerar etiquetas.");
        }

        const idsSelecionados = Array.from(checkboxesMarcados).map(cb => cb.dataset.id);

        // Filtra os dados dos produtos com base nos IDs selecionados
        const dadosParaEtiqueta = productsData
            .filter(product => idsSelecionados.includes(product.id))
            .map(product => {
                const pData = product.data;
                const localNome = configData.locais[pData.localId]?.nome || '';
                const locacaoDesc = pData.locacao || '';
                const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';

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
        e.stopPropagation(); // Impede que o clique se propague para o window
        dropdownContainer.classList.toggle('active');
    });

    // Fecha o dropdown se o usuário clicar em qualquer outro lugar da tela
    window.addEventListener('click', () => {
        if (dropdownContainer.classList.contains('active')) {
            dropdownContainer.classList.remove('active');
        }
    });

    // --- Seletores para o Modal de Progresso ---
    const progressModal = document.getElementById('import-progress-modal');
    const progressMessage = document.getElementById('import-progress-message');
    const progressBar = document.getElementById('import-progress-bar');

    async function findIdByName(collectionName, fieldName, value) {
        if (!value) return null;
        const colRef = collection(db, collectionName);
        const snapshot = await getDocs(colRef);
        for (const doc of snapshot.docs) {
            if (String(doc.data()[fieldName]).toLowerCase() === String(value).toLowerCase()) {
                return doc.id;
            }
        }
        return null;
    }

    // SUBSTITUA a função handleFileImport existente por esta versão definitiva:
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

            // Exibir modal de progresso
            progressModal.style.display = 'block';

            // --- LÓGICA DE BUSCA MELHORADA ---
            // Carrega todas as conversões uma vez para otimizar
            const conversoesSnapshot = await getDocs(collection(db, 'conversoes'));
            const todasConversoes = conversoesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // --- FIM DA LÓGICA DE BUSCA MELHORADA ---

            let successCount = 0;
            let errorCount = 0;
            let errors = [];
            const totalRows = json.length;

            for (let i = 0; i < totalRows; i++) {
                const row = json[i];
                const progress = ((i + 1) / totalRows) * 100;

                progressMessage.textContent = `Importando ${i + 1} de ${totalRows}...`;
                progressBar.style.width = `${progress}%`;
                progressBar.textContent = `${Math.round(progress)}%`;

                try {
                    // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
                    let conversaoId = null;
                    const conversaoKeys = ['conversao_nome_regra', 'regra de conversao', 'conversao'];
                    const rowKeys = Object.keys(row).map(k => k.toLowerCase());
                    const foundKey = conversaoKeys.find(key => rowKeys.includes(key));

                    if (foundKey) {
                        const originalKey = Object.keys(row).find(k => k.toLowerCase() === foundKey);
                        const valorPlanilha = row[originalKey];

                        if (valorPlanilha && typeof valorPlanilha === 'string') {
                            const valorTratado = valorPlanilha.trim();

                            // 1. Tenta buscar pelo NOME DA REGRA
                            let regraEncontrada = todasConversoes.find(c => c.nome_regra.toLowerCase() === valorTratado.toLowerCase());

                            // 2. Se não achou, tenta buscar pela FÓRMULA
                            if (!regraEncontrada) {
                                const normalizeString = (str) => String(str).replace(/,/g, '.').replace(/\s+/g, '').toLowerCase();

                                regraEncontrada = todasConversoes.find(c => {
                                    const formula = `${c.qtd_compra}${c.medida_compra} X ${c.qtd_padrao}${c.medida_padrao}`;
                                    return normalizeString(formula) === normalizeString(valorTratado);
                                });
                            }

                            if (regraEncontrada) {
                                conversaoId = regraEncontrada.id;
                            }
                        }
                    }
                    // --- FIM DA CORREÇÃO DEFINITIVA ---

                    const fornecedorId = await findIdByName('fornecedores', 'nome', row.fornecedor_nome);
                    const grupoId = await findIdByName('grupos', 'nome', row.grupo_nome);

                    const aplicacaoNomes = row.aplicacao_nome || row.aplicacoes || '';
                    const aplicacaoIds = aplicacaoNomes ? (await Promise.all(aplicacaoNomes.split(',').map(name => findIdByName('aplicacoes', 'nome', name.trim())))) .filter(Boolean) : [];

                    const conjuntoNomes = row.conjunto_nome || row.conjuntos || '';
                    const conjuntoIds = conjuntoNomes ? (await Promise.all(conjuntoNomes.split(',').map(name => findIdByName('conjuntos', 'nome', name.trim())))) .filter(Boolean) : [];

                    const localId = await findIdByName('locais', 'nome', row.local_nome);

                    if (!row.codigo || !row.descricao) {
                        throw new Error(`Linha ${i + 2} não tem código ou descrição.`);
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
                        localId: localId || "",
                        locacao: row.locacao || "",
                        conversaoId: conversaoId || "",
                        arquivado: false
                    };

                    await addDoc(collection(db, 'produtos'), product);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(`Erro na linha ${i + 2} (Código '${row.codigo || "N/A"}'): ${error.message}`);
                    console.error("Erro ao importar linha:", row, error);
                }

                await new Promise(resolve => setTimeout(resolve, 0));
            }

            progressModal.style.display = 'none';

            let finalMessage = `${successCount} produtos importados com sucesso!`;
            if (errorCount > 0) {
                finalMessage += `\n\n${errorCount} produtos falharam na importação.\n\nDetalhes dos erros:\n${errors.join("\n")}`;
                console.log("Erros detalhados:", errors);
            }
            alert(finalMessage);

            fileInput.value = '';
        };
        reader.readAsArrayBuffer(file);
    }
});

// Substitua a função exportarModeloExcel antiga por esta
async function exportarModeloExcel() {
    alert("Gerando modelo inteligente... Por favor, aguarde.");
    try {
        // 1. Buscar todos os dados necessários do Firestore em paralelo
        const dataSources = {
            fornecedores: { collectionName: 'fornecedores', field: 'nome' },
            grupos: { collectionName: 'grupos', field: 'nome' },
            aplicacoes: { collectionName: 'aplicacoes', field: 'nome' },
            conjuntos: { collectionName: 'conjuntos', field: 'nome' },
            enderecamentos: { collectionName: 'enderecamentos', field: 'codigo' },
            conversoes: { collectionName: 'conversoes', field: 'nome_regra' }
        };

        const fetchedData = {};
        const promises = Object.keys(dataSources).map(async (key) => {
            const source = dataSources[key];
            const snapshot = await getDocs(collection(db, source.collectionName));
            fetchedData[key] = snapshot.docs.map(doc => doc.data()[source.field]).filter(Boolean);
        });
        await Promise.all(promises);

        // 2. Criar um novo Workbook (arquivo Excel)
        const workbook = XLSX.utils.book_new();

        // 3. Criar e adicionar as abas de dados (que ficarão ocultas)
        Object.keys(fetchedData).forEach(key => {
            const sheetName = `_dados_${key}`;
            const data = fetchedData[key].map(item => [item]); // SheetJS espera um array de arrays
            if (data.length > 0) {
                const dataSheet = XLSX.utils.aoa_to_sheet(data);
                XLSX.utils.book_append_sheet(workbook, dataSheet, sheetName);
            }
        });

        // 4. Criar a aba principal de "Produtos"
        const headers = ["codigo", "descricao", "un", "cor", "fornecedor_nome", "grupo_nome", "aplicacao_nome", "conjunto_nome", "enderecamento_codigo", "conversao_nome_regra"];
        const mainSheet = XLSX.utils.json_to_sheet([{}], { header: headers });

        // 5. Adicionar a "Validação de Dados" (Dropdowns)
        const validations = [
            { col: 'F', source: '_dados_fornecedores' }, // fornecedor_nome
            { col: 'G', source: '_dados_grupos' },       // grupo_nome
            { col: 'H', source: '_dados_aplicacoes' },   // aplicacao_nome
            { col: 'I', source: '_dados_conjuntos' },    // conjunto_nome
            { col: 'J', source: '_dados_enderecamentos' },// enderecamento_codigo
            { col: 'K', source: '_dados_conversoes' }     // conversao_nome_regra
        ];

        const numRowsToApplyValidation = 1000; // Aplicar validação para 1000 linhas
        mainSheet['!dataValidations'] = [];

        validations.forEach(v => {
            if (workbook.SheetNames.includes(v.source)) { // Apenas adiciona validação se a aba de dados existir
                mainSheet['!dataValidations'].push({
                    sqref: `${v.col}2:${v.col}${numRowsToApplyValidation}`, // Ex: F2:F1000
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

        // 6. Opcional: Ocultar as abas de dados
        Object.keys(fetchedData).forEach(key => {
            const sheetName = `_dados_${key}`;
            if(workbook.Sheets[sheetName]) {
                workbook.Sheets[sheetName].Hidden = 1;
            }
        });

        // 7. Forçar o download do arquivo
        XLSX.writeFile(workbook, "modelo_importacao_produtos_inteligente.xlsx");

    } catch (error) {
        console.error("Erro ao gerar modelo Excel:", error);
        alert("Ocorreu um erro ao gerar o modelo. Verifique o console para mais detalhes.");
    }
}
