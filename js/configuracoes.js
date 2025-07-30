import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    console.log("Página de Configurações carregada.");

    const configs = [
        {
            name: "fornecedor",
            collectionName: "fornecedores",
            fields: { nome: "Nome do Fornecedor", imposto: "Imposto (ST)" },
            tableHeaders: ["Nome", "Imposto (ST)"],
            render: (docData) => `<td>${docData.nome}</td><td>${docData.imposto}</td>`
        },
        {
            name: "grupo",
            collectionName: "grupos",
            fields: { nome: "Nome do Grupo" },
            tableHeaders: ["Nome"],
            render: (docData) => `<td>${docData.nome}</td>`
        },
        {
            name: "aplicacao",
            collectionName: "aplicacoes",
            fields: { nome: "Nome da Aplicação" },
            tableHeaders: ["Nome"],
            render: (docData) => `<td>${docData.nome}</td>`
        },
        {
            name: "conjunto",
            collectionName: "conjuntos",
            fields: { nome: "Nome do Conjunto" },
            tableHeaders: ["Nome"],
            render: (docData) => `<td>${docData.nome}</td>`
        },
        {
            name: "enderecamento",
            collectionName: "enderecamentos",
            fields: { codigo: "Código", local: "Local" },
            tableHeaders: ["Código", "Local"],
            render: (docData) => `<td>${docData.codigo}</td><td>${docData.local}</td>`
        },
        {
            name: "tipo-entrada",
            collectionName: "tipos_entrada",
            fields: { nome: "Nome do Tipo de Entrada" },
            tableHeaders: ["Nome"],
            render: (docData) => `<td>${docData.nome}</td>`
        },
        {
            name: "tipo-saida",
            collectionName: "tipos_saida",
            fields: { nome: "Nome do Tipo de Saída" },
            tableHeaders: ["Nome"],
            render: (docData) => `<td>${docData.nome}</td>`
        },
        {
            name: "obra",
            collectionName: "obras",
            fields: { nome: "Nome da Obra" },
            tableHeaders: ["Nome"],
            render: (docData) => `<td>${docData.nome}</td>`
        }
    ];

    configs.forEach(config => setupCrud(config));

    function setupCrud(config) {
        const form = document.getElementById(`form-${config.name}`);
        const tableBody = document.querySelector(`#table-${config.name} tbody`);
        const filterInput = document.querySelector(`.filter-input[data-table="table-${config.name}"]`);
        let currentData = [];

        // Save (Create/Update)
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = form.querySelector(`#${config.name}-id`).value;
            const data = {};
            for (const key in config.fields) {
                data[key] = form.querySelector(`#${config.name}-${key}`).value;
            }

            try {
                if (id) {
                    await setDoc(doc(db, config.collectionName, id), data, { merge: true });
                    alert(`${Object.values(config.fields)[0]} atualizado com sucesso!`);
                } else {
                    await addDoc(collection(db, config.collectionName), data);
                    alert(`${Object.values(config.fields)[0]} salvo com sucesso!`);
                }
                form.reset();
                form.querySelector(`#${config.name}-id`).value = '';
            } catch (error) {
                console.error(`Erro ao salvar ${config.name}:`, error);
                alert(`Erro ao salvar: ${error.message}`);
            }
        });

        // Render Table
        const renderTable = (data) => {
            tableBody.innerHTML = '';
            data.forEach(item => {
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
        onSnapshot(colRef, (snapshot) => {
            currentData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
            renderTable(currentData);
        });

        // Edit and Delete
        tableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.dataset.id;

            if (target.classList.contains('btn-edit')) {
                const item = currentData.find(d => d.id === id);
                if (item) {
                    form.querySelector(`#${config.name}-id`).value = item.id;
                    for (const key in config.fields) {
                        form.querySelector(`#${config.name}-${key}`).value = item.data[key];
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
                return Object.values(item.data).some(value =>
                    String(value).toLowerCase().includes(searchTerm)
                );
            });
            renderTable(filteredData);
        });
    }
});
