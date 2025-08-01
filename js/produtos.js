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
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            cor: document.getElementById('produto-cor').value,
            locacao: document.getElementById('produto-locacao').value,
            localId: document.getElementById('produto-local').value,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            aplicacaoId: document.getElementById('produto-aplicacao').value,
            conjuntoId: document.getElementById('produto-conjunto').value,
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
            const localNome = configData.locais[pData.localId]?.nome || '';
            const locacaoDesc = pData.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';

            row.innerHTML = `
                <td>${pData.codigo}</td>
                <td>${pData.descricao}</td>
                <td>${pData.un}</td>
                <td>${pData.cor}</td>
                <td>${fornecedor}</td>
                <td>${grupo}</td>
                <td>${locacaoCompleta}</td>
                <td class="actions">
                    <button class="btn-edit" data-id="${product.id}">Editar</button>
                    <button class="btn-delete" data-id="${product.id}">Excluir</button>
                    <button class="btn-qr" data-id="${product.id}" style="background-color: #5bc0de;">QR Code</button>
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
                document.getElementById('produto-descricao').value = product.data.descricao;
                document.getElementById('produto-un').value = product.data.un;
                document.getElementById('produto-cor').value = product.data.cor;
                document.getElementById('produto-locacao').value = product.data.locacao || '';
                document.getElementById('produto-local').value = product.data.localId;
                document.getElementById('produto-fornecedor').value = product.data.fornecedorId;
                document.getElementById('produto-grupo').value = product.data.grupoId;
                document.getElementById('produto-aplicacao').value = product.data.aplicacaoId;
                document.getElementById('produto-conjunto').value = product.data.conjuntoId;
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

        if (target.classList.contains('btn-qr')) {
            // Cria a URL para a página de detalhe
            const url = `${window.location.origin}/detalhe-produto.html?id=${id}`;

            // Cria um modal genérico para exibir o QR Code
            let qrModal = document.getElementById('qr-code-modal');
            if (!qrModal) {
                const modalHtml = `
                    <div id="qr-code-modal" class="modal" style="display:none;">
                        <div class="modal-content" style="max-width: 300px; text-align: center;">
                            <div class="modal-header">
                                <h3>QR Code do Produto</h3>
                                <span class="close-button" id="qr-modal-close">&times;</span>
                            </div>
                            <div class="modal-body" id="qrcode-container" style="padding: 20px;"></div>
                        </div>
                    </div>`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);

                qrModal = document.getElementById('qr-code-modal');
                const closeBtn = document.getElementById('qr-modal-close');
                closeBtn.onclick = () => qrModal.style.display = 'none';
                window.onclick = (event) => {
                    if (event.target == qrModal) qrModal.style.display = 'none';
                };
            }

            const qrContainer = document.getElementById('qrcode-container');
            qrContainer.innerHTML = ''; // Limpa o QR code anterior
            new QRCode(qrContainer, {
                text: url,
                width: 256,
                height: 256,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
            qrModal.style.display = 'block';
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

    const btnGerarEtiquetas = document.getElementById('btn-gerar-etiquetas');
    btnGerarEtiquetas.addEventListener('click', () => {
        if (!productsData || productsData.length === 0) {
            return alert("Não há produtos para gerar etiquetas.");
        }

        // Prepara os dados para a página de etiquetas, resolvendo o endereçamento
        const dadosParaEtiqueta = productsData.map(product => {
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

        // Salva os dados no localStorage e abre a página em uma nova aba
        localStorage.setItem('etiquetasParaImprimir', JSON.stringify(dadosParaEtiqueta));
        window.open('etiquetas.html', '_blank');
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
