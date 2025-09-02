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

    async function fetchDataAndCalculate() {
        const [productsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        const productPromises = productsSnapshot.docs.map(async (productDoc) => {
            const product = productDoc.data();
            const productId = productDoc.id;

            const estoqueSnapshot = await getDocs(collection(db, 'produtos', productId, 'estoquePorLocacao'));

            let estoqueAtual = 0;
            const locacoesComEstoque = [];

            if (!estoqueSnapshot.empty) {
                estoqueSnapshot.forEach(estoqueDoc => {
                    const estoqueData = estoqueDoc.data();
                    const quantidade = estoqueData.quantidade || 0;

                    if (quantidade > 0) {
                        estoqueAtual += quantidade;
                        const locacaoCodigo = estoqueDoc.id;
                        const locacaoInfo = product.locacoes?.find(l => l.codigo === locacaoCodigo);
                        const localNome = locacaoInfo ? (locais[locacaoInfo.localId]?.nome || 'Desconhecido') : 'Desconhecido';
                        locacoesComEstoque.push(`${localNome} - ${locacaoCodigo} (${quantidade})`);
                    }
                });
            }

            const valorMedio = product.valorMedio || 0;
            const valorTotalEstoque = estoqueAtual * valorMedio;

            return {
                ...product,
                id: productId,
                estoque: estoqueAtual,
                valorMedio,
                valorTotalEstoque,
                locacoesComEstoque: locacoesComEstoque.length > 0 ? locacoesComEstoque : ['Sem estoque']
            };
        });

        consolidatedData = await Promise.all(productPromises);
        renderTable(consolidatedData);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            // Only render items that have stock
            if (item.estoque <= 0) return;

            const row = document.createElement('tr');
            row.className = 'main-row';

            const locacoesHtml = item.locacoesComEstoque.join('<br>');

            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.estoque}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(2)}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2)}</td>
                <td>${locacoesHtml}</td>
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
            const matchesLocal = item.locacoesComEstoque.some(locStr => locStr.toLowerCase().includes(filterValues.local));

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
