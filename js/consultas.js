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

    // SUBSTITUA A FUNÇÃO ANTIGA POR ESTA VERSÃO COMPLETA E CORRIGIDA
    async function fetchDataAndCalculate() {
        // 1. Mostra uma mensagem de "Carregando..." para o usuário saber que algo está acontecendo.
        const tableBody = document.querySelector('#table-consultas tbody');
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando dados e calculando estoque...</td></tr>';

        try {
            // 2. Busca as fontes de dados essenciais: produtos e locais.
            const [productsSnapshot, locaisSnapshot] = await Promise.all([
                getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
                getDocs(collection(db, 'locais'))
            ]);

            const locaisMap = {};
            locaisSnapshot.forEach(doc => {
                locaisMap[doc.id] = doc.data();
            });

            // 3. Mapeia os dados dos produtos e busca o estoque de suas locações em paralelo.
            const productPromises = productsSnapshot.docs.map(async (productDoc) => {
                const product = productDoc.data();
                const productId = productDoc.id;

                // 3.1. Busca a subcoleção de estoque para este produto específico.
                const estoqueSnapshot = await getDocs(collection(db, `produtos/${productId}/estoquePorLocacao`));

                let estoqueTotal = 0;
                const locacoesComEstoque = [];

                // 3.2. Itera sobre cada locação que tem estoque.
                estoqueSnapshot.forEach(estoqueDoc => {
                    const estoqueData = estoqueDoc.data();
                    const locacaoCodigo = estoqueDoc.id;
                    const quantidadeNaLocacao = estoqueData.quantidade || 0;

                    if (quantidadeNaLocacao > 0) { // Apenas adiciona se tiver estoque
                        estoqueTotal += quantidadeNaLocacao;

                        // Encontra o 'localId' a partir do array de locações no produto.
                        const locacaoInfo = product.locacoes?.find(l => l.codigo === locacaoCodigo);
                        const localNome = locacaoInfo ? (locaisMap[locacaoInfo.localId]?.nome || 'Local Desconhecido') : 'Local Desconhecido';

                        locacoesComEstoque.push(`${localNome} - ${locacaoCodigo} (${quantidadeNaLocacao})`);
                    }
                });

                // 3.3. Calcula o valor médio e total.
                const valorMedio = product.valorMedio || 0;
                const valorTotalEstoque = estoqueTotal * valorMedio;

                // Só retorna o produto se ele tiver alguma locação com estoque ou se não tiver locações definidas
                // (para produtos antigos ou sem estoque). Pode ser ajustado se necessário.
                if (estoqueTotal > 0 || !product.locacoes || product.locacoes.length === 0) {
                    return {
                        ...product,
                        id: productId,
                        estoque: estoqueTotal,
                        valorMedio,
                        valorTotalEstoque,
                        local: locacoesComEstoque.join('<br>') || 'Sem locação com estoque'
                    };
                }
                return null; // Retorna nulo para produtos com locações mas sem estoque
            });

            // 4. Aguarda todas as buscas de estoque terminarem.
            let resolvedData = await Promise.all(productPromises);

            // 4.1 Filtra os produtos nulos (sem estoque)
            consolidatedData = resolvedData.filter(p => p !== null);

            // 5. Renderiza a tabela com os dados corretos.
            renderTable(consolidatedData);

        } catch (error) {
            console.error("Erro CRÍTICO ao buscar dados da consulta:", error);
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: red;">Falha ao carregar dados. Verifique o console.</td></tr>`;
        }
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            if (item.estoque <= 0) return;

            const row = document.createElement('tr');
            row.className = 'main-row';
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
