import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Produtos carregada.");

    const form = document.getElementById('form-produto');
    const tableBody = document.querySelector('#table-produtos tbody');
    const filterInput = document.getElementById('filter-produtos');

    let productsData = [];
    const configData = {};

    // 1. Fetch all configuration data for dropdowns and mapping
    const configCollections = [
        { name: 'fornecedor', collectionName: 'fornecedores', displayField: 'nome' },
        { name: 'grupo', collectionName: 'grupos', displayField: 'nome' },
        { name: 'aplicacao', collectionName: 'aplicacoes', displayField: 'nome' },
        { name: 'conjunto', collectionName: 'conjuntos', displayField: 'nome' },
        { name: 'locais', collectionName: 'locais', displayField: 'nome' },
        {
            name: 'enderecamento',
            collectionName: 'enderecamentos',
            displayFunction: (doc, allConfigs) => {
                const localNome = allConfigs.locais[doc.localId]?.nome || 'N/A';
                return `${doc.codigo} - ${localNome}`;
            }
        }
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


    const btnImportar = document.getElementById('btn-importar-excel');
    const btnExportar = document.getElementById('btn-exportar-modelo');
    const fileInput = document.getElementById('import-excel-input');

    // Listener para o botão de exportar
    btnExportar.addEventListener('click', exportarModeloExcel);

    // Listener para o botão de importar (que aciona o input de arquivo)
    btnImportar.addEventListener('click', () => fileInput.click());

    // Listener para quando um arquivo é selecionado
    fileInput.addEventListener('change', handleFileImport);


    // 2. Handle Product Form Submission (Create/Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('produto-id').value;

        const product = {
            codigo: document.getElementById('produto-codigo').value,
            codigo_global: document.getElementById('produto-codigo_global').value,
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            cor: document.getElementById('produto-cor').value,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            aplicacaoId: document.getElementById('produto-aplicacao').value,
            conjuntoId: document.getElementById('produto-conjunto').value,
            enderecamentoId: document.getElementById('produto-enderecamento').value,
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
            const enderecamentoDoc = configData.enderecamentos[pData.enderecamentoId];
            const localNome = enderecamentoDoc ? configData.locais[enderecamentoDoc.localId]?.nome : 'N/A';
            const enderecamento = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

            row.innerHTML = `
                <td>${pData.codigo}</td>
                <td>${pData.codigo_global}</td>
                <td>${pData.descricao}</td>
                <td>${pData.un}</td>
                <td>${pData.cor}</td>
                <td>${fornecedor}</td>
                <td>${grupo}</td>
                <td>${enderecamento}</td>
                <td class="actions">
                    <button class="btn-edit" data-id="${product.id}">Editar</button>
                    <button class="btn-delete" data-id="${product.id}">Excluir</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    };

    // 4. Listen for real-time updates
    onSnapshot(collection(db, 'produtos'), (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderTable(productsData);
    });

    // 5. Handle Edit, Delete, and Filtering
    tableBody.addEventListener('click', (e) => {
        const target = e.target;
        const id = target.dataset.id;
        if (!id) return;

        if (target.classList.contains('btn-edit')) {
            const product = productsData.find(p => p.id === id);
            if (product) {
                document.getElementById('produto-id').value = product.id;
                document.getElementById('produto-codigo').value = product.data.codigo;
                document.getElementById('produto-codigo_global').value = product.data.codigo_global;
                document.getElementById('produto-descricao').value = product.data.descricao;
                document.getElementById('produto-un').value = product.data.un;
                document.getElementById('produto-cor').value = product.data.cor;
                document.getElementById('produto-fornecedor').value = product.data.fornecedorId;
                document.getElementById('produto-grupo').value = product.data.grupoId;
                document.getElementById('produto-aplicacao').value = product.data.aplicacaoId;
                document.getElementById('produto-conjunto').value = product.data.conjuntoId;
                document.getElementById('produto-enderecamento').value = product.data.enderecamentoId;
                document.getElementById('produto-conversao').value = product.data.conversaoId || "";
                form.scrollIntoView({ behavior: 'smooth' });
            }
        }

        if (target.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir este produto?')) {
                deleteDoc(doc(db, 'produtos', id))
                    .then(() => alert('Produto excluído com sucesso!'))
                    .catch(error => alert(`Erro ao excluir: ${error.message}`));
            }
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
});

// Adicionar esta função no final do arquivo js/produtos.js

function exportarModeloExcel() {
    // Cabeçalhos que o usuário deve preencher. Usamos nomes amigáveis.
    const headers = [
        "codigo", "codigo_global", "descricao", "un", "cor",
        "fornecedor_nome", "grupo_nome", "aplicacao_nome",
        "conjunto_nome", "enderecamento_codigo"
    ];

    // Criando uma linha de exemplo para guiar o usuário
    const exampleRow = {
        "codigo": "PROD-001",
        "codigo_global": "7890001",
        "descricao": "PARAFUSO SEXTAVADO ROSCA MAQUINA",
        "un": "PÇ",
        "cor": "INOX",
        "fornecedor_nome": "Nome do Fornecedor Exemplo",
        "grupo_nome": "Nome do Grupo Exemplo",
        "aplicacao_nome": "Nome da Aplicação Exemplo",
        "conjunto_nome": "Nome do Conjunto Exemplo",
        "enderecamento_codigo": "A01-01"
    };

    // Cria a planilha a partir dos dados (cabeçalho + exemplo)
    const worksheet = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produtos");

    // Força o download do arquivo no navegador
    XLSX.writeFile(workbook, "modelo_importacao_produtos.xlsx");
    alert("O download do modelo Excel foi iniciado.");
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

                // Validação simples: código e descrição são obrigatórios
                if (!row.codigo || !row.descricao) {
                    throw new Error(`Linha com código '${row.codigo}' não tem código ou descrição.`);
                }

                const product = {
                    codigo: row.codigo,
                    codigo_global: row.codigo_global || "",
                    descricao: row.descricao,
                    un: row.un || "",
                    cor: row.cor || "",
                    fornecedorId: fornecedorId || "",
                    grupoId: grupoId || "",
                    aplicacaoId: aplicacaoId || "",
                    conjuntoId: conjuntoId || "",
                    enderecamentoId: enderecamentoId || "",
                    conversaoId: "" // Campo de conversão não incluído na importação simples
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
