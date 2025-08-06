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

        // 2. Mapeia os dados do produto DIRETAMENTE, sem cálculos.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();

            // 2.1. LÊ o saldo de estoque direto do produto.
            const estoqueAtual = product.estoque || 0;

            // 2.2. LÊ o valor médio direto do produto.
            const valorMedio = product.valorMedio || 0;

            // 2.3. Calcula o valor total apenas para exibição na tela.
            const valorTotalEstoque = estoqueAtual * valorMedio;

            const localNome = locais[product.localId]?.nome || '';
            const locacaoDesc = product.locacao || '';
            const locacaoCompleta = [localNome, locacaoDesc].filter(Boolean).join(' - ') || 'N/A';

            return {
                ...product,
                estoque: estoqueAtual,
                valorMedio, // Valor lido, não recalculado
                valorTotalEstoque, // Valor calculado para exibição
                local: locacaoCompleta
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
