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
        { name: 'locais', collectionName: 'locais', displayField: 'nome' }, // ADICIONADO
        {
            name: 'enderecamento',
            collectionName: 'enderecamentos',
            // A função de exibição agora precisa dos locais
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
             selectElement.innerHTML = `<option value="">Selecione ${config.name}...</option>`; // Reset
        }

        snapshot.docs.forEach(doc => {
            const id = doc.id;
            const data = doc.data();
            configData[config.collectionName][id] = data;

            if (selectElement) {
                const option = document.createElement('option');
                option.value = id;
                // Passa todos os dados de configuração para a função de exibição
                option.textContent = config.displayFunction ? config.displayFunction(data, configData) : data[config.displayField];
                selectElement.appendChild(option);
            }
        });
    }

    // 2. Handle Product Form Submission (Create/Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('produto-id').value;

        const product = {
            codigo: document.getElementById('produto-codigo').value,
            codigo_global: document.getElementById('produto-codigo_global').value,
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            un_compra: document.getElementById('produto-un_compra').value,
            cor: document.getElementById('produto-cor').value,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            aplicacaoId: document.getElementById('produto-aplicacao').value,
            conjuntoId: document.getElementById('produto-conjunto').value,
            enderecamentoId: document.getElementById('produto-enderecamento').value,
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
                <td>${pData.un_compra}</td>
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
                document.getElementById('produto-un_compra').value = product.data.un_compra;
                document.getElementById('produto-cor').value = product.data.cor;
                document.getElementById('produto-fornecedor').value = product.data.fornecedorId;
                document.getElementById('produto-grupo').value = product.data.grupoId;
                document.getElementById('produto-aplicacao').value = product.data.aplicacaoId;
                document.getElementById('produto-conjunto').value = product.data.conjuntoId;
                document.getElementById('produto-enderecamento').value = product.data.enderecamentoId;
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
