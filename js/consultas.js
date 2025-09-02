import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    const tableBody = document.querySelector('#table-consultas tbody');
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        local: document.getElementById('filter-local')
    };

    let consolidatedData = [];

    // Substitua a função inteira em js/consultas.js por esta versão definitiva:
    async function fetchDataAndCalculate() {
        // 1. Busca apenas as fontes de dados essenciais: produtos e locais.
        const [productsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        // 2. Mapeia os dados do produto e calcula os valores derivados.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();

            let estoqueAtual = 0;
            let locacaoCompleta = 'N/A';

            if (product.locacoes && Array.isArray(product.locacoes)) {
                // Calcula o estoque total somando o estoque de cada locação
                estoqueAtual = product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0);

                // Cria a string detalhada de locações para exibição
                if (product.locacoes.length > 0) {
                    locacaoCompleta = product.locacoes.map(loc => {
                        const localNome = locais[loc.localId]?.nome || 'Desconhecido';
                        return `${loc.locacao} (${localNome}) - <b>Estoque: ${loc.estoque || 0}</b>`;
                    }).join('<br>');
                }
            }

            const valorMedio = product.valorMedio || 0;
            const valorTotalEstoque = estoqueAtual * valorMedio;

            return {
                ...product,
                estoque: estoqueAtual,
                valorMedio,
                valorTotalEstoque,
                local: locacaoCompleta // Reutilizando a coluna 'local' para a nova string de locação
            };
        });

        // 3. Renderiza a tabela. A função agora é 100% "read-only".
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
