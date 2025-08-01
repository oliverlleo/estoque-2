import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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
        const [productsSnapshot, movementsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(collection(db, 'produtos')),
            getDocs(collection(db, 'movimentacoes')),
            getDocs(collection(db, 'locais'))
        ]);

        const products = {};
        productsSnapshot.forEach(doc => {
            products[doc.id] = { id: doc.id, ...doc.data() };
        });

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        const movementsByProduct = {};
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            if (mov.productId) {
                if (!movementsByProduct[mov.productId]) {
                    movementsByProduct[mov.productId] = [];
                }
                movementsByProduct[mov.productId].push(mov);
            }
        });

        const updatePromises = [];

        consolidatedData = Object.values(products).map(product => {
            const productMovements = movementsByProduct[product.id] || [];

            let estoqueAtual = 0;

            productMovements.forEach(mov => {
                const quantidade = parseFloat(mov.quantidade) || 0;

                if (mov.tipo === 'entrada') {
                    estoqueAtual += quantidade;
                } else if (mov.tipo === 'saida') {
                    estoqueAtual -= quantidade;
                }
            });

            if (product.estoque !== estoqueAtual) {
                const productRef = doc(db, 'produtos', product.id);
                updatePromises.push(updateDoc(productRef, { estoque: estoqueAtual }));
            }

            const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && (m.valor_unitario || 0) > 0);
            let totalCost = 0;
            let totalQuantityForAvg = 0;
            entryMovements.forEach(m => {
                if (m.quantidade > 0) {
                    let entryTotalValue = 0;

                    // Se o novo campo 'custo_total_entrada' existir, use-o
                    if (m.custo_total_entrada !== undefined) {
                        entryTotalValue = m.custo_total_entrada;
                    } else {
                        // Senão, calcule da forma antiga (fallback para dados legados)
                        const valorUnit = m.valor_unitario || 0;
                        const qtdCompra = m.quantidade_compra || m.quantidade; // Usa qtd_compra se existir
                        entryTotalValue = (qtdCompra * valorUnit) + (m.icms || 0) + (m.ipi || 0) + (m.frete || 0);
                    }

                    totalCost += entryTotalValue;
                    totalQuantityForAvg += m.quantidade;
                }
            });

            const valorMedio = totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;
            const valorTotalEstoque = (estoqueAtual || 0) * valorMedio;

            const localNome = locais[product.localId]?.nome || '';
            const locacaoDesc = product.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';

            return {
                ...product,
                estoque: estoqueAtual,
                valorMedio,
                valorTotalEstoque,
                local: locacaoCompleta
            };
        });

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }

        renderTable(consolidatedData);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'main-row';
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.estoque || 0}</td>
                <td>${item.un}</td>
                <td>${item.valorMedio.toFixed(2)}</td>
                <td>${item.valorTotalEstoque.toFixed(2)}</td>
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
