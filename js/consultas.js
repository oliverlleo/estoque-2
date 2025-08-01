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
            let inventarioPedacos = {};

            productMovements.forEach(mov => {
                const isPiece = mov.medida && mov.medida.trim() !== '';
                const quantidade = parseFloat(mov.quantidade) || 0;

                if (isPiece) {
                    const medida = mov.medida.trim();
                    if (mov.tipo === 'entrada') {
                        inventarioPedacos[medida] = (inventarioPedacos[medida] || 0) + 1;
                    } else if (mov.tipo === 'saida') {
                        inventarioPedacos[medida] = (inventarioPedacos[medida] || 0) - 1;
                    }
                } else {
                    if (mov.tipo === 'entrada') {
                        estoqueAtual += quantidade;
                    } else if (mov.tipo === 'saida') {
                        estoqueAtual -= quantidade;
                    }
                }
            });

            if (product.estoque !== estoqueAtual) {
                const productRef = doc(db, 'produtos', product.id);
                updatePromises.push(updateDoc(productRef, { estoque: estoqueAtual }));
            }

            const saldoPedaco = Object.values(inventarioPedacos).reduce((sum, count) => sum + count, 0);

            const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && (m.valor_unitario || 0) > 0);
            let totalCost = 0;
            let totalQuantityForAvg = 0;
            entryMovements.forEach(m => {
                if ((!m.medida || m.medida.trim() === '') && m.quantidade > 0) {
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
                <td>${item.saldoPedaco || 0}</td>
                <td>R$ ${item.valorMedio.toFixed(2)}</td>
                <td>R$ ${item.valorTotalEstoque.toFixed(2)}</td>
                <td>${item.local}</td>
                <td>
                    ${(item.saldoPedaco || 0) > 0 ? `<button class="btn-ver-pedacos" data-product-id="${item.id}"><i data-feather="chevron-down"></i></button>` : '-'}
                </td>
            `;
            tableBody.appendChild(row);

            if ((item.saldoPedaco || 0) > 0) {
                const detailsRow = document.createElement('tr');
                detailsRow.className = `details-row details-for-${item.id}`;
                detailsRow.style.display = 'none';

                let detailsHtml = '<ul style="margin: 0; padding-left: 20px;">';
                for (const [medida, qtd] of Object.entries(item.inventarioPedacos)) {
                    if (qtd > 0) {
                        detailsHtml += `<li style="padding: 4px 0;"><strong>${qtd}</strong> pedaço(s) de <strong>${medida}</strong></li>`;
                    }
                }
                detailsHtml += '</ul>';

                detailsRow.innerHTML = `<td colspan="10" style="background-color: #f8f9fa;">${detailsHtml}</td>`;
                tableBody.appendChild(detailsRow);
            }
        });
        feather.replace();
    }

    tableBody.addEventListener('click', function(event) {
        const button = event.target.closest('.btn-ver-pedacos');
        if (button) {
            const productId = button.dataset.productId;
            const detailsRow = document.querySelector(`.details-for-${productId}`);
            const icon = button.querySelector('i');

            if (detailsRow) {
                const isVisible = detailsRow.style.display !== 'none';
                detailsRow.style.display = isVisible ? 'none' : 'table-row';
                icon.setAttribute('data-feather', isVisible ? 'chevron-down' : 'chevron-up');
                feather.replace();
            }
        }
    });

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
