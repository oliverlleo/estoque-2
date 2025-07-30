import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Movimentações carregada.");

    // --- DOM Elements ---
    const formEntrada = document.getElementById('form-entrada');
    const formSaida = document.getElementById('form-saida');
    const tableBody = document.querySelector('#table-movimentacoes tbody');
    const filterInput = document.getElementById('filter-movimentacoes');

    // --- Data Stores ---
    let productsMap = {};
    let configData = {};
    let movementsData = [];

    // --- Initial Data Loading ---
    async function loadInitialData() {
        // Load products
        const productsSnapshot = await getDocs(collection(db, 'produtos'));
        productsMap = {};
        const productOptions = ['<option value="">Selecione o Produto...</option>'];
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            productsMap[doc.id] = { id: doc.id, ...product };
            const codigo = product.codigo || 'S/C';
            const descricao = product.descricao || 'Produto sem descrição';
            const codigoGlobal = product.codigo_global ? `(${product.codigo_global})` : '';
            const optionText = `${codigo} - ${descricao} ${codigoGlobal}`.trim();
            productOptions.push(`<option value="${doc.id}">${optionText}</option>`);
        });
        document.getElementById('entrada-produto').innerHTML = productOptions.join('');
        document.getElementById('saida-produto').innerHTML = productOptions.join('');

        // Load other config data (CORRIGIDO)
        const configsToLoad = [
            { id: 'entrada-tipo', collection: 'tipos_entrada', field: 'nome', defaultOption: 'Tipo de Entrada...' },
            { id: 'saida-tipo', collection: 'tipos_saida', field: 'nome', defaultOption: 'Tipo de Saída...' },
            { id: 'saida-obra', collection: 'obras', field: 'nome', defaultOption: 'Selecione a Obra...' },
        ];

        for (const cfg of configsToLoad) {
            const select = document.getElementById(cfg.id);
            if(select) {
                 const snapshot = await getDocs(collection(db, cfg.collection));
                 configData[cfg.collection] = {};
                 select.innerHTML = `<option value="">${cfg.defaultOption}</option>`;
                 snapshot.forEach(doc => {
                     configData[cfg.collection][doc.id] = doc.data();
                     select.innerHTML += `<option value="${doc.id}">${doc.data()[cfg.field]}</option>`;
                 });
            }
        }
    }

    // --- Form Auto-fill ---
    function setupAutoFill() {
        document.getElementById('entrada-produto').addEventListener('change', (e) => {
            const product = productsMap[e.target.value];
            document.getElementById('entrada-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('entrada-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('entrada-un-display').textContent = product ? product.un_compra : '-';
        });

        document.getElementById('saida-produto').addEventListener('change', (e) => {
            const product = productsMap[e.target.value];
            document.getElementById('saida-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('saida-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('saida-un-display').textContent = product ? product.un : '-';
            document.getElementById('saida-estoque-display').textContent = product ? (product.estoque || 0) : '-';
        });
    }

    // --- Core Logic (Transactions) ---
    formEntrada.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('entrada-produto').value;
        const quantidade = parseFloat(document.getElementById('entrada-quantidade').value);

        if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) {
                    throw "Produto não encontrado!";
                }

                const currentEstoque = productDoc.data().estoque || 0;
                const newEstoque = currentEstoque + quantidade;

                transaction.update(productRef, { estoque: newEstoque });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'entrada',
                    produtoId,
                    quantidade,
                    data: serverTimestamp(),
                    tipo_entradaId: document.getElementById('entrada-tipo').value,
                    nf: document.getElementById('entrada-nf').value,
                    valor_unitario: parseFloat(document.getElementById('entrada-valor-unitario').value) || 0,
                    icms: parseFloat(document.getElementById('entrada-icms').value) || 0,
                    ipi: parseFloat(document.getElementById('entrada-ipi').value) || 0,
                    frete: parseFloat(document.getElementById('entrada-frete').value) || 0,
                    observacao: document.getElementById('entrada-observacao').value,
                    medida: document.getElementById('entrada-medida').value,
                };
                transaction.set(movementRef, movementData);
            });
            alert('Entrada registrada com sucesso!');
            formEntrada.reset();
        } catch (error) {
            console.error("Erro na transação de entrada:", error);
            alert(`Erro ao registrar entrada: ${error}`);
        }
    });

    formSaida.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('saida-produto').value;
        const quantidade = parseFloat(document.getElementById('saida-quantidade').value);

         if (!productId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) {
                    throw "Produto não encontrado!";
                }

                const currentEstoque = productDoc.data().estoque || 0;
                if (currentEstoque < quantidade) {
                    throw `Estoque insuficiente! Disponível: ${currentEstoque}`;
                }
                const newEstoque = currentEstoque - quantidade;

                transaction.update(productRef, { estoque: newEstoque });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'saida',
                    produtoId,
                    quantidade,
                    data: serverTimestamp(),
                    tipo_saidaId: document.getElementById('saida-tipo').value,
                    requisitante: document.getElementById('saida-requisitante').value,
                    obraId: document.getElementById('saida-obra').value,
                    observacao: document.getElementById('saida-observacao').value,
                    medida: document.getElementById('saida-medida').value,
                };
                transaction.set(movementRef, movementData);
            });
            alert('Saída registrada com sucesso!');
            formSaida.reset();
        } catch (error) {
            console.error("Erro na transação de saída:", error);
            alert(`Erro ao registrar saída: ${error}`);
        }
    });

    // --- Real-time Table Rendering ---
    onSnapshot(collection(db, 'movimentacoes'), (snapshot) => {
        movementsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(movementsData);
    });

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.sort((a,b) => b.data.toMillis() - a.data.toMillis()); // Sort by most recent
        data.forEach(mov => {
            const row = document.createElement('tr');
            const produtoDesc = productsMap[mov.produtoId]?.descricao || 'N/A';

            let valorTotal = '-';
            if (mov.tipo === 'entrada') {
                valorTotal = (mov.quantidade * mov.valor_unitario) + mov.icms + mov.ipi + mov.frete;
                valorTotal = `R$ ${valorTotal.toFixed(2)}`;
            }

            row.innerHTML = `
                <td>${new Date(mov.data.seconds * 1000).toLocaleString('pt-BR')}</td>
                <td class="${mov.tipo}">${mov.tipo.toUpperCase()}</td>
                <td>${produtoDesc}</td>
                <td>${mov.quantidade}</td>
                <td>${valorTotal}</td>
                <td>${mov.requisitante || mov.nf || '-'}</td>
                <td>${configData.obras?.[mov.obraId]?.nome || '-'}</td>
                <td>${mov.observacao || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // --- Init ---
    loadInitialData().then(() => {
        setupAutoFill();
    });
});
