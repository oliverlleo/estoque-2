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
        // 1. Fetch all necessary data
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
            if (!movementsByProduct[mov.productId]) {
                movementsByProduct[mov.productId] = [];
            }
            movementsByProduct[mov.productId].push(mov);
        });

        // 2. Process, calculate and consolidate
        consolidatedData = Object.values(products).map(product => {
            const productMovements = movementsByProduct[product.id] || [];

            let estoqueAtual = 0; // Apenas para itens inteiros
            let inventarioPedacos = {}; // Ex: { "1500mm": 2, "2000mm": 1 }

            productMovements.forEach(mov => {
                const isPiece = mov.medida && mov.medida.trim() !== '';

                if (isPiece) { // É um pedaço
                    const medida = mov.medida.trim();
                    if (mov.tipo === 'entrada') {
                        inventarioPedacos[medida] = (inventarioPedacos[medida] || 0) + 1;
                    } else if (mov.tipo === 'saida') {
                        inventarioPedacos[medida] = (inventarioPedacos[medida] || 0) - 1;
                    }
                } else { // É um item inteiro
                    const quantidade = parseFloat(mov.quantidade) || 0;
                    if (mov.tipo === 'entrada') {
                        estoqueAtual += quantidade;
                    } else if (mov.tipo === 'saida') {
                        estoqueAtual -= quantidade;
                    }
                }
            });

            // Calcula o saldo total de pedaços
            const saldoPedaco = Object.values(inventarioPedacos).reduce((sum, count) => sum + count, 0);

            // Lógica de cálculo de valor médio (mantida como antes)
            const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && m.valor_unitario > 0);
            let totalCost = 0;
            let totalQuantity = 0;
            entryMovements.forEach(m => {
                // Apenas entradas de itens inteiros devem impactar o valor médio
                if (!m.medida || m.medida.trim() === '') {
                    const entryTotalValue = (m.quantidade * m.valor_unitario) + (m.icms || 0) + (m.ipi || 0) + (m.frete || 0);
                    totalCost += entryTotalValue;
                    totalQuantity += m.quantidade;
                }
            });

            const valorMedio = totalQuantity > 0 ? totalCost / totalQuantity : 0;
            const valorTotalEstoque = estoqueAtual * valorMedio; // Valor total apenas de itens inteiros

            const enderecamentoDoc = locations[product.enderecamentoId];
            const localNome = enderecamentoDoc ? (locais[enderecamentoDoc.localId]?.nome || 'N/A') : 'N/A';
            const local = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

            return {
                ...product,
                estoque: estoqueAtual,
                saldoPedaco: saldoPedaco,
                inventarioPedacos: inventarioPedacos,
                valorMedio,
                valorTotalEstoque,
                local
            };
        });

        // A atualização do estoque no Firebase pode ser feita em um processo separado ou mantida
        // por enquanto, vamos focar na exibição correta.
        const updatePromises = consolidatedData.map(product => {
            const productRef = doc(db, 'produtos', product.id);
            // Atualiza apenas o estoque de itens inteiros no documento do produto
            return updateDoc(productRef, { estoque: product.estoque });
        });

        await Promise.all(updatePromises).catch(console.error);


        renderTable(consolidatedData);
    }

    // 4. Render Table
    function renderTable(data) {
        tableBody.innerHTML = '';
        if(data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum produto encontrado.</td></tr>';
            return;
        }

        data.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.codigo_global}</td>
                <td>${item.descricao}</td>
                <td>${item.estoque || 0}</td>
                <td>${item.un}</td>
                <td>${item.saldoPedaco || 0}</td>
                <td>R$ ${item.valorMedio.toFixed(2)}</td>
                <td>R$ ${item.valorTotalEstoque.toFixed(2)}</td>
                <td>${item.local}</td>
                <td>
                    ${item.saldoPedaco > 0 ? `<button class="btn-ver-pedacos" data-product-id="${item.id}"><i data-feather="chevron-down"></i></button>` : '-'}
                </td>
            `;
            tableBody.appendChild(row);

            if (item.saldoPedaco > 0) {
                const detailsRow = document.createElement('tr');
                detailsRow.className = `details-row details-for-${item.id}`;
                detailsRow.style.display = 'none'; // Começa escondida

                let detailsHtml = '<ul>';
                for (const [medida, qtd] of Object.entries(item.inventarioPedacos)) {
                    if (qtd > 0) {
                        detailsHtml += `<li><strong>${qtd}</strong> pedaço(s) de <strong>${medida}</strong></li>`;
                    }
                }
                detailsHtml += '</ul>';

                detailsRow.innerHTML = `<td colspan="10">${detailsHtml}</td>`;
                tableBody.appendChild(detailsRow);
            }
        });
        feather.replace(); // Para renderizar os ícones
    }

    // 5. Filtering logic
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

    // Event listener para os botões de expandir
    tableBody.addEventListener('click', function(event) {
        const button = event.target.closest('.btn-ver-pedacos');
        if (button) {
            const productId = button.dataset.productId;
            const detailsRow = document.querySelector(`.details-for-${productId}`);
            if (detailsRow) {
                const isVisible = detailsRow.style.display !== 'none';
                detailsRow.style.display = isVisible ? 'none' : 'table-row';
                button.innerHTML = isVisible ? '<i data-feather="chevron-down"></i>' : '<i data-feather="chevron-up"></i>';
                feather.replace();
            }
        }
    });

    // Initial Load
    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
