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

        // CORREÇÃO: Criar os mapas para locations e locais
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
            // CORREÇÃO CRÍTICA: Usar 'productId' (minúsculo) como está no Firebase
            if (!movementsByProduct[mov.productId]) {
                movementsByProduct[mov.productId] = [];
            }
            movementsByProduct[mov.productId].push(mov);
        });


        const updatePromises = [];

        // 2. Process, calculate and schedule updates
        const processedProducts = Object.values(products).map(product => {
            let calculatedStock = 0;
            const productMovements = movementsByProduct[product.id] || [];

            productMovements.forEach(mov => {
                const quantity = parseFloat(mov.quantidade) || 0;
                if (mov.tipo === 'entrada') {
                    calculatedStock += quantity;
                } else if (mov.tipo === 'saida') {
                    calculatedStock -= quantity;
                }
            });

            if (product.estoque !== calculatedStock) {
                const productRef = doc(db, 'produtos', product.id);
                updatePromises.push(updateDoc(productRef, { estoque: calculatedStock }));
            }

            return {
                ...product,
                estoque: calculatedStock
            };
        });

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }

        // 3. Consolidate data for rendering
        consolidatedData = processedProducts.map(product => {
            const productMovements = movementsByProduct[product.id] || [];
            const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && m.valor_unitario > 0);

            let totalCost = 0;
            let totalQuantity = 0;
            entryMovements.forEach(m => {
                const entryTotalValue = (m.quantidade * m.valor_unitario) + (m.icms || 0) + (m.ipi || 0) + (m.frete || 0);
                totalCost += entryTotalValue;
                totalQuantity += m.quantidade;
            });

            const valorMedio = totalQuantity > 0 ? totalCost / totalQuantity : 0;
            const valorTotalEstoque = (product.estoque || 0) * valorMedio;

            const enderecamentoDoc = locations[product.enderecamentoId];
            const localNome = enderecamentoDoc ? (locais[enderecamentoDoc.localId]?.nome || 'N/A') : 'N/A';
            const local = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

            const medidas = productMovements
                .filter(m => m.medida)
                .map(m => `${m.medida} (${m.tipo})`)
                .join(', ');

            return {
                ...product,
                valorMedio,
                valorTotalEstoque,
                local,
                medidas
            };
        });

        renderTable(consolidatedData);
    }

    // 4. Render Table
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
                <td>${item.estoque || 0}</td>
                <td>${item.un}</td>
                <td>R$ ${item.valorMedio.toFixed(2)}</td>
                <td>${item.valorTotalEstoque.toFixed(2)}</td>
                <td>${item.local}</td>
                <td>${item.medidas || '-'}</td>
            `;
            tableBody.appendChild(row);
        });
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

    // Initial Load
    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
