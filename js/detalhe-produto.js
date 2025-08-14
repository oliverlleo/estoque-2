import { db } from './firebase-config.js';
import { collection, getDocs, doc, runTransaction, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        document.getElementById('details-container').innerHTML = '<p style="color: red;">ID do produto não fornecido.</p>';
        return;
    }

    const detailsContainer = document.getElementById('details-container');
    const locacoesLista = document.getElementById('locacoes-lista');
    const btnAbrirModalBaixa = document.getElementById('btn-abrir-modal-baixa');
    const baixaModal = document.getElementById('baixa-modal');
    const closeModalBtn = document.getElementById('baixa-modal-close');
    const formBaixa = document.getElementById('form-baixa-estoque');

    let productLocations = [];

    async function loadProductDetails() {
        try {
            const productRef = doc(db, 'produtos', productId);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) {
                detailsContainer.innerHTML = '<p style="color: red;">Produto não encontrado.</p>';
                locacoesLista.innerHTML = '';
                return;
            }
            const product = productSnap.data();

            // Renderiza os detalhes principais
            detailsContainer.innerHTML = `
                <p><strong>Código:</strong> ${product.codigo}</p>
                <p><strong>Descrição:</strong> ${product.descricao}</p>
                <p><strong>Cor:</strong> ${product.cor || '-'}</p>
                <p><strong>Estoque Total:</strong> ${product.estoque || 0} ${product.un}</p>
            `;

            // Carrega e renderiza as locações
            const locaisRef = collection(db, 'locais');
            const [locacoesSnapshot, locaisSnapshot] = await Promise.all([
                getDocs(collection(db, 'produtos', productId, 'localizacoes')),
                getDocs(locaisRef)
            ]);

            const locaisMap = new Map(locaisSnapshot.docs.map(doc => [doc.id, doc.data()]));
            productLocations = locacoesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (productLocations.length === 0) {
                locacoesLista.innerHTML = '<li>Nenhuma locação cadastrada.</li>';
            } else {
                locacoesLista.innerHTML = productLocations.map(loc => {
                    const localNome = locaisMap.get(loc.localId)?.nome || 'N/A';
                    return `<li style="display: flex; justify-content: space-between; padding: 8px 0;">
                                <span>${localNome} - ${loc.locacao}</span>
                                <strong>${loc.estoque || 0} ${product.un}</strong>
                            </li>`;
                }).join('');
            }

            await setupModalForm(product, productLocations, locaisMap);

        } catch (error) {
            console.error("Erro ao carregar detalhes do produto:", error);
            detailsContainer.innerHTML = '<p style="color: red;">Erro ao carregar detalhes.</p>';
        }
    }

    async function setupModalForm(product, locations, locaisMap) {
        const formContainer = formBaixa.querySelector('.form-grid-4-col');

        const tiposSaidaSnapshot = await getDocs(collection(db, 'tipos_saida'));
        const obrasSnapshot = await getDocs(collection(db, 'obras'));

        let tiposSaidaOptions = '<option value="">Selecione o Tipo de Saída...</option>';
        tiposSaidaSnapshot.forEach(doc => tiposSaidaOptions += `<option value="${doc.id}">${doc.data().nome}</option>`);

        let obrasOptions = '<option value="">Selecione a Obra...</option>';
        obrasSnapshot.forEach(doc => obrasOptions += `<option value="${doc.id}">${doc.data().nome}</option>`);

        let locacoesOptions = '<option value="">Selecione a Locação de Saída...</option>';
        locations.forEach(loc => {
            const localNome = locaisMap.get(loc.localId)?.nome || 'N/A';
            locacoesOptions += `<option value="${loc.id}" data-estoque="${loc.estoque || 0}">${localNome} - ${loc.locacao} (Estoque: ${loc.estoque || 0})</option>`;
        });

        formContainer.innerHTML = `
            <div id="modal-product-info" style="grid-column: 1 / -1; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                <p style="margin:0;"><strong>Produto:</strong> ${product.descricao}</p>
            </div>
            <select id="baixa-locacao" class="form-control" required>${locacoesOptions}</select>
            <input type="number" id="baixa-quantidade" placeholder="Quantidade (${product.un})" step="any" class="form-control" required>
            <input type="text" id="baixa-requisitante" placeholder="Requisitante" class="form-control">
            <select id="baixa-obra" class="form-control">${obrasOptions}</select>
            <select id="baixa-tipo-saida" class="form-control" required>${tiposSaidaOptions}</select>
            <input type="text" id="baixa-observacao" placeholder="Observação" class="form-control" style="grid-column: 1 / -1;">
        `;
    }

    btnAbrirModalBaixa.onclick = () => baixaModal.style.display = 'block';
    closeModalBtn.onclick = () => baixaModal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == baixaModal) baixaModal.style.display = 'none';
    };

    formBaixa.addEventListener('submit', async (e) => {
        e.preventDefault();

        const quantidade = parseFloat(document.getElementById('baixa-quantidade').value);
        const locacaoId = document.getElementById('baixa-locacao').value;
        const locacaoSelect = document.getElementById('baixa-locacao');
        const locacaoNome = locacaoSelect.options[locacaoSelect.selectedIndex].text;

        if (!locacaoId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, selecione a locação e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const locacaoRef = doc(db, 'produtos', productId, 'localizacoes', locacaoId);

                const [productDoc, locacaoDoc] = await Promise.all([
                    transaction.get(productRef),
                    transaction.get(locacaoRef)
                ]);

                if (!productDoc.exists()) throw new Error("Produto não encontrado!");
                if (!locacaoDoc.exists()) throw new Error("Locação não encontrada!");

                const estoqueAtualLocacao = locacaoDoc.data().estoque || 0;
                if (estoqueAtualLocacao < quantidade) {
                    throw new Error(`Estoque insuficiente na locação! Disponível: ${estoqueAtualLocacao}`);
                }

                const novoEstoqueLocacao = estoqueAtualLocacao - quantidade;
                const novoEstoqueTotal = (productDoc.data().estoque || 0) - quantidade;

                transaction.update(locacaoRef, { estoque: novoEstoqueLocacao });
                transaction.update(productRef, { estoque: novoEstoqueTotal });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'saida',
                    productId,
                    localizacaoId,
                    locacaoNome,
                    quantidade,
                    data: serverTimestamp(),
                    tipo_saidaId: document.getElementById('baixa-tipo-saida').value,
                    requisitante: document.getElementById('baixa-requisitante').value,
                    obraId: document.getElementById('baixa-obra').value,
                    observacao: document.getElementById('baixa-observacao').value,
                };
                transaction.set(movementRef, movementData);
            });
            alert('Saída registrada com sucesso!');
            baixaModal.style.display = 'none';
            formBaixa.reset();
            loadProductDetails(); // Recarrega os detalhes para atualizar a UI
        } catch (error) {
            console.error("Erro na transação de saída:", error);
            alert(`Erro ao registrar saída: ${error.message}`);
        }
    });

    loadProductDetails();
});
