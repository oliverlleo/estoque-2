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

    // Substitua a função inteira em js/consultas.js por esta:
    async function fetchDataAndCalculate() {
        // Busca apenas os produtos e os locais, não precisa mais das movimentações para o cálculo.
        const [productsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))), // Garante que não mostre arquivados
            getDocs(collection(db, 'locais'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        // Mapeia os dados do produto diretamente, sem recálculos.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();

            // O saldo de estoque é lido DIRETAMENTE do produto. Esta é a fonte da verdade.
            const estoqueAtual = product.estoque || 0;

            const localNome = locais[product.localId]?.nome || '';
            const locacaoDesc = product.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';

            // O cálculo de valor médio ainda pode precisar das movimentações,
            // mas para resolver o problema atual, vamos simplificar temporariamente.
            // Se o cálculo de valor for necessário, ele deve ser feito em separado
            // e NUNCA deve atualizar o estoque.
            const valorMedio = product.valorMedio || 0; // Supondo que o valor médio seja salvo no produto
            const valorTotalEstoque = estoqueAtual * valorMedio;

            return {
                ...product,
                estoque: estoqueAtual,
                valorMedio,
                valorTotalEstoque,
                local: locacaoCompleta
            };
        });

        // A lógica de `updatePromises` é REMOVIDA. A consulta não deve mais escrever no banco.

        renderTable(consolidatedData);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'main-row';
            // Dentro da função renderTable em js/consultas.js
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.estoque || 0}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(2)}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2)}</td>
                <td>${item.local}</td>
            `;
            tableBody.appendChild(row);
        });
        feather.replace();
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
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
