import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Produtos carregada.");

    const form = document.getElementById('form-produto');
    const tableBody = document.querySelector('#table-produtos tbody');
    const filterInput = document.getElementById('filter-produtos');

    const locacaoInput = document.getElementById('produto-locacao');

    locacaoInput.addEventListener('input', (e) => {
        // --- 1. Lógica da Máscara ---
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        let maskedValue = '';

        if (value.length > 0) {
            // Garante que os 2 primeiros são dígitos
            value = value.substring(0, 2).replace(/[^0-9]/g, '') + value.substring(2);
            maskedValue += value.substring(0, 2);
        }
        if (value.length > 2) {
            // Garante que o 3º é letra
            value = value.substring(0, 2) + value.substring(2, 3).replace(/[^A-Z]/g, '') + value.substring(3);
            maskedValue += '-' + value.substring(2, 3);
        }
        if (value.length > 3) {
            // Garante que o 4º e 5º são dígitos
            value = value.substring(0, 3) + value.substring(3, 5).replace(/[^0-9]/g, '') + value.substring(5);
            maskedValue += '-' + value.substring(3, 5);
        }
        if (value.length > 5) {
            // Garante que o 6º é letra
            value = value.substring(0, 5) + value.substring(5, 6).replace(/[^A-Z]/g, '');
            maskedValue += '-' + value.substring(5, 6);
        }

        e.target.value = maskedValue;

        // --- 2. Lógica de Filtragem em Tempo Real ---
        const searchTerm = e.target.value.toLowerCase();
        if (searchTerm) {
            const filteredData = productsData.filter(product => {
                return (product.data.locacao || '').toLowerCase().startsWith(searchTerm);
            });
            renderTable(filteredData);
        } else {
            // Se o campo estiver vazio, mostra todos os produtos (respeitando o outro filtro, se houver)
            const generalFilterTerm = filterInput.value.toLowerCase();
            if (generalFilterTerm) {
                 filterInput.dispatchEvent(new Event('input')); // Re-aciona o filtro geral
            } else {
                 renderTable(productsData);
            }
        }
    });

    let productsData = [];
    const configData = {};

    // 1. Fetch all configuration data for dropdowns and mapping
    const configCollections = [
        { name: 'fornecedor', collectionName: 'fornecedores', displayField: 'nome' },
        { name: 'grupo', collectionName: 'grupos', displayField: 'nome' },
        { name: 'aplicacao', collectionName: 'aplicacoes', displayField: 'nome' },
        { name: 'conjunto', collectionName: 'conjuntos', displayField: 'nome' },
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


    // 2. Handle Product Form Submission (Create/Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('produto-id').value;

        const product = {
            codigo: document.getElementById('produto-codigo').value,
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            cor: document.getElementById('produto-cor').value,
            locacao: document.getElementById('produto-locacao').value,
            localId: document.getElementById('produto-local').value,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            aplicacaoIds: Array.from(document.getElementById('produto-aplicacao').selectedOptions).map(option => option.value),
            conjuntoIds: Array.from(document.getElementById('produto-conjunto').selectedOptions).map(option => option.value),
            conversaoId: document.getElementById('produto-conversao').value
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

            // --- ADICIONAR ESTAS LINHAS ---
            filterInput.value = ''; // Limpa o filtro geral
            renderTable(productsData); // Renderiza a tabela completa, limpando o filtro de locação

        } catch (error) {
            console.error("Erro ao salvar produto:", error);
            alert(`Erro ao salvar: ${error.message}`);
        }
    });

    // 3. Render Product Table
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
            `;
            tableBody.appendChild(row);
        });
    };

    // 4. Listen for real-time updates
    onSnapshot(collection(db, 'produtos'), (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderTable(productsData);
    });


    // Listener para o botão de importar (que aciona o input de arquivo)
    document.getElementById('btn-importar-excel').addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    document.getElementById('btn-exportar-modelo').addEventListener('click', (e) => { e.preventDefault(); exportarModeloExcel(); });

    const btnEditarSelecionado = document.getElementById('btn-editar-selecionado');
    const btnExcluirSelecionados = document.getElementById('btn-excluir-selecionados');
    const checkboxMestre = document.getElementById('checkbox-mestre');

    // Listener para o checkbox mestre (selecionar todos)
    checkboxMestre.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.produto-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });

    // Listener para o botão EXCLUIR SELECIONADOS
    btnExcluirSelecionados.addEventListener('click', async () => {
        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length === 0) {
            alert('Por favor, selecione ao menos um produto para excluir.');
            return;
        }

        if (confirm(`Tem certeza que deseja excluir ${checkboxesMarcados.length} produto(s)?`)) {
            const promises = [];
            checkboxesMarcados.forEach(checkbox => {
                const id = checkbox.dataset.id;
                promises.push(deleteDoc(doc(db, 'produtos', id)));
            });

            try {
                await Promise.all(promises);
                alert(`${promises.length} produto(s) excluído(s) com sucesso!`);
                checkboxMestre.checked = false; // Desmarca o checkbox mestre
            } catch (error) {
                alert(`Erro ao excluir produtos: ${error.message}`);
                console.error("Erro ao excluir em lote:", error);
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

            const setMultipleSelect = (selectId, values) => {
                const selectElement = document.getElementById(selectId);
                if (!values || !Array.isArray(values)) return;
                for (const option of selectElement.options) {
                    option.selected = values.includes(option.value);
                }
            };
            setMultipleSelect('produto-aplicacao', product.data.aplicacaoIds);
            setMultipleSelect('produto-conjunto', product.data.conjuntoIds);

            form.scrollIntoView({ behavior: 'smooth' });
        }
    });

    filterInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredData = productsData.filter(product => {
            return Object.values(product.data).some(value =>
                String(value).toLowerCase().includes(searchTerm)
            );
        });
        renderTable(filteredData);
    });

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

// Adicionar estas duas funções no final do arquivo js/produtos.js

async function findIdByName(collectionName, fieldName, value) {
    if (!value) return null;
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    for (const doc of snapshot.docs) {
        if (String(doc.data()[fieldName]).toLowerCase() === String(value).toLowerCase()) {
            return doc.id;
        }
    }
    return null; // Retorna null se não encontrar
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
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
            alert("A planilha está vazia ou em um formato inválido.");
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        let errors = [];

        alert(`Iniciando a importação de ${json.length} produtos. Aguarde...`);

        for (const row of json) {
            try {
                // Mapeia os nomes da planilha para os IDs do Firestore
                const fornecedorId = await findIdByName('fornecedores', 'nome', row.fornecedor_nome);
                const grupoId = await findIdByName('grupos', 'nome', row.grupo_nome);
                const aplicacaoId = await findIdByName('aplicacoes', 'nome', row.aplicacao_nome);
                const conjuntoId = await findIdByName('conjuntos', 'nome', row.conjunto_nome);
                const enderecamentoId = await findIdByName('enderecamentos', 'codigo', row.enderecamento_codigo);
                const conversaoId = await findIdByName('conversoes', 'nome_regra', row.conversao_nome_regra);

                // Validação simples: código e descrição são obrigatórios
                if (!row.codigo || !row.descricao) {
                    throw new Error(`Linha com código '${row.codigo}' não tem código ou descrição.`);
                }

                const product = {
                    codigo: row.codigo,
                    descricao: row.descricao,
                    un: row.un || "",
                    cor: row.cor || "",
                    fornecedorId: fornecedorId || "",
                    grupoId: grupoId || "",
                    aplicacaoId: aplicacaoId || "",
                    conjuntoId: conjuntoId || "",
                    enderecamentoId: enderecamentoId || "",
                    conversaoId: conversaoId || ""
                };

                // Adiciona o produto ao banco de dados
                await addDoc(collection(db, 'produtos'), product);
                successCount++;
            } catch (error) {
                errorCount++;
                errors.push(`Erro na linha com código '${row.codigo || "N/A"}': ${error.message}`);
                console.error("Erro ao importar linha:", row, error);
            }
        }

        // Feedback final para o usuário
        let finalMessage = `${successCount} produtos importados com sucesso!`;
        if (errorCount > 0) {
            finalMessage += `\n\n${errorCount} produtos falharam na importação.\n\nDetalhes dos erros:\n${errors.join("\n")}`;
            console.log("Erros detalhados:", errors);
        }
        alert(finalMessage);
        fileInput.value = ''; // Reseta o input de arquivo
    };
    reader.readAsArrayBuffer(file);
}
