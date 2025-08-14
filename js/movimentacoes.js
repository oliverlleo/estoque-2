import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, runTransaction, doc, serverTimestamp, query, where, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {

    // --- DOM Elements ---
    const formMovimentacao = document.getElementById('form-movimentacao');
    const toggle = document.getElementById('movement-toggle');
    const btnMovimentacao = document.getElementById('btn-movimentacao');
    const selectProduto = document.getElementById('mov-produto');
    const selectLocacao = document.getElementById('mov-locacao');

    // --- Campos do Formulário ---
    const entradaFields = [document.getElementById('mov-tipo-entrada'), document.getElementById('mov-nf'), document.getElementById('mov-valor-unitario')];
    const saidaFields = [document.getElementById('mov-tipo-saida'), document.getElementById('mov-requisitante'), document.getElementById('mov-obra')];

    // --- Data Stores ---
    let productsMap = {};
    let configData = {};
    let locacoesCache = {};

    async function loadInitialData() {
        const [productsSnap, tiposEntradaSnap, tiposSaidaSnap, obrasSnap, locaisSnap] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'tipos_entrada')),
            getDocs(collection(db, 'tipos_saida')),
            getDocs(collection(db, 'obras')),
            getDocs(collection(db, 'locais')),
        ]);

        productsSnap.forEach(doc => {
            productsMap[doc.id] = { id: doc.id, ...doc.data() };
            selectProduto.innerHTML += `<option value="${doc.id}">${doc.data().codigo} - ${doc.data().descricao}</option>`;
        });

        configData.tipos_entrada = snapshotToMap(tiposEntradaSnap, 'mov-tipo-entrada');
        configData.tipos_saida = snapshotToMap(tiposSaidaSnap, 'mov-tipo-saida');
        configData.obras = snapshotToMap(obrasSnap, 'mov-obra');
        configData.locais = snapshotToMap(locaisSnap);
    }

    function snapshotToMap(snapshot, selectId = null) {
        const map = {};
        const select = selectId ? document.getElementById(selectId) : null;
        snapshot.forEach(doc => {
            map[doc.id] = doc.data();
            if (select) select.innerHTML += `<option value="${doc.id}">${doc.data().nome}</option>`;
        });
        return map;
    }

    function handleToggleChange() {
        const isEntrada = toggle.checked;
        entradaFields.forEach(el => el.style.display = isEntrada ? '' : 'none');
        saidaFields.forEach(el => el.style.display = isEntrada ? 'none' : '');
        // ... (restante da lógica de toggle visual)
    }

    async function updateProductInfo() {
        const productId = selectProduto.value;
        selectLocacao.innerHTML = '<option value="">Selecione a Locação...</option>';
        selectLocacao.disabled = true;
        document.getElementById('mov-estoque-locacao-display').textContent = '-';

        if (!productId) {
            document.getElementById('mov-codigo-display').textContent = '-';
            document.getElementById('mov-descricao-display').textContent = '-';
            document.getElementById('mov-un-display').textContent = '-';
            return;
        }

        const product = productsMap[productId];
        document.getElementById('mov-codigo-display').textContent = product.codigo;
        document.getElementById('mov-descricao-display').textContent = product.descricao;
        document.getElementById('mov-un-display').textContent = product.un;

        const locacoesSnap = await getDocs(collection(db, `produtos/${productId}/locacoes`));
        locacoesCache[productId] = {};
        locacoesSnap.forEach(doc => {
            const loc = doc.data();
            locacoesCache[productId][doc.id] = loc;
            const localNome = configData.locais[loc.localId]?.nome || 'N/A';
            selectLocacao.innerHTML += `<option value="${doc.id}">${localNome} - ${loc.descricao}</option>`;
        });
        selectLocacao.disabled = false;
    }

    selectProduto.addEventListener('change', updateProductInfo);

    selectLocacao.addEventListener('change', () => {
        const productId = selectProduto.value;
        const locacaoId = selectLocacao.value;
        if (productId && locacaoId) {
            const estoque = locacoesCache[productId][locacaoId]?.estoque || 0;
            document.getElementById('mov-estoque-locacao-display').textContent = estoque;
        } else {
            document.getElementById('mov-estoque-locacao-display').textContent = '-';
        }
    });

    formMovimentacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEntrada = toggle.checked;
        const productId = selectProduto.value;
        const locacaoId = selectLocacao.value;
        const quantidade = parseFloat(document.getElementById('mov-quantidade').value);

        if (!productId || !locacaoId || isNaN(quantidade) || quantidade <= 0) {
            alert('Preencha Produto, Locação e Quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const locacaoRef = doc(db, `produtos/${productId}/locacoes`, locacaoId);

                const [productDoc, locacaoDoc] = await Promise.all([
                    transaction.get(productRef),
                    transaction.get(locacaoRef)
                ]);

                if (!productDoc.exists() || !locacaoDoc.exists()) throw new Error("Produto ou locação não encontrado!");

                const currentEstoqueProduto = productDoc.data().estoque || 0;
                const currentEstoqueLocacao = locacaoDoc.data().estoque || 0;
                let newEstoqueProduto, newEstoqueLocacao;

                const movementData = {
                    productId,
                    locacaoId,
                    locacaoDescricao: selectLocacao.options[selectLocacao.selectedIndex].text,
                    quantidade,
                    data: serverTimestamp(),
                    observacao: document.getElementById('mov-observacao').value
                };

                if (isEntrada) {
                    movementData.tipo = 'entrada';
                    movementData.tipo_entradaId = document.getElementById('mov-tipo-entrada').value;
                    movementData.nf = document.getElementById('mov-nf').value;
                    movementData.valor_unitario = parseFloat(document.getElementById('mov-valor-unitario').value) || 0;
                    // Adicionar outros campos de entrada se necessário

                    newEstoqueLocacao = currentEstoqueLocacao + quantidade;
                    newEstoqueProduto = currentEstoqueProduto + quantidade;
                } else { // Saída
                    if (currentEstoqueLocacao < quantidade) {
                        throw new Error(`Estoque insuficiente na locação! Disponível: ${currentEstoqueLocacao}`);
                    }
                    movementData.tipo = 'saida';
                    movementData.tipo_saidaId = document.getElementById('mov-tipo-saida').value;
                    movementData.requisitante = document.getElementById('mov-requisitante').value;
                    movementData.obraId = document.getElementById('mov-obra').value;
                    movementData.valorMedioHistorico = productDoc.data().valorMedio || 0;

                    newEstoqueLocacao = currentEstoqueLocacao - quantidade;
                    newEstoqueProduto = currentEstoqueProduto - quantidade;
                }

                transaction.update(locacaoRef, { estoque: newEstoqueLocacao });
                transaction.update(productRef, { estoque: newEstoqueProduto });

                const movementRef = doc(collection(db, 'movimentacoes'));
                transaction.set(movementRef, movementData);
            });

            alert(`Movimentação de ${isEntrada ? 'entrada' : 'saída'} registrada com sucesso!`);
            formMovimentacao.reset();
            selectLocacao.innerHTML = '<option value="">Selecione a Locação...</option>';
            selectLocacao.disabled = true;
            document.getElementById('mov-estoque-locacao-display').textContent = '-';
        } catch (error) {
            console.error("Erro na transação:", error);
            alert(`Erro ao registrar: ${error.message}`);
        }
    });

    toggle.addEventListener('change', handleToggleChange);
    loadInitialData().then(handleToggleChange);
});
