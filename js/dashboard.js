import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit, Timestamp, collectionGroup } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Armazenamento de Dados e Estado ---
    let allProducts = [], allMovements = [], allGroups = {}, allObrasMap = {}, allObrasList = [], allProductsMap = {};
    let chartInstances = {}; // Armazena instâncias dos gráficos para destruí-los depois

    // --- Elementos do DOM ---
    const kpiValorTotalEl = document.getElementById('kpi-valor-total');
    const kpiItensMinimoEl = document.getElementById('kpi-itens-minimo');
    const kpiReservasEl = document.getElementById('kpi-reservas');
    const kpiCustoObrasEl = document.getElementById('kpi-custo-obras');
    const tableAlertasEstoqueBody = document.getElementById('table-alertas-estoque');
    const filtroObraGlobal = document.getElementById('filtro-obra-global');

    // --- Funções Utilitárias ---
    const formatCurrency = (value) => (typeof value === 'number' ? value : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const destroyChart = (chartId) => {
        if (chartInstances[chartId]) {
            chartInstances[chartId].destroy();
            delete chartInstances[chartId];
        }
    };

    // --- Lógica de Cálculo de KPIs ---
    const calcularValorTotalEstoque = (products) => {
        // A lógica de cálculo agora é apenas somar os valores já pré-calculados
        return products.reduce((total, p) => total + (p.valorTotalEstoque || 0), 0);
    };

    const calcularItensAbaixoMinimo = (products) => {
        return 0; // Lógica pendente
    };

    const calcularReservasPendentes = (movements, obraId) => {
        return movements.filter(mov => {
            const matchTipo = mov.tipo === 'reserva';
            const matchObra = obraId === 'todos' || mov.obraId === obraId;
            return matchTipo && matchObra;
        }).length;
    };

    const calcularCustoTotalObras = (movements, obraId) => {
        return movements.reduce((total, mov) => {
            if (mov.tipo === 'saida' && mov.obraId && (obraId === 'todos' || mov.obraId === obraId)) {
                return total + ((mov.quantidade || 0) * (mov.valorMedioHistorico || 0));
            }
            return total;
        }, 0);
    };

    // --- Lógica de Renderização ---
    function displayKpis(products, movements, obraId) {
        // KPIs globais não são afetados pelo filtro
        kpiValorTotalEl.textContent = formatCurrency(calcularValorTotalEstoque(products));
        kpiItensMinimoEl.textContent = calcularItensAbaixoMinimo(products);
        // KPIs filtrados
        kpiReservasEl.textContent = calcularReservasPendentes(movements, obraId);
        kpiCustoObrasEl.textContent = formatCurrency(calcularCustoTotalObras(movements, obraId));
    }

    function renderValorPorGrupoChart(products, movements, groups, obraId) {
        destroyChart('chart-valor-grupo');
        const valorPorGrupo = new Map();

        if (obraId === 'todos') {
            // Lógica original: valor total em estoque por grupo
            products.forEach(p => {
                if (!p.grupoId) return;
                const estoqueTotal = (p.locacoes || []).reduce((sum, loc) => sum + (loc.estoque || 0), 0);
                const valorProduto = estoqueTotal * (p.valorMedio || 0);
                const valorAtual = valorPorGrupo.get(p.grupoId) || 0;
                valorPorGrupo.set(p.grupoId, valorAtual + valorProduto);
            });
        } else {
            // Nova lógica: valor CONSUMIDO pela obra por grupo de produto
            movements.forEach(mov => {
                if (mov.tipo === 'saida' && mov.obraId === obraId) {
                    const product = products.find(p => p.id === mov.productId);
                    if (product && product.grupoId) {
                        const custo = (mov.quantidade || 0) * (mov.valorMedioHistorico || 0);
                        const valorAtual = valorPorGrupo.get(product.grupoId) || 0;
                        valorPorGrupo.set(product.grupoId, valorAtual + custo);
                    }
                }
            });
        }

        const labels = Array.from(valorPorGrupo.keys()).map(id => groups[id]?.nome || 'Sem Grupo');
        const data = Array.from(valorPorGrupo.values());

        chartInstances['chart-valor-grupo'] = new Chart(document.getElementById('chart-valor-grupo'), {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    function renderTopObrasChart(products, movements, obras, obraId) {
        destroyChart('chart-top-obras');
        const chartEl = document.getElementById('chart-top-obras');
        const titleEl = chartEl.closest('.card').querySelector('h3');
        let labels = [], data = [], chartTitle = '', chartLabel = '', backgroundColor = '';

        if (obraId === 'todos') {
            chartTitle = 'Top 5 Obras com Maior Custo';
            chartLabel = 'Custo Total';
            backgroundColor = '#e74a3b';
            const custoPorObra = new Map();
            movements.forEach(mov => {
                if (mov.tipo === 'saida' && mov.obraId) {
                    const custo = (mov.quantidade || 0) * (mov.valorMedioHistorico || 0);
                    custoPorObra.set(mov.obraId, (custoPorObra.get(mov.obraId) || 0) + custo);
                }
            });
            const sorted = Array.from(custoPorObra.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
            labels = sorted.map(item => obras[item[0]]?.nome || 'Desconhecida');
            data = sorted.map(item => item[1]);
        } else {
            chartTitle = 'Top 5 Produtos Consumidos na Obra';
            chartLabel = 'Valor Consumido';
            backgroundColor = '#4e73df';
            const custoPorProduto = new Map();
            movements.forEach(mov => {
                if (mov.tipo === 'saida' && mov.obraId === obraId) {
                    const custo = (mov.quantidade || 0) * (mov.valorMedioHistorico || 0);
                    custoPorProduto.set(mov.productId, (custoPorProduto.get(mov.productId) || 0) + custo);
                }
            });
            const sorted = Array.from(custoPorProduto.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
            labels = sorted.map(item => products.find(p => p.id === item[0])?.descricao || 'Desconhecido');
            data = sorted.map(item => item[1]);
        }

        titleEl.textContent = chartTitle;
        chartInstances['chart-top-obras'] = new Chart(chartEl, {
            type: 'bar',
            data: { labels, datasets: [{ label: chartLabel, data, backgroundColor }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    function renderEntradasSaidasChart(movements, obraId) {
        destroyChart('chart-entradas-saidas');
        const labels = [], dateMap = new Map();
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
            dateMap.set(key, { entradas: 0, saidas: 0 });
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        movements.forEach(mov => {
            if (mov.data && mov.data.toDate() >= thirtyDaysAgo) {
                const key = mov.data.toDate().toISOString().split('T')[0];
                if (dateMap.has(key)) {
                    const dayData = dateMap.get(key);
                    const quantidade = mov.quantidade || 0;
                    if (mov.tipo === 'entrada') {
                        dayData.entradas += quantidade;
                    } else if (mov.tipo === 'saida' && (obraId === 'todos' || mov.obraId === obraId)) {
                        dayData.saidas += quantidade;
                    }
                }
            }
        });

        const entradasData = Array.from(dateMap.values()).map(v => v.entradas);
        const saidasData = Array.from(dateMap.values()).map(v => v.saidas);

        chartInstances['chart-entradas-saidas'] = new Chart(document.getElementById('chart-entradas-saidas'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Entradas (Global)', data: entradasData, borderColor: '#1cc88a', backgroundColor: 'rgba(28, 200, 138, 0.1)', fill: true, tension: 0.3 },
                    { label: 'Saídas (Filtrado)', data: saidasData, borderColor: '#e74a3b', backgroundColor: 'rgba(231, 74, 59, 0.1)', fill: true, tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
        });
    }

    function renderActivityFeed(movements, productsMap, obrasMap, obraId) {
        const feedContainer = document.getElementById('feed-atividades-container');
        if (!feedContainer) return;

        // Filtra e ordena as movimentações localmente em vez de consultar o DB
        const filteredMovements = (obraId === 'todos')
            ? movements
            : movements.filter(mov => mov.obraId === obraId);

        // Ordena por data (mais recente primeiro) e pega os top 10
        const sortedMovements = filteredMovements.sort((a, b) => {
            const dateA = a.data ? a.data.toDate() : new Date(0);
            const dateB = b.data ? b.data.toDate() : new Date(0);
            return dateB - dateA;
        }).slice(0, 10);

        let html = '';
        if (sortedMovements.length === 0) {
            html = '<div class="feed-item-empty">Nenhuma atividade encontrada para esta seleção.</div>';
        } else {
            sortedMovements.forEach(mov => {
                const product = productsMap[mov.productId] || { descricao: 'Produto desconhecido' };
                const obra = obrasMap[mov.obraId] || { nome: 'Destino desconhecido' };
                const date = mov.data ? mov.data.toDate().toLocaleDateString('pt-BR') : '';

                let icon = '', message = '';

                switch (mov.tipo) {
                    case 'entrada':
                        icon = '📦';
                        message = `<strong>${product.descricao}</strong> teve entrada de <strong>${mov.quantidade}</strong> unidades.`;
                        break;
                    case 'saida':
                        icon = '🏗️';
                        message = `<strong>${obra.nome}</strong> requisitou <strong>${mov.quantidade}</strong> de <strong>${product.descricao}</strong>.`;
                        break;
                    case 'reserva':
                        icon = '📝';
                        message = `Reserva de <strong>${mov.quantidade}</strong> de <strong>${product.descricao}</strong> para <strong>${obra.nome}</strong>.`;
                        break;
                    case 'transferencia':
                        icon = '🔄';
                        message = `Transferência de <strong>${mov.quantidade}</strong> de <strong>${product.descricao}</strong>.`;
                        break;
                    case 'reserva_cancelada':
                        icon = '❌';
                        message = `Reserva de <strong>${product.descricao}</strong> para <strong>${obra.nome}</strong> foi cancelada.`;
                        break;
                    default:
                        icon = '🔹';
                        message = `Movimentação de ${product.descricao} (${mov.quantidade}).`;
                }

                html += `
                    <div class="feed-item">
                        <div class="feed-icon">${icon}</div>
                        <div class="feed-content">
                            <p class="feed-message">${message}</p>
                            <span class="feed-date">${date}</span>
                        </div>
                    </div>
                `;
            });
        }
        feedContainer.innerHTML = html;
    }

    function renderAlertasEstoque(products) {
        tableAlertasEstoqueBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #6c757d;">Nenhum alerta de estoque. (Configure o 'estoque mínimo')</td></tr>`;
    }

    // --- Funções de Orquestração ---
    function updateDashboard(obraId) {
        displayKpis(allProducts, allMovements, obraId);
        renderValorPorGrupoChart(allProducts, allMovements, allGroups, obraId);
        renderTopObrasChart(allProducts, allMovements, allObrasMap, obraId);
        renderEntradasSaidasChart(allMovements, obraId);
        renderActivityFeed(allMovements, allProductsMap, allObrasMap, obraId);
        renderAlertasEstoque(allProducts); // Não é afetado pelo filtro
        feather.replace();
    }

    async function loadDashboard() {
        // NOTE: This function fetches all products, movements, and locations to perform
        // calculations client-side. This ensures data accuracy but may be slow on
        // very large datasets. A future optimization could involve server-side aggregation.
        try {
            kpiValorTotalEl.textContent = 'Carregando...';
            const [productsSnap, movementsSnap, groupsSnap, obrasSnap] = await Promise.all([
                getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
                getDocs(collection(db, 'movimentacoes')),
                getDocs(collection(db, 'grupos')),
                getDocs(collection(db, 'obras'))
            ]);

            // 1. Processa movimentações para fácil acesso
            const movementsByProduct = {};
            movementsSnap.forEach(doc => {
                const mov = doc.data();
                if (!movementsByProduct[mov.productId]) {
                    movementsByProduct[mov.productId] = [];
                }
                movementsByProduct[mov.productId].push(mov);
            });

            // 2. Busca todas as locações de uma vez para evitar N+1 queries
            const locacoesGroupSnap = await getDocs(collectionGroup(db, 'locacoes'));
            const locacoesByProduct = {};
            locacoesGroupSnap.forEach(doc => {
                const locacaoData = doc.data();
                const productRef = doc.ref.parent.parent; // O path é .../produtos/{productId}/locacoes/{locacaoId}
                if (productRef) {
                    const productId = productRef.id;
                    if (!locacoesByProduct[productId]) {
                        locacoesByProduct[productId] = [];
                    }
                    locacoesByProduct[productId].push(locacaoData);
                }
            });

            // 3. Processa produtos, atribui locações e recalcula tudo
            const productPromises = productsSnap.docs.map(async (productDoc) => {
                const product = { id: productDoc.id, ...productDoc.data() };
                const productId = product.id;

                // Atribui as locações pré-buscadas
                product.locacoes = locacoesByProduct[productId] || [];

                // CORREÇÃO FINAL: A fonte de verdade do estoque está apenas nas locações.
                const estoqueAtual = product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0);

                // Recalcula o custo médio a partir do histórico de movimentações
                const productMovements = movementsByProduct[productId] || [];
                productMovements.sort((a, b) => (a.data?.toMillis() || 0) - (b.data?.toMillis() || 0));

                let totalQuantity = 0;
                let totalCost = 0;
                productMovements.forEach(mov => {
                    if (mov.tipo === 'entrada' && mov.custo_total_entrada) {
                        totalCost += mov.custo_total_entrada;
                        totalQuantity += mov.quantidade;
                    } else if (mov.tipo === 'saida' && mov.valorMedioHistorico) {
                        // CORREÇÃO: Usa o valorMedioHistorico da saída, que é o custo real no momento da saída.
                        const custoSaida = mov.quantidade * mov.valorMedioHistorico;
                        totalCost -= custoSaida;
                        totalQuantity -= mov.quantidade;
                    } else if (mov.tipo === 'saida') {
                        // Fallback para o cálculo antigo se o valorMedioHistorico não estiver presente
                        const currentAvgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
                        totalCost -= mov.quantidade * currentAvgCost;
                        totalQuantity -= mov.quantidade;
                    }
                });

                const valorMedio = totalQuantity > 0 ? totalCost / totalQuantity : 0;

                // Atribui os valores recalculados ao objeto do produto
                product.valorMedio = valorMedio;
                product.estoque = estoqueAtual; // Usado em outros cálculos
                product.valorTotalEstoque = estoqueAtual * valorMedio;

                return product;
            });

            allProducts = await Promise.all(productPromises);
            allMovements = movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Recria o allProductsMap com os dados atualizados e recalculados
            allProductsMap = Object.fromEntries(allProducts.map(p => [p.id, p]));
            allGroups = Object.fromEntries(groupsSnap.docs.map(doc => [doc.id, doc.data()]));
            allObrasMap = Object.fromEntries(obrasSnap.docs.map(doc => [doc.id, doc.data()]));
            allObrasList = obrasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            populateObrasFilter(allObrasList);
            filtroObraGlobal.addEventListener('change', (e) => updateDashboard(e.target.value));

            updateDashboard('todos'); // Carga inicial com "Todas as Obras"

        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
            kpiValorTotalEl.textContent = 'Erro';
            kpiItensMinimoEl.textContent = 'Erro';
            kpiReservasEl.textContent = 'Erro';
            kpiCustoObrasEl.textContent = 'Erro';
        }
    }

    function populateObrasFilter(obras) {
        obras.forEach(obra => {
            const option = document.createElement('option');
            option.value = obra.id;
            option.textContent = obra.nome;
            filtroObraGlobal.appendChild(option);
        });
    }

    loadDashboard();
});
