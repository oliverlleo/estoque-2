// js/consultas.js - VERSÃO FINAL E DEFINITIVA

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/**
 * Função que roda em segundo plano para corrigir permanentemente os saldos no Firebase.
 */
async function sincronizarSaldosNoBanco(dadosParaSincronizar) {
    try {
        const updatePromises = dadosParaSincronizar.map(item => {
            const estoqueSalvo = parseFloat(item.estoque) || 0;
            const estoqueReal = parseFloat(item.estoqueAtual) || 0;

            if (Math.abs(estoqueSalvo - estoqueReal) > 0.0001) {
                const productRef = doc(db, 'produtos', item.id);
                return updateDoc(productRef, { estoque: estoqueReal });
            }
            return null;
        }).filter(p => p !== null);

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`[Sincronização] Concluída: ${updatePromises.length} produto(s) tiveram seu saldo corrigido no banco de dados.`);
        }

    } catch (error) {
        console.error("[Sincronização] ERRO AO TENTAR CORRIGIR O BANCO DE DADOS:", error);
    }
}

/**
 * Função principal que busca os dados, calcula o estoque real de forma robusta e prepara a exibição.
 */
async function fetchDataAndCalculate() {
    const [productsSnapshot, movementsSnapshot, locationsSnapshot, locaisSnapshot] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'movimentacoes')),
        getDocs(collection(db, 'enderecamentos')),
        getDocs(collection(db, 'locais'))
    ]);

    const productsById = new Map();
    productsSnapshot.forEach(doc => {
        productsById.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const locations = {};
    locationsSnapshot.forEach(doc => { locations[doc.id] = doc.data(); });
    const locais = {};
    locaisSnapshot.forEach(doc => { locais[doc.id] = doc.data(); });

    const movementsByProduct = new Map();
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();

        if (mov.produtoId && typeof mov.produtoId === 'string' && mov.produtoId.trim() !== "") {
            const cleanProductId = mov.produtoId.trim();
            if (productsById.has(cleanProductId)) {
                if (!movementsByProduct.has(cleanProductId)) {
                    movementsByProduct.set(cleanProductId, []);
                }
                movementsByProduct.get(cleanProductId).push(mov);
            }
        }
    });

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

        return { ...product, estoqueAtual, valorMedio, valorTotalEstoque, local, medidas };
    });

    renderTable(consolidatedData);
    sincronizarSaldosNoBanco(consolidatedData);
    return consolidatedData;
}

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
    let consolidatedData = [];

    function applyFilters() {
        const filters = {
            codigo: document.getElementById('filter-codigo'),
            descricao: document.getElementById('filter-descricao'),
            local: document.getElementById('filter-local')
        };
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

    document.getElementById('filter-codigo').addEventListener('input', applyFilters);
    document.getElementById('filter-descricao').addEventListener('input', applyFilters);
    document.getElementById('filter-local').addEventListener('input', applyFilters);

    try {
        consolidatedData = await fetchDataAndCalculate();
    } catch(error) {
        console.error("Erro fatal ao carregar e calcular dados da consulta:", error);
        document.querySelector('#table-consultas tbody').innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados.</td></tr>`;
    }
});
