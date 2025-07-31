// js/consultas.js - VERSÃO FINAL E DEFINITIVA

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/**
 * Função que roda em segundo plano para corrigir os saldos no Firebase.
 */
async function sincronizarSaldosNoBanco(dadosParaSincronizar) {
    console.log('[Sincronização] Iniciando correção de saldos em segundo plano...');
    try {
        const updates = dadosParaSincronizar.map(item => {
            const estoqueSalvo = parseFloat(item.estoque) || 0;
            const estoqueReal = parseFloat(item.estoqueAtual) || 0;

            if (Math.abs(estoqueSalvo - estoqueReal) > 0.0001) {
                const productRef = doc(db, 'produtos', item.id);
                console.log(`[Sincronização] CORRIGINDO PRODUTO ${item.codigo}: Valor antigo=${estoqueSalvo}, Valor novo=${estoqueReal}`);
                return updateDoc(productRef, { estoque: estoqueReal });
            }
            return null;
        }).filter(Boolean);

        if (updates.length > 0) {
            await Promise.all(updates);
            console.log(`[Sincronização] Concluída: ${updates.length} produto(s) foram corrigidos no banco de dados.`);
        } else {
            console.log('[Sincronização] Concluída: Todos os saldos no banco de dados já estavam corretos.');
        }

    } catch (error) {
        console.error("[Sincronização] ERRO CRÍTICO AO TENTAR CORRIGIR O BANCO DE DADOS:", error);
    }
}

/**
 * Função principal que busca todos os dados e calcula o estoque real.
 */
async function fetchDataAndCalculate() {
    console.log("[Consulta] Iniciando busca de dados do Firebase...");
    const [productsSnapshot, movementsSnapshot, locationsSnapshot, locaisSnapshot] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'movimentacoes')),
        getDocs(collection(db, 'enderecamentos')),
        getDocs(collection(db, 'locais'))
    ]);
    console.log(`[Consulta] Dados recebidos: ${productsSnapshot.size} produtos, ${movementsSnapshot.size} movimentações.`);

    // 1. Mapeia os produtos por ID e por CÓDIGO para criar uma ligação robusta.
    const productsById = new Map();
    const productsByCode = new Map();
    productsSnapshot.forEach(doc => {
        const productData = { id: doc.id, ...doc.data() };
        productsById.set(doc.id, productData);
        if (productData.codigo) {
            productsByCode.set(productData.codigo, productData);
        }
    });

    const locations = {};
    locationsSnapshot.forEach(doc => { locations[doc.id] = doc.data(); });
    const locais = {};
    locaisSnapshot.forEach(doc => { locais[doc.id] = doc.data(); });

    // 2. Agrupa as movimentações pelo ID de produto correto, usando a ligação inteligente.
    const movementsByProduct = new Map();
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        let product = null;

        // TENTATIVA DE LIGAÇÃO 1: Pelo ID direto (o método correto)
        if (productsById.has(mov.produtoId)) {
            product = productsById.get(mov.produtoId);
        }
        // TENTATIVA DE LIGAÇÃO 2: Pelo código do produto (para dados antigos ou inconsistentes)
        else if (productsByCode.has(mov.produtoId)) {
            product = productsByCode.get(mov.produtoId);
            console.warn(`[Consulta] Ligação alternativa usada para a movimentação. O campo 'produtoId' ("${mov.produtoId}") corresponde a um CÓDIGO de produto, não a um ID.`);
        }

        if (product) {
            if (!movementsByProduct.has(product.id)) {
                movementsByProduct.set(product.id, []);
            }
            movementsByProduct.get(product.id).push(mov);
        } else {
            console.error(`[Consulta] Movimentação ÓRFÃ IGNORADA: Não foi possível encontrar um produto correspondente para o 'produtoId' "${mov.produtoId}".`, mov);
        }
    });

    // 3. Processa os dados finais
    const consolidatedData = Array.from(productsById.values()).map(product => {
        const productMovements = movementsByProduct.get(product.id) || [];

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

        // Lógica de cálculo de valor médio
        const entryMovements = productMovements.filter(m => m.tipo === 'entrada' && (parseFloat(String(m.valor_unitario || 0).replace(',', '.')) || 0) > 0);
        let totalCost = 0;
        let totalEntryQuantity = 0;
        entryMovements.forEach(m => {
            const quantidade = parseFloat(String(m.quantidade || 0).replace(',', '.')) || 0;
            const valorUnitario = parseFloat(String(m.valor_unitario || 0).replace(',', '.')) || 0;
            const entryTotalValue = (quantidade * valorUnitario) + (parseFloat(String(m.icms || 0).replace(',', '.')) || 0) + (parseFloat(String(m.ipi || 0).replace(',', '.')) || 0) + (parseFloat(String(m.frete || 0).replace(',', '.')) || 0);
            totalCost += entryTotalValue;
            totalEntryQuantity += quantidade;
        });

        const valorMedio = totalEntryQuantity > 0 ? totalCost / totalEntryQuantity : 0;
        const valorTotalEstoque = estoqueAtual * valorMedio;

        const enderecamentoDoc = locations[product.enderecamentoId];
        const localNome = enderecamentoDoc ? (locais[enderecamentoDoc.localId]?.nome || 'N/A') : 'N/A';
        const local = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

        const medidas = productMovements.filter(m => m.medida).map(m => `${m.medida} (${m.tipo})`).join(', ');

        return { ...product, estoqueAtual, valorMedio, valorTotalEstoque, local, medidas };
    });

    renderTable(consolidatedData);
    sincronizarSaldosNoBanco(consolidatedData);
    return consolidatedData;
}

/**
 * Função que desenha a tabela na tela
 */
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

/**
 * Lógica principal da página
 */
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
        document.querySelector('#table-consultas tbody').innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados. Verifique o console.</td></tr>`;
    }
});
