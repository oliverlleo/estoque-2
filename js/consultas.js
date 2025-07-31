// js/consultas.js - VERSÃO COMPLETA E FINAL

import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/**
 * Função que roda em segundo plano para corrigir os saldos no Firebase.
 * Ela é chamada automaticamente e não trava a exibição da página.
 */
async function sincronizarSaldosNoBanco(dadosParaSincronizar) {
    console.log('Iniciando processo de correção de saldos no banco de dados em segundo plano...');
    try {
        const updatePromises = dadosParaSincronizar.map(item => {
            const estoqueSalvo = parseFloat(item.estoque) || 0;
            const estoqueReal = parseFloat(item.estoqueAtual) || 0;

            // Para evitar escritas desnecessárias, só atualiza se houver uma diferença.
            // A comparação com 0.0001 evita problemas com a precisão de números de ponto flutuante.
            if (Math.abs(estoqueSalvo - estoqueReal) > 0.0001) {
                const productRef = doc(db, 'produtos', item.id);
                console.log(`CORRIGINDO SALDO do produto ${item.codigo}: Valor antigo=${estoqueSalvo}, Valor correto=${estoqueReal}`);
                // A linha abaixo atualiza o campo 'estoque' original com o valor real calculado.
                return updateDoc(productRef, {
                    estoque: estoqueReal
                });
            }
            return null; // Retorna nulo se não precisar de atualização.
        }).filter(p => p !== null); // Cria uma lista apenas com as atualizações necessárias.

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`Sincronização concluída: ${updatePromises.length} produto(s) tiveram seu saldo corrigido no banco de dados.`);
        } else {
            console.log('Sincronização concluída: Nenhum saldo precisou de correção.');
        }

    } catch (error) {
        // Este erro aparecerá no console do navegador se a escrita no banco de dados falhar.
        console.error("ERRO CRÍTICO AO TENTAR CORRIGIR O BANCO DE DADOS:", error);
    }
}

/**
 * Função principal que busca os dados, calcula o estoque real e prepara a exibição.
 */
async function fetchDataAndCalculate() {
    // 1. Busca todos os dados necessários do Firebase em paralelo para mais velocidade.
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
        if (!movementsByProduct[mov.produtoId]) {
            movementsByProduct[mov.produtoId] = [];
        }
        movementsByProduct[mov.produtoId].push(mov);
    });

    // 2. Processa cada produto para calcular o estoque real.
    const consolidatedData = Object.values(products).map(product => {
        const productMovements = movementsByProduct[product.id] || [];

        let totalEntradas = 0;
        let totalSaidas = 0;

        productMovements.forEach(mov => {
            // Lógica robusta para garantir que a quantidade seja sempre um número,
            // tratando tanto o formato de ponto quanto o de vírgula.
            const quantidadeNumerica = parseFloat(String(mov.quantidade || 0).replace(',', '.')) || 0;
            if (mov.tipo === 'entrada') {
                totalEntradas += quantidadeNumerica;
            } else if (mov.tipo === 'saida') {
                totalSaidas += quantidadeNumerica;
            }
        });

        // O SALDO REAL E CORRETO É CALCULADO AQUI.
        const estoqueAtual = totalEntradas - totalSaidas;

        // Lógica para calcular o valor médio do estoque
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

        // Lógica de endereçamento
        const enderecamentoDoc = locations[product.enderecamentoId];
        const localNome = enderecamentoDoc ? (locais[enderecamentoDoc.localId]?.nome || 'N/A') : 'N/A';
        const local = enderecamentoDoc ? `${enderecamentoDoc.codigo} - ${localNome}` : 'N/A';

        const medidas = productMovements.filter(m => m.medida).map(m => `${m.medida} (${m.tipo})`).join(', ');

        // Retorna o objeto de dados com o campo 'estoqueAtual', que contém o valor correto.
        return {
            ...product,
            estoqueAtual,
            valorMedio,
            valorTotalEstoque,
            local,
            medidas
        };
    });

    // 3. Renderiza a tabela para o usuário com os dados corretos.
    renderTable(consolidatedData);

    // 4. Dispara a função que corrige os dados no banco de dados em segundo plano.
    sincronizarSaldosNoBanco(consolidatedData);

    // Devolve os dados para serem usados pelos filtros da página.
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
        // ESTA FUNÇÃO USA 'item.estoqueAtual' para exibir o saldo, IGNORANDO o valor antigo.
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

    // Carregamento inicial dos dados.
    try {
        consolidatedData = await fetchDataAndCalculate();
    } catch(error) {
        console.error("Erro fatal ao carregar e calcular dados da consulta:", error);
        const tableBody = document.querySelector('#table-consultas tbody');
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Erro ao carregar dados. Verifique o console do navegador para mais detalhes.</td></tr>`;
    }
});
