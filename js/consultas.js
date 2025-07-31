// js/consultas.js - VERSÃO COM LIGAÇÃO INTELIGENTE E AUTOMÁTICA

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// A função de sincronização em segundo plano permanece a mesma
async function sincronizarSaldosNoBanco(dadosParaSincronizar) {
    // ... (código da função sincronizarSaldosNoBanco da resposta anterior)
    console.log('Iniciando processo de correção de saldos no banco de dados em segundo plano...');
    try {
        const updatePromises = dadosParaSincronizar.map(item => {
            const estoqueSalvo = parseFloat(item.estoque) || 0;
            const estoqueReal = parseFloat(item.estoqueAtual) || 0;
            if (Math.abs(estoqueSalvo - estoqueReal) > 0.0001) {
                const productRef = doc(db, 'produtos', item.id);
                console.log(`CORRIGINDO SALDO do produto ${item.codigo}: Valor antigo=${estoqueSalvo}, Valor correto=${estoqueReal}`);
                return updateDoc(productRef, { estoque: estoqueReal });
            }
            return null;
        }).filter(p => p !== null);

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`Sincronização concluída: ${updatePromises.length} produto(s) tiveram seu saldo corrigido.`);
        } else {
            console.log('Sincronização concluída: Nenhum saldo precisou de correção.');
        }
    } catch (error) {
        console.error("ERRO CRÍTICO AO TENTAR CORRIGIR O BANCO DE DADOS:", error);
    }
}

async function fetchDataAndCalculate() {
    const [productsSnapshot, movementsSnapshot, locationsSnapshot, locaisSnapshot] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'movimentacoes')),
        getDocs(collection(db, 'enderecamentos')),
        getDocs(collection(db, 'locais'))
    ]);

    // ===================================================================
    // INÍCIO DA MODIFICAÇÃO: CRIAÇÃO DE MAPAS DE PRODUTOS
    // ===================================================================
    const productsById = {};   // Mapa de produtos por ID (ex: "aBcDeFg123")
    const productsByCode = {}; // Mapa de produtos por CÓDIGO (ex: "18195-000")

    productsSnapshot.forEach(doc => {
        const productData = { id: doc.id, ...doc.data() };
        productsById[doc.id] = productData;
        if (productData.codigo) {
            productsByCode[productData.codigo] = productData;
        }
    });
    // ===================================================================
    // FIM DA MODIFICAÇÃO
    // ===================================================================

    const locations = {};
    locationsSnapshot.forEach(doc => { locations[doc.id] = doc.data(); });
    const locais = {};
    locaisSnapshot.forEach(doc => { locais[doc.id] = doc.data(); });

    // Agrupa as movimentações por ID de produto REAL
    const movementsByProduct = {};
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        let correctProductId = null;

        // ===================================================================
        // INÍCIO DA MODIFICAÇÃO: LIGAÇÃO INTELIGENTE
        // ===================================================================
        // Tenta ligar pelo ID. Se o produto existir nesse ID, ótimo.
        if (productsById[mov.produtoId]) {
            correctProductId = mov.produtoId;
        }
        // Se não existir, tenta ligar pelo CÓDIGO. Assume que o campo 'produtoId' pode conter o código do produto.
        else if (productsByCode[mov.produtoId]) {
            correctProductId = productsByCode[mov.produtoId].id;
            console.log(`Ligação alternativa encontrada para a movimentação: usando código '${mov.produtoId}' para encontrar o produto.`);
        }
        // ===================================================================
        // FIM DA MODIFICAÇÃO
        // ===================================================================

        if (correctProductId) {
            if (!movementsByProduct[correctProductId]) {
                movementsByProduct[correctProductId] = [];
            }
            movementsByProduct[correctProductId].push(mov);
        } else {
            console.warn("Movimentação órfã encontrada, não foi possível ligar a um produto:", mov);
        }
    });

    // O resto do código permanece o mesmo, pois agora a ligação está correta.
    const consolidatedData = Object.values(productsById).map(product => {
        const productMovements = movementsByProduct[product.id] || [];

        let totalEntradas = 0;
        let totalSaidas = 0;

        productMovements.forEach(mov => {
            const quantidadeNumerica = parseFloat(String(mov.quantidade || 0).replace(',', '.')) || 0;
            if (mov.tipo === 'entrada') {
                totalEntradas += quantidadeNumerica;
            } else if (mov.tipo === 'saida') {
                totalSaidas += quantidadeNumerica;
            }
        });

        const estoqueAtual = totalEntradas - totalSaidas;

        // ... resto da função de cálculo de valor médio, etc. ...
        // (o código restante da função que já foi fornecido anteriormente)
        const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && (parseFloat(String(m.valor_unitario || 0).replace(',', '.')) || 0) > 0);
        let totalCost = 0;
        let totalEntryQuantity = 0;
        entryMovements.forEach(m => {
            const quantidade = parseFloat(String(m.quantidade || 0).replace(',', '.')) || 0;
            const valorUnitario = parseFloat(String(m.valor_unitario || 0).replace(',', '.')) || 0;
            const icms = parseFloat(String(m.icms || 0).replace(',', '.')) || 0;
            const ipi = parseFloat(String(m.ipi || 0).replace(',', '.')) || 0;
            const frete = parseFloat(String(m.frete || 0).replace(',', '.')) || 0;

            const entryTotalValue = (quantidade * valorUnitario) + icms + ipi + frete;
            totalCost += entryTotalValue;
            totalEntryQuantity += quantidade;
        });

        const valorMedio = totalEntryQuantity > 0 ? totalCost / totalEntryQuantity : 0;
        const valorTotalEstoque = estoqueAtual * valorMedio;

        const enderecamentoDoc = locations[product.enderecamentoId];
        const localNome = enderecamentoDoc ? (locais[enderecamentoDoc.localId]?.nome || 'N/A') : 'N/A';
        const local = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

        const medidas = productMovements.filter(m => m.medida).map(m => `${m.medida} (${m.tipo})`).join(', ');

        return {
            ...product,
            estoqueAtual,
            valorMedio,
            valorTotalEstoque,
            local,
            medidas
        };
    });

    renderTable(consolidatedData);
    sincronizarSaldosNoBanco(consolidatedData);
    return consolidatedData;
}

// A função renderTable e o listener DOMContentLoaded permanecem os mesmos da última instrução.
// ...
function renderTable(data) {
    const tableBody = document.querySelector('#table-consultas tbody');
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum produto encontrado.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.codigo || ''}</td>
            <td>${item.codigo_global || ''}</td>
            <td>${item.descricao || ''}</td>
            <td>${(item.estoqueAtual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
            <td>${item.un || ''}</td>
            <td>${(item.valorMedio || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td>${(item.valorTotalEstoque || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td>${item.local || ''}</td>
            <td>${item.medidas || '-'}</td>
        `;
        tableBody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        local: document.getElementById('filter-local')
    };

    let consolidatedData = [];

    function applyFilters() {
        const filterValues = {
            codigo: (filters.codigo.value || '').toLowerCase(),
            descricao: (filters.descricao.value || '').toLowerCase(),
            local: (filters.local.value || '').toLowerCase()
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

    try {
        consolidatedData = await fetchDataAndCalculate();
    } catch(error) {
        console.error("Erro fatal ao carregar e calcular dados da consulta:", error);
        const tableBody = document.querySelector('#table-consultas tbody');
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados. Verifique o console.</td></tr>`;
    }
});
