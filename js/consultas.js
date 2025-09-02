import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    const tableBody = document.querySelector('#table-consultas tbody');
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        local: document.getElementById('filter-local')
    };

    let consolidatedData = [];

// SUBSTITUA A FUNÇÃO 'fetchDataAndCalculate' PELA VERSÃO CORRETA ABAIXO
async function fetchDataAndCalculate() {
    const tableBody = document.querySelector('#table-consultas tbody');
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Buscando produtos...</td></tr>';

    try {
        const [productsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais'))
        ]);

        if (productsSnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum produto cadastrado no sistema.</td></tr>';
            return;
        }

        const locaisMap = {};
        locaisSnapshot.forEach(doc => {
            locaisMap[doc.id] = doc.data();
        });

        const productPromises = productsSnapshot.docs.map(async (productDoc) => {
            const product = productDoc.data();
            const productId = productDoc.id;

            let estoqueTotal = 0;
            let locacoesFormatadas = [];

            // LÓGICA CORRIGIDA:
            // PRIMEIRO, ele procura o estoque no formato NOVO (múltiplas locações).
            const estoqueSnapshot = await getDocs(collection(db, `produtos/${productId}/estoquePorLocacao`));

            if (!estoqueSnapshot.empty) {
                // Se achou, calcula o estoque a partir das múltiplas locações.
                estoqueSnapshot.forEach(estoqueDoc => {
                    const quantidadeNaLocacao = estoqueDoc.data().quantidade || 0;
                    estoqueTotal += quantidadeNaLocacao;
                    if (quantidadeNaLocacao > 0) {
                        const locacaoInfo = product.locacoes?.find(l => l.codigo === estoqueDoc.id);
                        const localNome = locacaoInfo ? (locaisMap[locacaoInfo.localId]?.nome || 'N/A') : 'N/A';
                        locacoesFormatadas.push(`${localNome} - ${estoqueDoc.id} (${quantidadeNaLocacao})`);
                    }
                });
            } else if (product.estoque && product.estoque > 0) {
                // SE NÃO ACHOU no formato novo, ele agora PROCURA no formato ANTIGO.
                // Isso garante que seus dados já gravados apareçam.
                estoqueTotal = product.estoque;
                const localNome = product.localId ? (locaisMap[product.localId]?.nome || '') : '';
                const locacaoDesc = product.locacao || '';
                const locacaoAntiga = [localNome, locacaoDesc].filter(Boolean).join(' - ');
                locacoesFormatadas.push(`${locacaoAntiga} (${estoqueTotal})`);
            }

            const valorMedio = product.valorMedio || 0;
            const valorTotalEstoque = estoqueTotal * valorMedio;

            return {
                ...product,
                estoque: estoqueTotal,
                valorMedio,
                valorTotalEstoque,
                local: locacoesFormatadas.join('<br>') || 'Sem estoque'
            };
        });

        consolidatedData = await Promise.all(productPromises);
        renderTable(consolidatedData);

    } catch (error) {
        console.error("ERRO CRÍTICO AO CARREGAR CONSULTA:", error);
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: red;"><b>Falha na Consulta:</b> ${error.message}</td></tr>`;
    }
}

// SUBSTITUA A FUNÇÃO 'renderTable' EXISTENTE POR ESTA
function renderTable(data) {
    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum item encontrado.</td></tr>';
        return;
    }

    const dataComEstoque = data.filter(item => item.estoque > 0);

    if (dataComEstoque.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum item com estoque encontrado.</td></tr>';
        return;
    }

    tableBody.innerHTML = '';
    dataComEstoque.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.codigo}</td>
            <td>${item.descricao}</td>
            <td>${item.estoque}</td>
            <td>${item.un}</td>
            <td>${(item.valorMedio || 0).toFixed(2)}</td>
            <td>${(item.valorTotalEstoque || 0).toFixed(2)}</td>
            <td>${item.local}</td>
        `;
        tableBody.appendChild(row);
    });
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
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
