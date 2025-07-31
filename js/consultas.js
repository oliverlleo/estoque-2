import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Em js/consultas.js, logo após as linhas de 'import'

async function sincronizarSaldosNoBanco(dadosParaSincronizar) {
    // Esta função não trava a tela principal, ela roda em segundo plano.
    console.log('Iniciando sincronização de saldos em segundo plano...');
    try {
        const updatePromises = dadosParaSincronizar.map(item => {
            // Compara o saldo no banco com o saldo real. Só atualiza se for diferente.
            if (item.estoque !== item.estoqueAtual) {
                const productRef = doc(db, 'produtos', item.id);
                console.log(`Corrigindo saldo do produto ${item.codigo}: ${item.estoque} -> ${item.estoqueAtual}`);
                return updateDoc(productRef, {
                    estoque: item.estoqueAtual
                });
            }
            return Promise.resolve(); // Retorna uma promessa resolvida se não precisar de atualização
        });

        await Promise.all(updatePromises);
        console.log('Sincronização de saldos em segundo plano concluída com sucesso.');

    } catch (error) {
        console.error("Erro ao sincronizar saldos em segundo plano:", error);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    const tableBody = document.querySelector('#table-consultas tbody');
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        local: document.getElementById('filter-local')
    };

    let consolidatedData = [];

async function fetchDataAndCalculate() {
    // 1. Fetch all necessary data (sem alterações aqui)
    const [productsSnapshot, movementsSnapshot, locationsSnapshot, locaisSnapshot] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'movimentacoes')),
        getDocs(collection(db, 'enderecamentos')),
        getDocs(collection(db, 'locais'))
    ]);

    const products = {};
    productsSnapshot.forEach(doc => {
        products[doc.id] = { id: doc.id, ...doc.data() };
    });

    const locations = {};
    locationsSnapshot.forEach(doc => {
        locations[doc.id] = doc.data();
    });

    const locais = {};
    locaisSnapshot.forEach(doc => {
        locais[doc.id] = doc.data();
    });

    const movementsByProduct = {};
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        if (!movementsByProduct[mov.produtoId]) {
            movementsByProduct[mov.produtoId] = [];
        }
        movementsByProduct[mov.produtoId].push(mov);
    });

    // 2. Process and calculate for each product (LÓGICA CORRIGIDA)
    consolidatedData = Object.values(products).map(product => {
        const productMovements = movementsByProduct[product.id] || [];

        // =======================================================================
        // INÍCIO DA LÓGICA DE CÁLCULO DE ESTOQUE REAL
        // =======================================================================
        let totalEntradas = 0;
        let totalSaidas = 0;

        productMovements.forEach(mov => {
            if (mov.tipo === 'entrada') {
                totalEntradas += mov.quantidade || 0;
            } else if (mov.tipo === 'saida') {
                totalSaidas += mov.quantidade || 0;
            }
        });

        const estoqueAtual = totalEntradas - totalSaidas;
        // =======================================================================
        // FIM DA LÓGICA DE CÁLCULO DE ESTOQUE REAL
        // =======================================================================

        const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && m.valor_unitario > 0);
        let totalCost = 0;
        let totalQuantity = 0;
        entryMovements.forEach(m => {
            const entryTotalValue = (m.quantidade * m.valor_unitario) + (m.icms || 0) + (m.ipi || 0) + (m.frete || 0);
            totalCost += entryTotalValue;
            totalQuantity += m.quantidade;
        });

        const valorMedio = totalQuantity > 0 ? totalCost / totalQuantity : 0;
        // Usa o estoque REAL para calcular o valor total
        const valorTotalEstoque = estoqueAtual * valorMedio;

        const enderecamentoDoc = locations[product.enderecamentoId];
        const localNome = enderecamentoDoc ? (locais[enderecamentoDoc.localId]?.nome || 'N/A') : 'N/A';
        const local = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

        const medidas = productMovements
            .filter(m => m.medida)
            .map(m => `${m.medida} (${m.tipo})`)
            .join(', ');

        return {
            ...product,
            estoqueAtual, // Passa o novo valor calculado
            valorMedio,
            valorTotalEstoque,
            local,
            medidas
        };
    });

        // ===================================================================
        // INÍCIO DA MODIFICAÇÃO: Automatiza a sincronização
        // ===================================================================

        // 1. Renderiza a tabela imediatamente para o usuário não ter que esperar
        renderTable(consolidatedData);

        // 2. Chama a função de sincronização para rodar em segundo plano
        sincronizarSaldosNoBanco(consolidatedData);

        // ===================================================================
        // FIM DA MODIFICAÇÃO
        // ===================================================================
    }

    // 3. Render Table
    function renderTable(data) {
        tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando...</td></tr>';
        if(data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum produto encontrado.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.codigo_global}</td>
                <td>${item.descricao}</td>
                <td>${item.estoqueAtual || 0}</td> <td>${item.un}</td>
                <td>R$ ${item.valorMedio.toFixed(2)}</td>
                <td>R$ ${item.valorTotalEstoque.toFixed(2)}</td>
                <td>${item.local}</td>
                <td>${item.medidas || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // 4. Filtering
    function applyFilters() {
        const filterValues = {
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            local: filters.local.value.toLowerCase()
        };

        const filteredData = consolidatedData.filter(item => {
            const matchesCodigo = item.codigo.toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = item.descricao.toLowerCase().includes(filterValues.descricao);
            const matchesLocal = item.local.toLowerCase().includes(filterValues.local);
            return matchesCodigo && matchesDescricao && matchesLocal;
        });

        renderTable(filteredData);
    }

    Object.values(filters).forEach(input => input.addEventListener('input', applyFilters));

    // Initial Load
    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados.</td></tr>`;
    });
});
