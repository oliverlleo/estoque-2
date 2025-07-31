import { db } from './firebase-config.js';
    import { collection, getDocs, doc, runTransaction, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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

        // --- Carregar e exibir dados do produto ---
        async function loadProductDetails() {
            // Lógica adaptada de consultas.js para um único produto
            const productRef = doc(db, 'produtos', productId);
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                detailsContainer.innerHTML = '<p style="color: red;">Produto não encontrado.</p>';
                return;
            }
            const product = productSnap.data();

            const movementsSnapshot = await getDocs(collection(db, 'movimentacoes'));
            let estoqueAtual = 0;
            let inventarioPedacos = {};
            movementsSnapshot.forEach(doc => {
                const mov = doc.data();
                if (mov.productId === productId) {
                     const isPiece = mov.medida && mov.medida.trim() !== '';
                     if (isPiece) {
                        const medida = mov.medida.trim();
                        const quantidade = mov.quantidade ? parseInt(mov.quantidade) : 1;
                        if (mov.tipo === 'entrada') inventarioPedacos[medida] = (inventarioPedacos[medida] || 0) + quantidade;
                        else if (mov.tipo === 'saida') inventarioPedacos[medida] = (inventarioPedacos[medida] || 0) - quantidade;
                     } else {
                        if (mov.tipo === 'entrada') estoqueAtual += mov.quantidade;
                        else if (mov.tipo === 'saida') estoqueAtual -= mov.quantidade;
                     }
                }
            });

            // Busca de dados de endereçamento (similar a consultas.js)
            const enderecamentoDoc = product.enderecamentoId ? (await getDoc(doc(db, 'enderecamentos', product.enderecamentoId))).data() : null;
            const localDoc = enderecamentoDoc ? (await getDoc(doc(db, 'locais', enderecamentoDoc.localId))).data() : null;
            const localNome = localDoc ? localDoc.nome : 'N/A';
            const enderecamentoCompleto = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

            detailsContainer.innerHTML = `
                <p><strong>Código:</strong> ${product.codigo}</p>
                <p><strong>Cód. Global:</strong> ${product.codigo_global || '-'}</p>
                <p><strong>Descrição:</strong> ${product.descricao}</p>
                <hr>
                <p><strong>Estoque Atual:</strong> ${estoqueAtual} ${product.un}</p>
                <p><strong>Saldo Pedaços:</strong> ${Object.values(inventarioPedacos).reduce((a, b) => a + b, 0)}</p>
                <p><strong>Endereçamento:</strong> ${enderecamentoCompleto}</p>
            `;

            const saldoPedaco = Object.values(inventarioPedacos).reduce((a, b) => a + b, 0);
            setupModalForm(product, inventarioPedacos, estoqueAtual, saldoPedaco);
        }

        // --- Configurar o formulário do Modal ---
        async function setupModalForm(product, inventory, estoqueAtual, saldoPedaco) {
            const formContainer = formBaixa.querySelector('.form-grid-4-col');

            // Carregar configurações de Tipos de Saída e Obras
            const tiposSaidaSnapshot = await getDocs(collection(db, 'tipos_saida'));
            const obrasSnapshot = await getDocs(collection(db, 'obras'));

            let tiposSaidaOptions = '<option value="">Selecione o Tipo de Saída...</option>';
            tiposSaidaSnapshot.forEach(doc => tiposSaidaOptions += `<option value="${doc.id}">${doc.data().nome}</option>`);

            let obrasOptions = '<option value="">Selecione a Obra...</option>';
            obrasSnapshot.forEach(doc => obrasOptions += `<option value="${doc.id}">${doc.data().nome}</option>`);

            const availablePieces = Object.entries(inventory).filter(([_, qtd]) => qtd > 0);
            let medidaFieldHtml;
            if (availablePieces.length > 0) {
                 medidaFieldHtml = '<select id="baixa-medida" class="form-control"><option value="">Dar baixa em Pedaço...</option>';
                 availablePieces.forEach(([medida, qtd]) => {
                     medidaFieldHtml += `<option value="${medida}">${medida} (${qtd} em estoque)</option>`;
                 });
                 medidaFieldHtml += '</select>';
            } else {
                 medidaFieldHtml = '<input type="text" id="baixa-medida" class="form-control" placeholder="Sem pedaços para baixa" disabled>';
            }


            formContainer.innerHTML = `
        <div id="modal-product-info" style="grid-column: 1 / -1; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444466;">
            <p style="margin: 0 0 8px 0;"><strong>Produto:</strong> ${product.descricao}</p>
            <p style="margin: 0 0 8px 0; font-size: 0.9em; color: #A0A0B9;">
                <span style="margin-right: 15px;"><strong>Código:</strong> ${product.codigo}</span>
                <span><strong>Cód. Padrão:</strong> ${product.codigo_global || '-'}</span>
            </p>
            <p style="margin: 0; font-size: 0.9em; color: #A0A0B9;">
                <span style="margin-right: 15px;"><strong>Estoque:</strong> ${estoqueAtual} ${product.un}</span>
                <span><strong>Saldo Pedaços:</strong> ${saldoPedaco}</span>
            </p>
        </div>
        <input type="number" id="baixa-quantidade" placeholder="Quantidade (${product.un})" step="any" class="form-control" required>
        ${medidaFieldHtml}
        <input type="text" id="baixa-requisitante" placeholder="Requisitante" class="form-control" required>
        <select id="baixa-obra" class="form-control" required>${obrasOptions}</select>
        <select id="baixa-tipo-saida" class="form-control" required>${tiposSaidaOptions}</select>
        <input type="text" id="baixa-observacao" placeholder="Observação" class="form-control">
    `;

            // Lógica para habilitar/desabilitar quantidade se um pedaço for selecionado
            const medidaSelect = document.getElementById('baixa-medida');
            const quantidadeInput = document.getElementById('baixa-quantidade');
            if (medidaSelect.tagName === 'SELECT') {
                medidaSelect.addEventListener('change', () => {
                    if (medidaSelect.value) { // selecionou um pedaço
                        quantidadeInput.value = 1;
                        quantidadeInput.disabled = true;
                    } else {
                        quantidadeInput.value = '';
                        quantidadeInput.disabled = false;
                    }
                });
            }
        }

        // --- Lógica do Modal ---
        btnAbrirModalBaixa.onclick = () => baixaModal.style.display = 'block';
        closeModalBtn.onclick = () => baixaModal.style.display = 'none';
        window.onclick = (event) => {
            if (event.target == baixaModal) baixaModal.style.display = 'none';
        };

        // --- Submissão do Formulário de Baixa (Lógica de movimentacoes.js) ---
        formBaixa.addEventListener('submit', async (e) => {
            e.preventDefault();

            const medidaSelect = document.getElementById('baixa-medida');
            const isPiece = medidaSelect.tagName === 'SELECT' && medidaSelect.value;
            const quantidade = parseFloat(document.getElementById('baixa-quantidade').value);

            if (isNaN(quantidade) || quantidade <= 0) {
                alert('Por favor, preencha a quantidade corretamente.');
                return;
            }

            try {
                await runTransaction(db, async (transaction) => {
                    // Lógica de baixa de estoque idêntica à de movimentacoes.js
                    if (!isPiece) {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error("Produto não encontrado!");
                        const currentEstoque = productDoc.data().estoque || 0;
                        if (currentEstoque < quantidade) throw new Error(`Estoque insuficiente! Disponível: ${currentEstoque}`);
                        const newEstoque = currentEstoque - quantidade;
                        transaction.update(productRef, { estoque: newEstoque });
                    }

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
                        medida: isPiece ? medidaSelect.value : '',
                    };
                    transaction.set(movementRef, movementData);
                });
                alert('Saída registrada com sucesso!');
                baixaModal.style.display = 'none';
                formBaixa.reset();
                location.reload(); // Recarrega a página para atualizar os dados
            } catch (error) {
                console.error("Erro na transação de saída:", error);
                alert(`Erro ao registrar saída: ${error.message}`);
            }
        });

        loadProductDetails();
    });
