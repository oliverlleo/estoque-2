import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Produtos carregada.");

    const form = document.getElementById('form-produto');
    const tableBody = document.querySelector('#table-produtos tbody');
    const filterInput = document.getElementById('filter-produtos');
    const locacaoModal = document.getElementById('locacao-modal');
    const locacaoModalClose = document.getElementById('locacao-modal-close');
    const btnGerenciarLocacao = document.getElementById('btn-gerenciar-locacao');
    const formAddLocacao = document.getElementById('form-add-locacao');
    const tableLocacoesBody = document.querySelector('#table-locacoes tbody');
    let currentSelectedProductIdForLocacao = null;

    let productsData = [];
    const configData = {};

    // 1. Fetch all configuration data for dropdowns and mapping
    const configCollections = [
        { name: 'fornecedor', collectionName: 'fornecedores', displayField: 'nome' },
        { name: 'grupo', collectionName: 'grupos', displayField: 'nome' },
        { name: 'aplicacao', collectionName: 'aplicacoes', displayField: 'nome' },
        { name: 'conjunto', collectionName: 'conjuntos', displayField: 'nome' }
    ];

    for (const config of configCollections) {
        const selectElement = document.getElementById(`produto-${config.name}`);
        if (!selectElement) continue; // Skip if element not found, e.g., enderecamento
        const colRef = collection(db, config.collectionName);
        const snapshot = await getDocs(colRef);

        configData[config.collectionName] = {};
        selectElement.innerHTML = `<option value="">Selecione ${config.name}...</option>`; // Reset

        snapshot.docs.forEach(doc => {
            const id = doc.id;
            const data = doc.data();
            configData[config.collectionName][id] = data;

            const option = document.createElement('option');
            option.value = id;
            option.textContent = config.displayFunction ? config.displayFunction(data) : data[config.displayField];
            selectElement.appendChild(option);
        });
    }

    // Modal Logic
    btnGerenciarLocacao.addEventListener('click', () => {
        const checkboxesMarcados = document.querySelectorAll('.produto-checkbox:checked');
        if (checkboxesMarcados.length !== 1) {
            alert('Por favor, selecione exatamente um produto para gerenciar as locações.');
            return;
        }
        const productId = checkboxesMarcados[0].dataset.id;
        openLocacaoModalForProduct(productId);
    });

    locacaoModalClose.onclick = () => locacaoModal.style.display = 'none';
    window.addEventListener('click', (event) => {
        if (event.target == locacaoModal) {
            locacaoModal.style.display = 'none';
        }
    });

    tableLocacoesBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-excluir-locacao')) {
            const locId = e.target.dataset.locId;
            if (confirm('Tem certeza que deseja excluir esta locação?')) {
                try {
                    const locRef = doc(db, 'produtos', currentSelectedProductIdForLocacao, 'localizacoes', locId);
                    await deleteDoc(locRef);
                    await renderLocacoesTable(currentSelectedProductIdForLocacao);
                } catch (error) {
                    console.error("Erro ao excluir locação:", error);
                    alert("Erro ao excluir.");
                }
            }
        }
    });

    // Fetch 'locais' for the modal dropdown
    const locaisColRef = collection(db, 'locais');
    const locaisSnapshot = await getDocs(locaisColRef);
    configData['locais'] = {};
    locaisSnapshot.docs.forEach(doc => {
        configData['locais'][doc.id] = doc.data();
    });

    async function openLocacaoModalForProduct(productId) {
        currentSelectedProductIdForLocacao = productId;
        const product = productsData.find(p => p.id === productId);
        if (!product) return;

        // Preenche informações do produto no modal
        document.getElementById('locacao-produto-info').innerHTML = `
            <p><strong>Produto:</strong> ${product.data.descricao}</p>
            <p><strong>Código:</strong> ${product.data.codigo}</p>
        `;
        document.getElementById('locacao-produto-id').value = productId;

        // Popula o dropdown de locais
        const localSelect = document.getElementById('locacao-local');
        localSelect.innerHTML = '<option value="">Selecione...</option>';
        for (const [id, data] of Object.entries(configData.locais)) {
            localSelect.innerHTML += `<option value="${id}">${data.nome}</option>`;
        }

        // Carrega e exibe as locações existentes
        await renderLocacoesTable(productId);
        locacaoModal.style.display = 'block';
    }

    async function renderLocacoesTable(productId) {
        const locacoesRef = collection(db, 'produtos', productId, 'localizacoes');
        const snapshot = await getDocs(locacoesRef);
        tableLocacoesBody.innerHTML = '';

        if (snapshot.empty) {
            tableLocacoesBody.innerHTML = '<tr><td colspan="4">Nenhuma locação cadastrada para este produto.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const loc = doc.data();
            const localNome = configData.locais[loc.localId]?.nome || 'N/A';
            const row = `
                <tr>
                    <td>${localNome}</td>
                    <td>${loc.locacao}</td>
                    <td>${loc.estoque || 0}</td>
                    <td><button class="btn btn-delete btn-excluir-locacao" data-loc-id="${doc.id}" ${loc.estoque > 0 ? 'disabled title="Não é possível excluir locação com estoque"' : ''}>Excluir</button></td>
                </tr>`;
            tableLocacoesBody.innerHTML += row;
        });
    }

    formAddLocacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('locacao-produto-id').value;
        const newLocacao = {
            localId: document.getElementById('locacao-local').value,
            locacao: document.getElementById('locacao-descricao').value.trim(),
            estoque: 0 // Novas locações sempre começam com estoque zero
        };

        try {
            const locacoesRef = collection(db, 'produtos', productId, 'localizacoes');
            await addDoc(locacoesRef, newLocacao);
            formAddLocacao.reset();
            await renderLocacoesTable(productId);
        } catch (error) {
            console.error("Erro ao adicionar locação:", error);
            alert("Erro ao salvar locação.");
        }
    });

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
        };

        // Add initial stock field when creating a product
        if (!productId) {
            product.estoque = 0;
        }

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

            row.innerHTML = `
                <td><input type="checkbox" class="produto-checkbox" data-id="${product.id}"></td>
                <td>${pData.codigo}</td>
                <td>${pData.codigo_global}</td>
                <td><a href="detalhe-produto.html?id=${product.id}">${pData.descricao}</a></td>
                <td>${pData.un}</td>
                <td>${pData.un_compra}</td>
                <td>${pData.cor}</td>
                <td>${fornecedor}</td>
                <td>${grupo}</td>
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

    const selectAllCheckbox = document.getElementById('select-all-produtos');
    selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.produto-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
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
