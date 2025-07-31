// js/consultas.js - VERSÃO FINAL E CORRIGIDA

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/**
 * Função que roda em segundo plano para corrigir permanentemente os saldos no Firebase.
 * É chamada automaticamente e não trava a exibição da página.
 */
async function sincronizarSaldosNoBanco(dadosParaSincronizar) {
    try {
        const updatePromises = dadosParaSincronizar.map(item => {
            const estoqueSalvo = parseFloat(item.estoque) || 0;
            const estoqueReal = parseFloat(item.estoqueAtual) || 0;

            // Para otimizar, só atualiza o banco se houver uma diferença real.
            if (Math.abs(estoqueSalvo - estoqueReal) > 0.0001) {
                const productRef = doc(db, 'produtos', item.id);
                return updateDoc(productRef, {
                    estoque: estoqueReal
                });
            }
            return null;
        }).filter(p => p !== null);

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`[Sincronização] Concluída: ${updatePromises.length} produto(s) tiveram seu saldo corrigido no banco de dados.`);
        }

    } catch (error) {
        console.error("[Sincronização] ERRO CRÍTICO AO TENTAR CORRIGIR O BANCO DE DADOS:", error);
    }
}

/**
 * Função principal que busca os dados, calcula o estoque real de forma robusta e prepara a exibição.
 */
async function fetchDataAndCalculate() {
    // 1. Busca todos os dados necessários do Firebase.
    const [productsSnapshot, movementsSnapshot, locationsSnapshot, locaisSnapshot] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'movimentacoes')),
        getDocs(collection(db, 'enderecamentos')),
        getDocs(collection(db, 'locais'))
    ]);

    // 2. Cria dois "mapas" de produtos para uma busca à prova de falhas.
    // Um para buscar pelo ID longo do Firebase e outro para buscar pelo código do produto.
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

    // 3. Agrupa as movimentações pelo ID de produto correto, usando a lógica de "ligação inteligente".
    const movementsByProduct = new Map();
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        let produtoEncontrado = null;

        // TENTATIVA 1: Tenta encontrar o produto pelo seu ID oficial (método correto).
        produtoEncontrado = productsById.get(mov.produtoId);

        // TENTATIVA 2 (Plano B): Se não encontrou, tenta encontrar pelo código.
        // Isso corrige o problema de movimentações salvas com o código do produto em vez do ID.
        if (!produtoEncontrado) {
            produtoEncontrado = productsByCode.get(mov.produtoId);
        }

        // Se encontrou um produto por qualquer um dos métodos, associa a movimentação a ele.
        if (produtoEncontrado) {
            if (!movementsByProduct.has(produtoEncontrado.id)) {
                movementsByProduct.set(produtoEncontrado.id, []);
            }
            movementsByProduct.get(produtoEncontrado.id).push(mov);
        }
    });

    // 4. Processa os dados finais, calculando o estoque real.
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

        // O resto da lógica para calcular valor médio e outros campos.
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

    // 5. Renderiza a tabela e dispara a correção no banco de dados.
    renderTable(consolidatedData);
    sincronizarSaldosNoBanco(consolidatedData);
    return consolidatedData;
}

/**
 * Função que desenha a tabela na tela, usando o valor de estoque correto.
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
        // Usa 'item.estoqueAtual' para exibir o saldo, ignorando o valor antigo.
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
 * Lógica principal da página, que organiza a execução das funções.
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
