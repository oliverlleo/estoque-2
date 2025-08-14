import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, onSnapshot, doc, setDoc, deleteDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const form = document.getElementById('form-produto');
    const tableBody = document.querySelector('#table-produtos tbody');
    const filterInput = document.getElementById('filter-produtos');
    let productsData = [];
    const configData = {};

    // --- Seletores do Modal de Locações ---
    const locacoesModal = document.getElementById('locacoes-modal');
    const locacoesModalClose = document.getElementById('locacoes-modal-close');
    const locacoesModalTitle = document.getElementById('locacoes-modal-title');
    const locacoesModalProdutoInfo = document.getElementById('locacoes-modal-produto-info');
    const formAddLocacao = document.getElementById('form-add-locacao');
    const tableLocacoesProdutoBody = document.querySelector('#table-locacoes-produto tbody');
    const selectLocalId = document.getElementById('locacao-localId');
    let currentProductIdForLocacao = null;
    let unsubscribeLocacoes = null;

    const configCollections = ['fornecedores', 'grupos', 'locais', 'aplicacoes', 'conjuntos', 'conversoes'];
    for (const name of configCollections) {
        const snapshot = await getDocs(collection(db, name));
        configData[name] = {};
        snapshot.forEach(doc => {
            configData[name][doc.id] = doc.data();
        });
    }

    function populateDropdowns() {
        // Popula os selects do formulário principal
        const selects = {
            'produto-fornecedor': configData.fornecedores,
            'produto-grupo': configData.grupos,
            'produto-conversao': configData.conversoes,
        };
        for (const [selectId, data] of Object.entries(selects)) {
            const select = document.getElementById(selectId);
            for (const [id, item] of Object.entries(data)) {
                select.innerHTML += `<option value="${id}">${item.nome || item.nome_regra}</option>`;
            }
        }
        // Popula o select de locais no modal
        selectLocalId.innerHTML = '<option value="">Selecione o Local...</option>';
        for (const [id, item] of Object.entries(configData.locais)) {
            selectLocalId.innerHTML += `<option value="${id}">${item.nome}</option>`;
        }
    }

    populateDropdowns();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('produto-id').value;
        const productData = {
            codigo: document.getElementById('produto-codigo').value,
            descricao: document.getElementById('produto-descricao').value,
            un: document.getElementById('produto-un').value,
            cor: document.getElementById('produto-cor').value,
            fornecedorId: document.getElementById('produto-fornecedor').value,
            grupoId: document.getElementById('produto-grupo').value,
            conversaoId: document.getElementById('produto-conversao').value,
            // Removidos localId e locacao
            arquivado: false,
            estoque: productId ? (productsData.find(p => p.id === productId)?.data.estoque || 0) : 0, // Mantém estoque existente
        };

        try {
            if (productId) {
                await setDoc(doc(db, 'produtos', productId), productData, { merge: true });
                alert('Produto atualizado com sucesso!');
            } else {
                await addDoc(collection(db, 'produtos'), productData);
                alert('Produto cadastrado com sucesso!');
            }
            form.reset();
            document.getElementById('produto-id').value = '';
        } catch (error) {
            alert(`Erro ao salvar: ${error.message}`);
        }
    });

    const renderTable = (data) => {
        tableBody.innerHTML = '';
        data.forEach(product => {
            const row = document.createElement('tr');
            const pData = product.data;
            const locacoes = product.locacoes || [];
            const locacoesDesc = locacoes.map(l => `${configData.locais[l.localId]?.nome || 'N/A'} - ${l.descricao} (${l.estoque})`).join('<br>');

            row.innerHTML = `
                <td><input type="checkbox" class="produto-checkbox" data-id="${product.id}"></td>
                <td>${pData.codigo}</td>
                <td>${pData.descricao}</td>
                <td>${pData.un}</td>
                <td>${pData.cor || '-'}</td>
                <td>${pData.estoque || 0}</td>
                <td>${locacoesDesc || 'Nenhuma'}</td>
            `;
            tableBody.appendChild(row);
        });
    };

    onSnapshot(query(collection(db, 'produtos'), where("arquivado", "!=", true)), (snapshot) => {
        const promises = snapshot.docs.map(async (pDoc) => {
            const product = { id: pDoc.id, data: pDoc.data() };
            const locacoesSnap = await getDocs(collection(db, `produtos/${pDoc.id}/locacoes`));
            product.locacoes = locacoesSnap.docs.map(lDoc => ({ id: lDoc.id, ...lDoc.data() }));
            return product;
        });

        Promise.all(promises).then(results => {
            productsData = results;
            applyFilters();
        });
    });

    function applyFilters() {
        const searchTerm = filterInput.value.toLowerCase();
        const filtered = productsData.filter(p =>
            p.data.codigo.toLowerCase().includes(searchTerm) ||
            p.data.descricao.toLowerCase().includes(searchTerm)
        );
        renderTable(filtered);
    }
    filterInput.addEventListener('input', applyFilters);

    // --- Lógica do Modal de Locações ---
    document.getElementById('btn-gerenciar-locacoes').addEventListener('click', () => {
        const checked = document.querySelectorAll('.produto-checkbox:checked');
        if (checked.length !== 1) {
            alert('Por favor, selecione exatamente um produto para gerenciar as locações.');
            return;
        }
        openLocacoesModal(checked[0].dataset.id);
    });

    tableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('produto-checkbox')) {
            const checkedCount = document.querySelectorAll('.produto-checkbox:checked').length;
            if(checkedCount === 1) {
                 document.getElementById('btn-gerenciar-locacoes').click();
            }
        }
    });

    async function openLocacoesModal(productId) {
        currentProductIdForLocacao = productId;
        const product = productsData.find(p => p.id === productId);
        if (!product) return;

        locacoesModalProdutoInfo.innerHTML = `
            <p><strong>Produto:</strong> ${product.data.descricao}</p>
            <p><strong>Código:</strong> ${product.data.codigo}</p>
        `;

        if (unsubscribeLocacoes) unsubscribeLocacoes();
        const locacoesRef = collection(db, `produtos/${productId}/locacoes`);
        unsubscribeLocacoes = onSnapshot(locacoesRef, (snapshot) => {
            tableLocacoesProdutoBody.innerHTML = '';
            snapshot.forEach(doc => {
                const locacao = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${configData.locais[locacao.localId]?.nome || 'N/A'}</td>
                    <td>${locacao.descricao}</td>
                    <td>${locacao.estoque || 0}</td>
                    <td>
                        <button class="btn-delete btn-delete-locacao" data-id="${doc.id}" ${locacao.estoque > 0 ? 'disabled' : ''}>Excluir</button>
                    </td>
                `;
                tableLocacoesProdutoBody.appendChild(row);
            });
        });
        locacoesModal.style.display = 'block';
    }

    formAddLocacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newLocacao = {
            localId: document.getElementById('locacao-localId').value,
            descricao: document.getElementById('locacao-descricao').value,
            estoque: 0
        };
        await addDoc(collection(db, `produtos/${currentProductIdForLocacao}/locacoes`), newLocacao);
        formAddLocacao.reset();
    });

    tableLocacoesProdutoBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-delete-locacao')) {
            const locacaoId = e.target.dataset.id;
            if (confirm('Tem certeza que deseja excluir esta locação?')) {
                await deleteDoc(doc(db, `produtos/${currentProductIdForLocacao}/locacoes`, locacaoId));
            }
        }
    });

    locacoesModalClose.onclick = () => locacoesModal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == locacoesModal) locacoesModal.style.display = 'none';
    };

    // --- Lógica de Edição e Exclusão ---
    document.getElementById('btn-editar-selecionado').addEventListener('click', () => {
        const checked = document.querySelectorAll('.produto-checkbox:checked');
        if (checked.length !== 1) {
            alert('Selecione um produto para editar.');
            return;
        }
        const product = productsData.find(p => p.id === checked[0].dataset.id);
        if (product) {
            document.getElementById('produto-id').value = product.id;
            document.getElementById('produto-codigo').value = product.data.codigo;
            document.getElementById('produto-descricao').value = product.data.descricao;
            document.getElementById('produto-un').value = product.data.un;
            document.getElementById('produto-cor').value = product.data.cor;
            document.getElementById('produto-fornecedor').value = product.data.fornecedorId;
            document.getElementById('produto-grupo').value = product.data.grupoId;
            document.getElementById('produto-conversao').value = product.data.conversaoId || "";
            form.scrollIntoView({ behavior: 'smooth' });
        }
    });

    document.getElementById('btn-excluir-selecionados').addEventListener('click', async () => {
        const checked = document.querySelectorAll('.produto-checkbox:checked');
        if (checked.length === 0) {
            alert('Selecione produtos para excluir.');
            return;
        }
        if (confirm(`Tem certeza que deseja arquivar ${checked.length} produto(s)?`)) {
            const batch = writeBatch(db);
            checked.forEach(cb => {
                const docRef = doc(db, 'produtos', cb.dataset.id);
                batch.update(docRef, { arquivado: true });
            });
            await batch.commit();
            alert('Produtos arquivados com sucesso.');
        }
    });
});
