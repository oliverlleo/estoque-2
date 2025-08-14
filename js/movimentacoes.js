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
            productsMap[doc.id] = { id: doc.id, ...doc.data() };
            productOptions.push(`<option value="${doc.id}">${doc.data().descricao}</option>`);
        });
        document.getElementById('entrada-produto').innerHTML = productOptions.join('');
        document.getElementById('saida-produto').innerHTML = productOptions.join('');

        // Load other config data
        const configsToLoad = [
            { name: 'tipo-entrada', collection: 'tipos_entrada', field: 'nome' },
            { name: 'tipo-saida', collection: 'tipos_saida', field: 'nome' },
            { name: 'obra', collection: 'obras', field: 'nome' },
        ];
        for (const cfg of configsToLoad) {
            const select = document.getElementById(`${cfg.name === 'obra' ? 'saida-' : 'entrada-'}${cfg.name}`);
            if(select) {
                 const snapshot = await getDocs(collection(db, cfg.collection));
                 configData[cfg.collection] = {};
                 select.innerHTML = `<option value="">Selecione ${cfg.name.replace('-', ' ')}...</option>`;
                 snapshot.forEach(doc => {
                     configData[cfg.collection][doc.id] = doc.data();
                     select.innerHTML += `<option value="${doc.id}">${doc.data()[cfg.field]}</option>`;
                 });
            }
        }
        // Also load locais, which doesn't have a dedicated select in the main form
        const locaisSnapshot = await getDocs(collection(db, 'locais'));
        configData['locais'] = {};
        locaisSnapshot.forEach(doc => {
            configData['locais'][doc.id] = doc.data();
        });
    }

    async function updateProductLocations(productId, locacaoSelectId) {
        const locacaoSelect = document.getElementById(locacaoSelectId);
        locacaoSelect.innerHTML = '<option value="">Carregando locações...</option>';
        locacaoSelect.style.display = 'none';

        if (locacaoSelectId === 'saida-localizacao') {
             document.getElementById('saida-estoque-locacao-display-wrapper').style.display = 'none';
        }

        if (productId) {
            const locacoesRef = collection(db, 'produtos', productId, 'localizacoes');
            const snapshot = await getDocs(locacoesRef);

            if (snapshot.empty) {
                locacaoSelect.innerHTML = '<option value="">Nenhuma locação cadastrada</option>';
            } else {
                locacaoSelect.innerHTML = '<option value="">Selecione a Locação...</option>';
                snapshot.forEach(doc => {
                    const loc = doc.data();
                    const localNome = configData.locais[loc.localId]?.nome || 'N/A';
                    locacaoSelect.innerHTML += `<option value="${doc.id}" data-estoque="${loc.estoque || 0}">${localNome} - ${loc.locacao}</option>`;
                });
            }
            locacaoSelect.style.display = 'block';
        }
    }

    // --- Form Auto-fill ---
    function setupAutoFill() {
        document.getElementById('entrada-produto').addEventListener('change', (e) => {
            const productId = e.target.value;
            const product = productsMap[productId];
            document.getElementById('entrada-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('entrada-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('entrada-un-display').textContent = product ? product.un_compra : '-';
            updateProductLocations(productId, 'entrada-localizacao');
        });

        document.getElementById('saida-produto').addEventListener('change', (e) => {
            const productId = e.target.value;
            const product = productsMap[productId];
            document.getElementById('saida-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('saida-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('saida-un-display').textContent = product ? product.un : '-';
            document.getElementById('saida-estoque-display').textContent = product ? (product.estoque || 0) : '-';
            updateProductLocations(productId, 'saida-localizacao');
        });

        document.getElementById('saida-localizacao').addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const estoqueNaLocacao = selectedOption.dataset.estoque || 0;
            const estoqueWrapper = document.getElementById('saida-estoque-locacao-display-wrapper');
            const estoqueSpan = document.getElementById('saida-estoque-locacao-display');

            if (e.target.value) {
                estoqueSpan.textContent = estoqueNaLocacao;
                estoqueWrapper.style.display = 'block';
            } else {
                estoqueWrapper.style.display = 'none';
            }
        });
    }

    // --- Core Logic (Transactions) ---
    formEntrada.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('entrada-produto').value;
        const localizacaoId = document.getElementById('entrada-localizacao').value;
        const quantidade = parseFloat(document.getElementById('entrada-quantidade').value);

        if (!productId || !localizacaoId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto, locação e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const localizacaoRef = doc(db, 'produtos', productId, 'localizacoes', localizacaoId);

                const productDoc = await transaction.get(productRef);
                const locacaoDoc = await transaction.get(localizacaoRef);

                if (!productDoc.exists() || !locacaoDoc.exists()) {
                    throw "Produto ou Locação não encontrado(a)!";
                }

                const locacaoData = locacaoDoc.data();
                const localNome = configData.locais[locacaoData.localId]?.nome || 'N/A';
                const locacaoCompleta = `${localNome} - ${locacaoData.locacao}`;

                // Update location stock
                const currentEstoqueLocacao = locacaoDoc.data().estoque || 0;
                const newEstoqueLocacao = currentEstoqueLocacao + quantidade;
                transaction.update(localizacaoRef, { estoque: newEstoqueLocacao });

                // Update total product stock
                const currentEstoqueTotal = productDoc.data().estoque || 0;
                const newEstoqueTotal = currentEstoqueTotal + quantidade;
                transaction.update(productRef, { estoque: newEstoqueTotal });

                // Create movement record
                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'entrada',
                    produtoId,
                    localizacaoId,
                    locacaoCompleta, // Denormalized location string
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
        const localizacaoId = document.getElementById('saida-localizacao').value;
        const quantidade = parseFloat(document.getElementById('saida-quantidade').value);

         if (!productId || !localizacaoId || isNaN(quantidade) || quantidade <= 0) {
            alert('Por favor, preencha o produto, locação e a quantidade corretamente.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const localizacaoRef = doc(db, 'produtos', productId, 'localizacoes', localizacaoId);

                const productDoc = await transaction.get(productRef);
                const locacaoDoc = await transaction.get(localizacaoRef);

                if (!productDoc.exists() || !locacaoDoc.exists()) {
                    throw "Produto ou Locação não encontrado(a)!";
                }

                const locacaoData = locacaoDoc.data();
                const localNome = configData.locais[locacaoData.localId]?.nome || 'N/A';
                const locacaoCompleta = `${localNome} - ${locacaoData.locacao}`;

                // Check and update location stock
                const currentEstoqueLocacao = locacaoDoc.data().estoque || 0;
                if (currentEstoqueLocacao < quantidade) {
                    throw `Estoque insuficiente na locação! Disponível: ${currentEstoqueLocacao}`;
                }
                const newEstoqueLocacao = currentEstoqueLocacao - quantidade;
                transaction.update(localizacaoRef, { estoque: newEstoqueLocacao });

                // Update total product stock
                const currentEstoqueTotal = productDoc.data().estoque || 0;
                const newEstoqueTotal = currentEstoqueTotal - quantidade;
                transaction.update(productRef, { estoque: newEstoqueTotal });

                // Create movement record
                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'saida',
                    produtoId,
                    localizacaoId,
                    locacaoCompleta, // Denormalized location string
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
                <td>${mov.locacaoCompleta || 'N/A'}</td>
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
