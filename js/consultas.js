// js/consultas.js - VERSÃO DE DIAGNÓSTICO

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

async function fetchDataAndCalculate() {
    console.log("--- INICIANDO DIAGNÓSTICO ---");

    // 1. Busca os dados
    const [productsSnapshot, movementsSnapshot] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'movimentacoes'))
    ]);
    console.log(`Encontrados ${productsSnapshot.size} produtos e ${movementsSnapshot.size} movimentações.`);

    // 2. Cria um mapa de todos os produtos encontrados
    const productsById = new Map();
    console.log("--- IDs de todos os PRODUTOS encontrados no banco de dados ---");
    productsSnapshot.forEach(doc => {
        // Imprime cada ID de produto que ele encontrou
        console.log(`ID de Produto na lista: "${doc.id}"`);
        productsById.set(doc.id, { id: doc.id, ...doc.data() });
    });
    console.log("---------------------------------------------------------");

    // 3. Tenta ligar cada movimentação a um produto
    const movementsByProduct = new Map();
    console.log("--- Verificando cada MOVIMENTAÇÃO para encontrar seu produto pai ---");
    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        const produtoIdNaMovimentacao = mov.produtoId;

        // Imprime o ID que está dentro da movimentação
        console.log(`Verificando movimentação... tentando encontrar o produto com ID: "${produtoIdNaMovimentacao}"`);

        // Verifica se o ID da movimentação existe no mapa de produtos
        if (productsById.has(produtoIdNaMovimentacao)) {
            console.log(`   -> SUCESSO! Produto encontrado. Ligando movimentação ao produto.`);
            const product = productsById.get(produtoIdNaMovimentacao);
            if (!movementsByProduct.has(product.id)) {
                movementsByProduct.set(product.id, []);
            }
            movementsByProduct.get(product.id).push(mov);
        } else {
            // Se não encontrou, avisa qual ID ele procurou e não achou
            console.error(`   -> FALHA! Movimentação ÓRFÃ. O ID "${produtoIdNaMovimentacao}" não foi encontrado na lista de produtos.`);
        }
    });
    console.log("-----------------------------------------------------------------");

    // 4. Calcula o estoque baseado nas ligações que conseguiu fazer
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
        console.log(`Produto "${product.codigo}": Saldo final calculado = ${estoqueAtual}`);

        // O resto do código para popular os outros campos permanece o mesmo...
        return { ...product, estoqueAtual };
    });

    console.log("--- DIAGNÓSTICO CONCLUÍDO ---");
    renderTable(consolidatedData);
    // A sincronização pode ser comentada durante o diagnóstico para não poluir o log
    // sincronizarSaldosNoBanco(consolidatedData);
    return consolidatedData;
}

// A função renderTable e o listener DOMContentLoaded podem permanecer os mesmos.
// ... (resto do arquivo)
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
        document.querySelector('#table-consultas tbody').innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados. Verifique o console.</td></tr>`;
    }
});
