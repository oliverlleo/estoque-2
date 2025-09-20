import { db } from './firebase-config.js';
import { collection, getDocs, doc, runTransaction, serverTimestamp, getDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        document.getElementById('details-container').innerHTML = '<p style="color: red;">ID do produto não fornecido.</p>';
        return;
    }

    // --- Elementos do DOM ---
    const detailsContainer = document.getElementById('details-container');
    const btnAbrirModalBaixa = document.getElementById('btn-abrir-modal-baixa');
    const baixaModal = document.getElementById('baixa-modal');
    const closeModalBtn = document.getElementById('baixa-modal-close');
    const formBaixa = document.getElementById('form-baixa-estoque');
    const origemContainer = document.getElementById('origem-container');
    const origemLinkContainer = document.getElementById('origem-link-container');
    const sobrasContainer = document.getElementById('sobras-container');
    const sobrasList = document.getElementById('sobras-list');

    // --- Funções de Rastreabilidade ---
    async function displayOrigem(originId) {
        const parentProductRef = doc(db, 'produtos', originId);
        const parentProductSnap = await getDoc(parentProductRef);

        if (parentProductSnap.exists() && !parentProductSnap.data().arquivado) {
            const parentData = parentProductSnap.data();
            origemLinkContainer.innerHTML = `<a href="detalhe-produto.html?id=${originId}" style="color: var(--accent-color); text-decoration: underline;">${parentData.codigo} - ${parentData.descricao}</a>`;
        } else {
            origemLinkContainer.innerHTML = '<span>Produto de origem não encontrado ou arquivado.</span>';
        }
        origemContainer.style.display = 'block';
    }

    async function displaySobras(currentProductId) {
        sobrasContainer.style.display = 'block';
        const q = query(collection(db, 'produtos'), where("idProdutoOrigem", "==", currentProductId), where("arquivado", "!=", true));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            let html = '<ul style="list-style-type: none; padding-left: 0; margin: 0;">';
            const docs = querySnapshot.docs;
            docs.forEach((doc, index) => {
                const sobra = doc.data();
                const link = `<a href="detalhe-produto.html?id=${doc.id}" style="color: var(--primary-text-color); text-decoration: none;">${sobra.codigo} (Medida: ${sobra.medida_sobra || 'N/A'} mm)</a>`;
                const isLast = index === docs.length - 1;
                html += `<li style="padding: 8px 0; ${!isLast ? 'border-bottom: 1px solid var(--border-color);' : ''}">${link}</li>`;
            });
            html += '</ul>';
            sobrasList.innerHTML = html;
        } else {
            // A mensagem padrão do HTML ("Nenhuma sobra gerada...") será exibida.
        }
    }

    // --- Carregar e exibir dados do produto ---
    async function loadProductDetails() {
        const productRef = doc(db, 'produtos', productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            detailsContainer.innerHTML = '<p style="color: red;">Produto não encontrado.</p>';
            return;
        }
        const product = productSnap.data();

        if (product.arquivado) {
            document.getElementById('product-details-content').innerHTML = `
                <div class="card"><div class="card-body">
                    <h1>Produto Arquivado</h1>
                    <p>Este produto (${product.codigo}) foi arquivado e não pode mais ser movimentado.</p>
                    <a href="produtos.html" style="color: var(--accent-color);">Voltar para a lista de produtos</a>
                </div></div>`;
            return;
        }

        const estoqueAtual = product.locacoes ? product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0) : 0;

        let locacaoCompleta = 'N/A';
        if (product.locacoes && product.locacoes.length > 0) {
            const locaisData = {};
            const locacoesPromises = product.locacoes.map(async (loc) => {
                let localNome = 'Desconhecido';
                if (loc.localId) {
                    if (!locaisData[loc.localId]) {
                        const localDoc = await getDoc(doc(db, 'locais', loc.localId));
                        locaisData[loc.localId] = localDoc.exists() ? localDoc.data().nome : 'Desconhecido';
                    }
                    localNome = locaisData[loc.localId];
                }
                return `${loc.locacao} (${localNome}) - Estoque: ${loc.estoque || 0}`;
            });
            const locacoesFormatadas = await Promise.all(locacoesPromises);
            locacaoCompleta = locacoesFormatadas.join('<br>');
        }

        detailsContainer.innerHTML = `
            <p><strong>Código:</strong> ${product.codigo}</p>
            <p><strong>Descrição:</strong> ${product.descricao}</p>
            <p><strong>Cor:</strong> ${product.cor || '-'}</p>
            <hr>
            <p><strong>Estoque Total:</strong> ${estoqueAtual} ${product.un}</p>
            <p><strong>Locações:</strong><br>${locacaoCompleta}</p>
        `;

        if (product.isSobra && product.idProdutoOrigem) {
            displayOrigem(product.idProdutoOrigem);
        } else if (!product.isSobra) {
            displaySobras(productId);
        }

        // Se for uma sobra, desabilita o botão de dar baixa, pois a movimentação é feita no pai
        if (product.isSobra) {
            btnAbrirModalBaixa.textContent = 'Ações de Estoque na Origem';
            btnAbrirModalBaixa.disabled = true;
            btnAbrirModalBaixa.style.cursor = 'not-allowed';
            btnAbrirModalBaixa.style.backgroundColor = '#555';
        } else {
             setupModalForm(product, estoqueAtual);
        }
    }

    // --- Configurar o formulário do Modal ---
    async function setupModalForm(product, estoqueAtual) {
        const formContainer = formBaixa.querySelector('.form-grid-4-col');

        const tiposSaidaSnapshot = await getDocs(collection(db, 'tipos_saida'));
        const obrasSnapshot = await getDocs(collection(db, 'obras'));

        let tiposSaidaOptions = '<option value="">Selecione o Tipo de Saída...</option>';
        tiposSaidaSnapshot.forEach(doc => tiposSaidaOptions += `<option value="${doc.id}">${doc.data().nome}</option>`);

        let obrasOptions = '<option value="">Selecione a Obra...</option>';
        obrasSnapshot.forEach(doc => obrasOptions += `<option value="${doc.id}">${doc.data().nome}</option>`);

        formContainer.innerHTML = `
            <div id="modal-product-info" style="grid-column: 1 / -1; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444466;">
                <p style="margin: 0 0 8px 0;"><strong>Produto:</strong> ${product.descricao}</p>
                <p style="margin: 0 0 8px 0; font-size: 0.9em; color: #A0A0B9;">
                    <span style="margin-right: 15px;"><strong>Código:</strong> ${product.codigo}</span>
                </p>
                <p style="margin: 0; font-size: 0.9em; color: #A0A0B9;">
                    <span style="margin-right: 15px;"><strong>Estoque:</strong> ${estoqueAtual} ${product.un}</span>
                </p>
            </div>
            <input type="number" id="baixa-quantidade" placeholder="Quantidade (${product.un})" step="any" class="form-control" required>
            <input type="text" id="baixa-requisitante" placeholder="Requisitante" class="form-control">
            <select id="baixa-obra" class="form-control">${obrasOptions}</select>
            <select id="baixa-tipo-saida" class="form-control" required>${tiposSaidaOptions}</select>
            <input type="text" id="baixa-observacao" placeholder="Observação" class="form-control">
        `;
    }

    // --- Lógica do Modal ---
    btnAbrirModalBaixa.onclick = () => baixaModal.style.display = 'block';
    closeModalBtn.onclick = () => baixaModal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == baixaModal) baixaModal.style.display = 'none';
    };

    // --- Submissão do Formulário de Baixa ---
    formBaixa.addEventListener('submit', async (e) => {
        e.preventDefault();
        const quantidade = parseFloat(document.getElementById('baixa-quantidade').value);

        if (isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);
                if (!productDoc.exists()) throw new Error("Produto não encontrado!");

                const productData = productDoc.data();
                const currentEstoqueTotal = productData.locacoes ? productData.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0) : 0;

                if (currentEstoqueTotal < quantidade) {
                    throw new Error(`Estoque total insuficiente! Disponível: ${currentEstoqueTotal}`);
                }

                // Lógica para dar baixa na primeira locação com estoque suficiente
                const locacoesAtualizadas = [...productData.locacoes];
                let quantidadeRestante = quantidade;
                for (let i = 0; i < locacoesAtualizadas.length; i++) {
                    if (locacoesAtualizadas[i].estoque >= quantidadeRestante) {
                        locacoesAtualizadas[i].estoque -= quantidadeRestante;
                        quantidadeRestante = 0;
                        break;
                    }
                }
                if (quantidadeRestante > 0) {
                     throw new Error(`Nenhuma locação individual possui estoque suficiente para a baixa de ${quantidade}.`);
                }

                transaction.update(productRef, { locacoes: locacoesAtualizadas });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'saida',
                    productId,
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
            location.reload();
        } catch (error) {
            console.error("Erro na transação de saída:", error);
            alert(`Erro ao registrar saída: ${error.message}`);
        }
    });

    loadProductDetails();
});
