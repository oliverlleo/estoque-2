import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    console.log("Página de Configurações V2 (com Modais) carregada.");

    const configs = [
        // Mantenha a mesma estrutura de configuração que você já tinha
        { name: "Fornecedores", id: "fornecedor", collectionName: "fornecedores", fields: { nome: "Nome do Fornecedor", imposto: "Imposto (ST)" }, render: (d) => `<td>${d.nome}</td><td>${d.imposto || 0}</td>`, tableHeaders: "<th>Nome</th><th>Imposto (ST)</th>" },
        { name: "Grupos", id: "grupo", collectionName: "grupos", fields: { nome: "Nome do Grupo" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        {
            name: "Unidades de Compra",
            id: "unidade-compra",
            collectionName: "unidades_compra",
            fields: { nome: "Nome da Unidade (ex: Metro)", sigla: "Sigla (ex: m)" },
            render: (d) => `<td>${d.nome}</td><td>${d.sigla}</td>`,
            tableHeaders: "<th>Nome</th><th>Sigla</th>"
        },
        { name: "Aplicações", id: "aplicacao", collectionName: "aplicacoes", fields: { nome: "Nome da Aplicação" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Conjuntos", id: "conjunto", collectionName: "conjuntos", fields: { nome: "Nome do Conjunto" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Locais", id: "local", collectionName: "locais", fields: { nome: "Nome do Local" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Endereçamento", id: "enderecamento", collectionName: "enderecamentos", fields: { codigo: "Código" /* Removido local */ }, render: (d) => `<td>${d.codigo}</td><td>${d.localNome || 'N/A'}</td>`, tableHeaders: "<th>Código</th><th>Local</th>" },
        { name: "Tipos de Entrada", id: "tipo-entrada", collectionName: "tipos_entrada", fields: { nome: "Nome do Tipo de Entrada" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Tipos de Saída", id: "tipo-saida", collectionName: "tipos_saida", fields: { nome: "Nome do Tipo de Saída" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Obras", id: "obra", collectionName: "obras", fields: { nome: "Nome da Obra" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" }
    ];

    const buttonsContainer = document.getElementById('config-buttons-container');
    const modal = document.getElementById('config-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const closeButton = document.querySelector('.close-button');

    // --- 1. Gerar Botões de Gerenciamento ---
    configs.forEach(config => {
        const button = document.createElement('button');
        button.className = 'btn';
        // Adicionando um estilo base, pode ser qualquer um que combine
        button.style.backgroundColor = '#495057';
        button.textContent = `Gerenciar ${config.name}`;
        button.addEventListener('click', () => openConfigModal(config));
        buttonsContainer.appendChild(button);
    });

    // --- 2. Lógica do Modal ---
    function openConfigModal(config) {
        // Preencher o conteúdo do modal dinamicamente
        modalTitle.textContent = `Cadastro de ${config.name}`;
        modalBody.innerHTML = generateModalContent(config);

        // Anexar os listeners aos novos elementos dentro do modal
        setupModalCrud(config);

        // Exibir o modal
        modal.style.display = 'block';
    }

    function closeModel() {
        modal.style.display = 'none';
        modalBody.innerHTML = ''; // Limpar o conteúdo para a próxima abertura
    }

    // Fechar o modal ao clicar no 'X' ou fora do conteúdo
    closeButton.addEventListener('click', closeModel);
    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            closeModel();
        }
    });

    // --- 3. Gerador de HTML para o corpo do modal ---
    function generateModalContent(config) {
        let formFields = Object.entries(config.fields).map(([key, placeholder]) => {
            const inputType = (key.includes('imposto') || key.includes('valor')) ? 'number' : 'text';
            const step = inputType === 'number' ? 'step="0.01"' : '';
            return `<input type="${inputType}" id="${config.id}-${key}" placeholder="${placeholder}" required class="form-control" ${step}>`;
        }).join('');

        // Caso especial para Endereçamento
        if (config.id === 'enderecamento') {
            formFields += `<select id="enderecamento-localId" required class="form-control"><option value="">Selecione o Local...</option></select>`;
        }

        return `
            <div class="card">
                <div class="card-header"><h3>Formulário de ${config.name}</h3></div>
                <div class="card-body">
                    <form id="form-${config.id}" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                        <input type="hidden" id="${config.id}-id">
                        ${formFields}
                        <button type="submit" class="btn btn-success" style="flex-basis: 100%;">Salvar</button>
                    </form>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3>${config.name} Cadastrados</h3></div>
                <div class="card-body">
                    <input type="text" id="filter-${config.id}" class="form-control" placeholder="Filtrar..." style="margin-bottom: 15px;">
                    <div class="table-wrapper">
                        <table id="table-${config.id}" class="table">
                            <thead><tr>${config.tableHeaders}<th>Ações</th></tr></thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // --- 4. Lógica CRUD adaptada para o Modal ---
    function setupModalCrud(config) {
        const form = modal.querySelector(`#form-${config.id}`);
        const tableBody = modal.querySelector(`#table-${config.id} tbody`);
        const filterInput = modal.querySelector(`#filter-${config.id}`);
        let currentData = [];
        let unsubscribe;
        let locaisMap = {}; // Para mapear ID do local ao nome

        // --- Carregamento especial para Endereçamento ---
        if (config.id === 'enderecamento') {
            const localSelect = form.querySelector('#enderecamento-localId');
            const locaisColRef = collection(db, 'locais');
            onSnapshot(locaisColRef, (snapshot) => {
                localSelect.innerHTML = '<option value="">Selecione o Local...</option>';
                locaisMap = {};
                snapshot.docs.forEach(doc => {
                    locaisMap[doc.id] = doc.data().nome;
                    const option = document.createElement('option');
                    option.value = doc.id;
                    option.textContent = doc.data().nome;
                    localSelect.appendChild(option);
                });
            });
        }

        // Save (Create/Update)
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = form.querySelector(`#${config.id}-id`).value;
            const data = {};
            for (const key in config.fields) {
                data[key] = form.querySelector(`#${config.id}-${key}`).value;
            }
            // --- Salvamento especial para Endereçamento ---
            if (config.id === 'enderecamento') {
                data.localId = form.querySelector('#enderecamento-localId').value;
            }

            try {
                if (id) {
                    await setDoc(doc(db, config.collectionName, id), data, { merge: true });
                    alert(`${config.name} atualizado com sucesso!`);
                } else {
                    await addDoc(collection(db, config.collectionName), data);
                    alert(`${config.name} salvo com sucesso!`);
                }
                form.reset();
                form.querySelector(`#${config.id}-id`).value = '';
            } catch (error) {
                console.error(`Erro ao salvar ${config.name}:`, error);
                alert(`Erro ao salvar: ${error.message}`);
            }
        });

        // Render Table
        const renderTable = (data) => {
            tableBody.innerHTML = '';
            data.forEach(item => {
                // Adiciona o nome do local para renderização
                if (config.id === 'enderecamento') {
                    item.data.localNome = locaisMap[item.data.localId] || 'Local não encontrado';
                }
                const row = document.createElement('tr');
                row.innerHTML = `
                    ${config.render(item.data)}
                    <td class="actions">
                        <button class="btn-edit" data-id="${item.id}">Editar</button>
                        <button class="btn-delete" data-id="${item.id}">Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        };

        // Fetch data in real-time
        const colRef = collection(db, config.collectionName);
        unsubscribe = onSnapshot(colRef, (snapshot) => {
            currentData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
            renderTable(currentData);
        });

        // Edit and Delete
        tableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;
            if (!id) return;

            if (target.classList.contains('btn-edit')) {
                const item = currentData.find(d => d.id === id);
                if (item) {
                    form.querySelector(`#${config.id}-id`).value = item.id;
                    for (const key in config.fields) {
                        form.querySelector(`#${config.id}-${key}`).value = item.data[key];
                    }
                     // --- Preenchimento especial para Endereçamento ---
                    if (config.id === 'enderecamento') {
                        form.querySelector('#enderecamento-localId').value = item.data.localId;
                    }
                    form.scrollIntoView({ behavior: 'smooth' });
                }
            }

            if (target.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este item?')) {
                    try {
                        await deleteDoc(doc(db, config.collectionName, id));
                        alert('Item excluído com sucesso!');
                    } catch (error) {
                        console.error('Erro ao excluir:', error);
                        alert(`Erro ao excluir: ${error.message}`);
                    }
                }
            }
        });

        // Filter
        filterInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = currentData.filter(item => {
                // Adapta o filtro para Endereçamento
                 if (config.id === 'enderecamento') {
                    const localNome = (locaisMap[item.data.localId] || '').toLowerCase();
                    return Object.values(item.data).some(value =>
                        String(value).toLowerCase().includes(searchTerm)
                    ) || localNome.includes(searchTerm);
                }
                return Object.values(item.data).some(value =>
                    String(value).toLowerCase().includes(searchTerm)
                );
            });
            renderTable(filteredData);
        });

        // Adicionar um listener para parar o onSnapshot quando o modal for fechado
        const observer = new MutationObserver((mutationsList, observer) => {
            for(const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (modal.style.display === 'none' && unsubscribe) {
                        unsubscribe();
                        observer.disconnect();
                        return;
                    }
                }
            }
        });
        observer.observe(modal, { attributes: true });
    }
});
