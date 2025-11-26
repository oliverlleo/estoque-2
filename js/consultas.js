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

    async function fetchDataAndCalculate() {
        // 1. Busca todas as fontes de dados necessárias em paralelo.
        const [productsSnapshot, locaisSnapshot, movementsSnapshot, conversoesSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais')),
        getDocs(query(collection(db, 'movimentacoes'))), // Busca todas as movimentações
            getDocs(collection(db, 'conversoes'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        const conversoesMap = {};
        conversoesSnapshot.forEach(doc => {
            conversoesMap[doc.id] = doc.data();
        });

        // 2. Processa todas as movimentações para calcular o custo médio e as reservas.
        const movementsByProduct = {};
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            if (!movementsByProduct[mov.productId]) {
                movementsByProduct[mov.productId] = [];
            }
            movementsByProduct[mov.productId].push(mov);
        });

        // 3. Mapeia os dados do produto e calcula os valores derivados.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();
            const productId = productDoc.id;
            const productMovements = movementsByProduct[productId] || [];

            // Ordena as movimentações por data para o cálculo correto do custo médio
            productMovements.sort((a, b) => a.data.toMillis() - b.data.toMillis());

            let totalQuantity = 0;
            let totalCost = 0;
            let averageCost = 0;
            let reservedQuantity = 0;

            productMovements.forEach(mov => {
                if (mov.tipo === 'entrada' && mov.custo_total_entrada) {
                    totalCost += mov.custo_total_entrada;
                    totalQuantity += mov.quantidade;
                } else if (mov.tipo === 'saida') {
                    const currentAvgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
                    totalCost -= mov.quantidade * currentAvgCost;
                    totalQuantity -= mov.quantidade;
                } else if (mov.tipo === 'reserva') {
                    reservedQuantity += mov.quantidade;
                }
            });

            averageCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

            const estoqueLocacoes = (product.locacoes && Array.isArray(product.locacoes))
                ? product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0)
                : 0;
            const estoqueGeral = product.estoque || 0;
            const estoqueAtual = estoqueGeral + estoqueLocacoes;

            let locacaoCompleta = 'N/A';
            if (product.locacoes && product.locacoes.length > 0) {
                locacaoCompleta = product.locacoes.map(loc => {
                    const localNome = locais[loc.localId]?.nome || 'Desconhecido';
                    return `${loc.locacao} (${localNome}) - <b>Estoque: ${loc.estoque || 0}</b>`;
                }).join('<br>');
            }
            if (estoqueGeral > 0) {
                const geralLabel = `Estoque Geral - <b>Estoque: ${estoqueGeral}</b>`;
                locacaoCompleta = locacaoCompleta === 'N/A' ? geralLabel : `${locacaoCompleta}<br>${geralLabel}`;
            }

            return {
                ...product,
                estoque: estoqueAtual,
                cor: product.cor || '-',
                quantidadeReservada: reservedQuantity,
                valorMedio: averageCost,
                valorTotalEstoque: estoqueAtual * averageCost,
                local: locacaoCompleta
            };
        });

        // 4. Renderiza a tabela e calcula o total geral.
        renderTable(consolidatedData);
        calculateAndDisplayGlobalTotal(consolidatedData);
    }

    function calculateAndDisplayGlobalTotal(data) {
        const totalValorEstoqueGeral = data.reduce((acc, item) => acc + (item.valorTotalEstoque || 0), 0);
        document.getElementById('total-valor-estoque-geral').textContent = totalValorEstoqueGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        let totalCustoFiltrado = 0;

        data.forEach(item => {
            totalCustoFiltrado += item.valorTotalEstoque || 0;
            const row = document.createElement('tr');
            row.className = 'main-row';
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td>${(item.estoque || 0).toString().replace('.', ',')}</td>
                <td>${(item.quantidadeReservada || 0).toString().replace('.', ',')}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(3).replace('.', ',')}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2).replace('.', ',')}</td>
                <td>${item.local}</td>
            `;
            tableBody.appendChild(row);
        });
        document.getElementById('total-custo-estoque').textContent = totalCustoFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

    async function recalculateAllProductsStock() {
        if (!confirm("Esta ação irá recalcular o estoque de TODOS os produtos com base no histórico de movimentações. Pode levar alguns minutos e não pode ser desfeito. Deseja continuar?")) {
            return;
        }

        console.log("Iniciando recálculo de estoque global...");
        alert("Iniciando recálculo. Este processo pode demorar. Você será notificado ao final.");

        try {
            // 1. Buscar todos os produtos e todas as movimentações
            const [productsSnapshot, movementsSnapshot] = await Promise.all([
                getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
                getDocs(collection(db, 'movimentacoes'))
            ]);

            const movementsByProduct = {};
            movementsSnapshot.forEach(doc => {
                const mov = doc.data();
                if (!movementsByProduct[mov.productId]) {
                    movementsByProduct[mov.productId] = [];
                }
                movementsByProduct[mov.productId].push(mov);
            });

            let updatedCount = 0;
            const totalProducts = productsSnapshot.docs.length;

            // 2. Iterar sobre cada produto para recalcular seu estoque
            for (const productDoc of productsSnapshot.docs) {
                const productId = productDoc.id;
                const productData = productDoc.data();
                const productMovements = movementsByProduct[productId] || [];

                let newGeneralStock = 0;
                // Cria um mapa para rastear o novo estoque de cada locação
                const newLocacoesStock = {};
                if (productData.locacoes && Array.isArray(productData.locacoes)) {
                    productData.locacoes.forEach(loc => {
                        newLocacoesStock[loc.locacao] = 0; // Inicializa o estoque de todas as locações com 0
                    });
                }

                // Calcula o novo estoque com base nas movimentações
                productMovements.forEach(mov => {
                    if (mov.tipo === 'entrada') {
                        if (mov.locacao) {
                            newLocacoesStock[mov.locacao] = (newLocacoesStock[mov.locacao] || 0) + mov.quantidade;
                        } else {
                            newGeneralStock += mov.quantidade;
                        }
                    } else if (mov.tipo === 'saida') {
                        if (mov.locacao) {
                            newLocacoesStock[mov.locacao] = (newLocacoesStock[mov.locacao] || 0) - mov.quantidade;
                        } else {
                            newGeneralStock -= mov.quantidade;
                        }
                    }
                });

                // 3. Atualizar o documento do produto com os novos valores de estoque
                const updatedLocacoes = productData.locacoes ? productData.locacoes.map(loc => ({
                    ...loc,
                    estoque: newLocacoesStock[loc.locacao] || 0
                })) : [];

                const productRef = doc(db, 'produtos', productId);
                await updateDoc(productRef, {
                    estoque: newGeneralStock,
                    locacoes: updatedLocacoes
                });

                updatedCount++;
                console.log(`(${updatedCount}/${totalProducts}) Produto ${productId} atualizado. Estoque Geral: ${newGeneralStock}`);
            }

            alert(`Recálculo concluído! ${updatedCount} produtos foram verificados e atualizados.`);
            console.log("Recálculo de estoque global finalizado.");

            // 4. Recarregar os dados na tela
            await fetchDataAndCalculate();

        } catch (error) {
            console.error("Erro catastrófico durante o recálculo de estoque:", error);
            alert(`Ocorreu um erro grave durante o recálculo. Verifique o console para mais detalhes. Erro: ${error.message}`);
        }
    }

    document.getElementById('btn-recalculate-stock').addEventListener('click', recalculateAllProductsStock);

    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
