import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    const tableBody = document.querySelector('#table-consultas tbody');
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        local: document.getElementById('filter-local')
    };

    let consolidatedData = [];

    // Substitua a função inteira em js/consultas.js por esta:
    async function fetchDataAndCalculate() {
        // 1. Busca todas as fontes de dados necessárias em paralelo.
        const [productsSnapshot, movementsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'movimentacoes')), // <-- REINTRODUZIDO
            getDocs(collection(db, 'locais'))
        ]);

        // 2. Prepara dados auxiliares (locais e movimentações agrupadas)
        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        const movementsByProduct = {}; // <-- REINTRODUZIDO
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            if (mov.productId) {
                if (!movementsByProduct[mov.productId]) {
                    movementsByProduct[mov.productId] = [];
                }
                movementsByProduct[mov.productId].push(mov);
            }
        });

        // 3. Processa os dados consolidados
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();
            const productMovements = movementsByProduct[productDoc.id] || [];

            // 3.1. Pega o estoque DIRETAMENTE do produto. NUNCA recalcular aqui.
            const estoqueAtual = product.estoque || 0;

            // 3.2. CALCULA O VALOR MÉDIO usando as movimentações
            const entryMovements = productMovements.filter(m =>
                m.tipo === 'entrada' && (m.custo_total_entrada || 0) > 0
            );

            let totalCost = 0;
            let totalQuantityForAvg = 0;
            entryMovements.forEach(m => {
                if (m.quantidade > 0) {
                    totalCost += (m.custo_total_entrada || 0);
                    totalQuantityForAvg += m.quantidade;
                }
            });

            const valorMedio = totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;
            const valorTotalEstoque = estoqueAtual * valorMedio;

            // 3.3. Monta o restante dos dados
            const localNome = locais[product.localId]?.nome || '';
            const locacaoDesc = product.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';

            return {
                ...product,
                estoque: estoqueAtual, // Fonte da verdade
                valorMedio: valorMedio, // Recalculado para exibição
                valorTotalEstoque: valorTotalEstoque, // Recalculado para exibição
                local: locacaoCompleta
            };
        });

        // 4. Renderiza a tabela. NENHUMA atualização é feita no banco de dados.
        renderTable(consolidatedData);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'main-row';
            // Dentro da função renderTable em js/consultas.js
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.estoque || 0}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(2)}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2)}</td>
                <td>${item.local}</td>
            `;
            tableBody.appendChild(row);
        });
        feather.replace();
    }

    function applyFilters() {
        const filterValues = {
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            local: filters.local.value.toLowerCase()
        };

        const filteredData = consolidatedData.filter(item => {
            const matchesCodigo = (item.codigo || '').toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = (item.descricao || '').toLowerCase().includes(filterValues.descricao);
            const matchesLocal = (item.local || '').toLowerCase().includes(filterValues.local);
            return matchesCodigo && matchesDescricao && matchesLocal;
        });

        renderTable(filteredData);
    }

    Object.values(filters).forEach(input => input.addEventListener('input', applyFilters));

    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
