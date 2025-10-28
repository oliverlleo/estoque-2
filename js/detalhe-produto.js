import { db } from './firebase-config.js';
import { collection, getDocs, doc, runTransaction, serverTimestamp, getDoc, addDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    // --- ELEMENTOS DO DOM ---
    const detailsContainer = document.getElementById('details-container');
    const codigoEl = document.getElementById('produto-codigo');
    const descricaoEl = document.getElementById('produto-descricao');
    const fornecedorEl = document.getElementById('produto-fornecedor');
    const corEl = document.getElementById('produto-cor');
    const locacaoCompletaEl = document.getElementById('locacao-completa');
    const locacaoEstoqueEl = document.getElementById('locacao-estoque');
    const estoqueTotalTextoEl = document.getElementById('estoque-total-texto');

    const btnAbrirModalBaixa = document.getElementById('btn-abrir-modal-baixa');
    const baixaModal = document.getElementById('baixa-modal');
    const closeModalBtn = document.getElementById('baixa-modal-close');
    const formBaixa = document.getElementById('form-baixa-estoque');

    const estoqueTotalModal = document.getElementById('estoque-total-modal');
    const estoqueTotalModalClose = document.getElementById('estoque-total-modal-close');
    const estoqueTotalModalBody = document.getElementById('estoque-total-modal-body');

    // Elementos para o novo modal de sobras
    const sobrasModal = document.getElementById('sobras-modal');
    const sobrasModalClose = document.getElementById('sobras-modal-close');
    const sobrasModalBody = document.getElementById('sobras-modal-body');
    const sobrasSearchInput = document.getElementById('sobra-search-input');
    const sobrasListContainer = document.getElementById('sobras-list-container');

    let currentProduct = null;
    let currentLocacao = null;
    let configData = {};
    let sobrasData = []; // Para armazenar os dados das sobras e filtrar localmente

    // --- LÓGICA PRINCIPAL ---

    const getUrlParams = () => {
        const params = new URLSearchParams(window.location.search);
        return {
            productId: params.get('id'),
            locacaoId: params.get('locId')
        };
    };

    const fetchConfigData = async () => {
        const collectionsToFetch = {
            fornecedores: 'fornecedores',
            locais: 'locais',
            obras: 'obras',
            tipos_saida: 'tipos_saida'
        };
        for (const key in collectionsToFetch) {
            const snapshot = await getDocs(collection(db, collectionsToFetch[key]));
            configData[key] = snapshot.docs.reduce((acc, doc) => {
                acc[doc.id] = doc.data();
                return acc;
            }, {});
        }
    };

    async function loadProductDetails() {
        const { productId, locacaoId } = getUrlParams();
        if (!productId) {
            detailsContainer.innerHTML = '<p style="color: red;">ID do produto não fornecido.</p>';
            return;
        }

        const productRef = doc(db, 'produtos', productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            detailsContainer.innerHTML = '<p style="color: red;">Produto não encontrado.</p>';
            return;
        }

        currentProduct = { id: productSnap.id, ...productSnap.data() };

        if (locacaoId) {
            currentLocacao = currentProduct.locacoes?.find(l => l.locacao === locacaoId) || null;
        }

        renderDetails();
        setupModalForm();
    }

    function renderDetails() {
        const pData = currentProduct;

        codigoEl.textContent = pData.codigo;
        descricaoEl.textContent = pData.descricao;
        descricaoEl.style.cursor = 'pointer';
        descricaoEl.title = 'Clique para ver as sobras deste produto';
        corEl.textContent = pData.cor || 'N/A';

        const fornecedorNome = configData.fornecedores[pData.fornecedorId]?.nome || 'Desconhecido';
        fornecedorEl.textContent = fornecedorNome;

        if (currentLocacao) {
            const localNome = configData.locais[currentLocacao.localId]?.nome || 'Desconhecido';
            locacaoCompletaEl.textContent = `${currentLocacao.locacao} (${localNome})`;
            locacaoEstoqueEl.textContent = `${currentLocacao.estoque || 0} ${pData.un}`;
        } else {
            locacaoCompletaEl.textContent = 'N/A';
            locacaoEstoqueEl.textContent = 'N/A';
        }

        const totalEstoqueLocacoes = pData.locacoes?.reduce((sum, loc) => sum + (loc.estoque || 0), 0) || 0;
        const estoqueSemOrigem = pData.estoque || 0;
        const estoqueTotal = totalEstoqueLocacoes + estoqueSemOrigem;
        estoqueTotalTextoEl.textContent = `${estoqueTotal} ${pData.un}`;
    }

    async function setupModalForm() {
        const formContainer = formBaixa.querySelector('.form-grid-4-col');
        const pData = currentProduct;
        const estoqueNaLocacao = currentLocacao?.estoque || 0;

        let tiposSaidaOptions = '<option value="">Selecione o Tipo de Saída...</option>';
        for(const [id, tipo] of Object.entries(configData.tipos_saida || {})) {
            tiposSaidaOptions += `<option value="${id}">${tipo.nome}</option>`;
        }

        let obrasOptions = '<option value="">Selecione a Obra...</option>';
        for(const [id, obra] of Object.entries(configData.obras || {})) {
            obrasOptions += `<option value="${id}">${obra.nome}</option>`;
        }

        const locacaoInfo = currentLocacao ? `da locação ${currentLocacao.locacao}` : '';

        formContainer.innerHTML = `
            <div id="modal-product-info" style="grid-column: 1 / -1; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                <p style="margin: 0 0 8px 0;"><strong>Produto:</strong> ${pData.descricao}</p>
                 <p style="margin: 0; font-size: 0.9em; color: var(--secondary-text-color);">
                    <strong>Estoque disponível ${locacaoInfo}:</strong> ${estoqueNaLocacao} ${pData.un}
                </p>
            </div>
            <input type="number" id="baixa-quantidade" placeholder="Quantidade (${pData.un})" max="${estoqueNaLocacao}" step="any" class="form-control" required>
            <input type="text" id="baixa-requisitante" placeholder="Requisitante" class="form-control">
            <select id="baixa-obra" class="form-control">${obrasOptions}</select>
            <select id="baixa-tipo-saida" class="form-control" required>${tiposSaidaOptions}</select>
            <input type="text" id="baixa-observacao" placeholder="Observação" class="form-control" style="grid-column: 1 / -1;">
        `;
    }

    // --- EVENT LISTENERS ---

    const renderSobras = (sobras) => {
        if (sobras.length === 0) {
            sobrasListContainer.innerHTML = '<p style="text-align: center; color: var(--secondary-text-color);">Nenhuma sobra encontrada com o critério informado.</p>';
            return;
        }

        let html = '<ul class="sobras-list">';
        sobras.forEach(sobra => {
            const medida = sobra.medida_sobra || 'N/A';

            let locacoesHtml = '<ul class="locacoes-list">';
            if (sobra.locacoes && sobra.locacoes.length > 0) {
                sobra.locacoes.forEach(loc => {
                    const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                    const estoque = loc.estoque || 0;
                    // Concatenação de locação e local com quantidade
                    const locacaoCompleta = `${loc.locacao} (${localNome})`;
                    locacoesHtml += `
                        <li>
                            <i data-feather="map-pin" class="icon"></i>
                            <span class="locacao-texto">${locacaoCompleta}</span>
                            <span class="locacao-estoque">${estoque} ${sobra.un}</span>
                        </li>
                    `;
                });
            } else {
                locacoesHtml += '<li>Sem locação definida</li>';
            }
            locacoesHtml += '</ul>';

            html += `
                <li class="sobra-item">
                    <div class="sobra-header">
                        <i data-feather="code" class="icon"></i>
                        <strong>Cód:</strong> ${sobra.codigo}
                    </div>
                    <div class="sobra-medida">
                        <i data-feather="maximize-2" class="icon"></i>
                        <strong>Medida:</strong> ${medida} ${sobra.un}
                    </div>
                    <div class="sobra-locacoes-container">
                        ${locacoesHtml}
                    </div>
                </li>`;
        });
        html += '</ul>';
        sobrasListContainer.innerHTML = html;
        // IMPORTANTE: Chamar o feather.replace() após inserir o HTML no DOM
        feather.replace();
    };

    descricaoEl.addEventListener('click', async () => {
        if (!currentProduct || !currentProduct.id) return;

        sobrasSearchInput.value = '';
        sobrasModal.style.display = 'block';
        sobrasListContainer.innerHTML = '<p>Buscando sobras...</p>';

        try {
            const q = query(collection(db, "produtos"), where("originalProductId", "==", currentProduct.id), where("isSobra", "==", true));
            const querySnapshot = await getDocs(q);

            sobrasData = querySnapshot.docs.map(doc => doc.data());

            if (sobrasData.length === 0) {
                sobrasListContainer.innerHTML = '<p>Nenhuma sobra encontrada para este produto.</p>';
            } else {
                renderSobras(sobrasData);
            }

        } catch (error) {
            console.error("Erro ao buscar sobras:", error);
            sobrasListContainer.innerHTML = '<p style="color: red;">Ocorreu um erro ao buscar as sobras.</p>';
        }
    });

    sobrasSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredSobras = sobrasData.filter(sobra =>
            (sobra.medida_sobra || '').toLowerCase().includes(searchTerm)
        );
        renderSobras(filteredSobras);
    });

    sobrasModalClose.addEventListener('click', () => sobrasModal.style.display = 'none');

    btnAbrirModalBaixa.addEventListener('click', () => {
        if (!currentLocacao) {
            alert("Não é possível dar baixa pois nenhuma locação específica foi identificada pela etiqueta.");
            return;
        }
        baixaModal.style.display = 'block';
    });
    closeModalBtn.addEventListener('click', () => baixaModal.style.display = 'none');

    estoqueTotalTextoEl.addEventListener('click', (e) => {
        e.preventDefault();
        let html = '<ul style="list-style: none; padding: 0;">';
        const pData = currentProduct;

        if (pData.locacoes && pData.locacoes.length > 0) {
            pData.locacoes.forEach(loc => {
                const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                html += `<li style="padding: 8px 0; border-bottom: 1px solid var(--border-color);"><strong>${loc.locacao} (${localNome}):</strong> ${loc.estoque || 0} ${pData.un}</li>`;
            });
        }

        if (pData.estoque > 0) {
            html += `<li style="padding: 8px 0; border-bottom: 1px solid var(--border-color);"><strong>Sem Origem:</strong> ${pData.estoque} ${pData.un}</li>`;
        }

        if (html === '<ul style="list-style: none; padding: 0;">') {
            html = '<p>Nenhum estoque registrado para este produto.</p>';
        } else {
            html += '</ul>';
        }

        estoqueTotalModalBody.innerHTML = html;
        estoqueTotalModal.style.display = 'block';
    });
    estoqueTotalModalClose.addEventListener('click', () => estoqueTotalModal.style.display = 'none');

    window.addEventListener('click', (event) => {
        if (event.target == baixaModal) baixaModal.style.display = 'none';
        if (event.target == estoqueTotalModal) estoqueTotalModal.style.display = 'none';
        if (event.target == sobrasModal) sobrasModal.style.display = 'none';
    });

    formBaixa.addEventListener('submit', async (e) => {
        e.preventDefault();
        const quantidade = parseFloat(document.getElementById('baixa-quantidade').value);

        if (isNaN(quantidade) || quantidade <= 0) {
            return alert('Por favor, insira uma quantidade válida.');
        }
        if (quantidade > currentLocacao.estoque) {
            return alert(`Estoque insuficiente! A locação ${currentLocacao.locacao} possui apenas ${currentLocacao.estoque}.`);
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', currentProduct.id);
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error("Produto não encontrado!");

                const pData = productDoc.data();
                const updatedLocacoes = pData.locacoes.map(loc => {
                    if (loc.locacao === currentLocacao.locacao && loc.localId === currentLocacao.localId) {
                        return { ...loc, estoque: (loc.estoque || 0) - quantidade };
                    }
                    return loc;
                });

                transaction.update(productRef, { locacoes: updatedLocacoes });

                const movementData = {
                    tipo: 'saida',
                    productId: currentProduct.id,
                    quantidade,
                    data: serverTimestamp(),
                    localId: currentLocacao.localId,
                    locacao: currentLocacao.locacao,
                    tipo_saidaId: document.getElementById('baixa-tipo-saida').value,
                    requisitante: document.getElementById('baixa-requisitante').value,
                    obraId: document.getElementById('baixa-obra').value,
                    observacao: document.getElementById('baixa-observacao').value,
                };
                transaction.set(doc(collection(db, 'movimentacoes')), movementData);
            });
            alert('Saída registrada com sucesso!');
            baixaModal.style.display = 'none';
            formBaixa.reset();
            location.reload();
        } catch (error) {
            console.error("Erro na transação de saída:", error);
            alert(`Erro ao registrar saída: ${error.message}`);
        }
    });

    // --- INICIALIZAÇÃO ---
    await fetchConfigData();
    await loadProductDetails();
});
