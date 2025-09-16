import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const kpiValorTotalEl = document.getElementById('kpi-valor-total');
    const kpiItensMinimoEl = document.getElementById('kpi-itens-minimo');
    const kpiReservasEl = document.getElementById('kpi-reservas');
    const kpiCustoObrasEl = document.getElementById('kpi-custo-obras');
    const tableUltimasMovimentacoesBody = document.getElementById('table-ultimas-movimentacoes');
    const tableAlertasEstoqueBody = document.getElementById('table-alertas-estoque');

    // --- Funções Utilitárias ---
    const formatCurrency = (value) => (typeof value === 'number' ? value : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // --- Lógica de Cálculo de KPIs ---
    const calcularValorTotalEstoque = (products) => products.reduce((total, p) => {
        const estoqueTotal = (p.locacoes || []).reduce((sum, loc) => sum + (loc.estoque || 0), 0);
        return total + (estoqueTotal * (p.valorMedio || 0));
    }, 0);

    const calcularItensAbaixoMinimo = (products) => {
        // TODO: Implementar quando o campo `estoqueMinimo` for adicionado aos produtos.
        return 0;
    };

    const calcularReservasPendentes = (movements) => movements.filter(mov => mov.tipo === 'reserva').length;

    const calcularCustoTotalObras = (movements) => movements.reduce((total, mov) => {
        if (mov.tipo === 'saida' && mov.obraId) {
            return total + ((mov.quantidade || 0) * (mov.valorMedioHistorico || 0));
        }
        return total;
    }, 0);

    // --- Lógica de Renderização ---
    function displayKpis(products, movements) {
        kpiValorTotalEl.textContent = formatCurrency(calcularValorTotalEstoque(products));
        kpiItensMinimoEl.textContent = calcularItensAbaixoMinimo(products);
        kpiReservasEl.textContent = calcularReservasPendentes(movements);
        kpiCustoObrasEl.textContent = formatCurrency(calcularCustoTotalObras(movements));
    }

    function renderValorPorGrupoChart(products, groups) {
        const valorPorGrupo = new Map();
        products.forEach(p => {
            if (!p.grupoId) return;
            const estoqueTotal = (p.locacoes || []).reduce((sum, loc) => sum + (loc.estoque || 0), 0);
            const valorProduto = estoqueTotal * (p.valorMedio || 0);
            const valorAtual = valorPorGrupo.get(p.grupoId) || 0;
            valorPorGrupo.set(p.grupoId, valorAtual + valorProduto);
        });

        const labels = Array.from(valorPorGrupo.keys()).map(id => groups[id]?.nome || 'Sem Grupo');
        const data = Array.from(valorPorGrupo.values());

        new Chart(document.getElementById('chart-valor-grupo'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valor por Grupo',
                    data: data,
                    backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    function renderTopObrasChart(movements, obras) {
        const custoPorObra = new Map();
        movements.forEach(mov => {
            if (mov.tipo === 'saida' && mov.obraId) {
                const custo = (mov.quantidade || 0) * (mov.valorMedioHistorico || 0);
                const custoAtual = custoPorObra.get(mov.obraId) || 0;
                custoPorObra.set(mov.obraId, custoAtual + custo);
            }
        });

        const sortedObras = Array.from(custoPorObra.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const labels = sortedObras.map(item => obras[item[0]]?.nome || 'Obra Desconhecida');
        const data = sortedObras.map(item => item[1]);

        new Chart(document.getElementById('chart-top-obras'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Custo Total',
                    data: data,
                    backgroundColor: '#e74a3b'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    function renderEntradasSaidasChart(movements) {
        const labels = [];
        const entradasData = [];
        const saidasData = [];
        const dateMap = new Map();

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
                    } else if (mov.tipo === 'saida') {
                        dayData.saidas += quantidade;
                    }
                }
            }
        });

        for (const value of dateMap.values()) {
            entradasData.push(value.entradas);
            saidasData.push(value.saidas);
        }

        new Chart(document.getElementById('chart-entradas-saidas'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Entradas',
                    data: entradasData,
                    borderColor: '#1cc88a',
                    backgroundColor: 'rgba(28, 200, 138, 0.1)',
                    fill: true,
                    tension: 0.3
                }, {
                    label: 'Saídas',
                    data: saidasData,
                    borderColor: '#e74a3b',
                    backgroundColor: 'rgba(231, 74, 59, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    async function renderUltimasMovimentacoes(productsMap) {
        const q = query(collection(db, 'movimentacoes'), orderBy('data', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        let html = '';
        snapshot.forEach(doc => {
            const mov = doc.data();
            const product = productsMap[mov.productId] || { descricao: 'Produto não encontrado' };
            const tipoClass = mov.tipo === 'entrada' ? 'status-entrada' : 'status-saida';
            html += `
                <tr>
                    <td><span class="status-badge ${tipoClass}">${mov.tipo}</span></td>
                    <td>${product.descricao}</td>
                    <td>${mov.quantidade}</td>
                    <td>${mov.data ? mov.data.toDate().toLocaleDateString('pt-BR') : 'N/A'}</td>
                </tr>
            `;
        });
        tableUltimasMovimentacoesBody.innerHTML = html;
    }

    function renderAlertasEstoque(products) {
        // TODO: Implementar a lógica real quando `estoqueMinimo` estiver disponível.
        let html = `
            <tr>
                <td colspan="4" style="text-align: center; color: #6c757d;">
                    Nenhum alerta de estoque. (Configure o 'estoque mínimo' nos produtos)
                </td>
            </tr>
        `;
        tableAlertasEstoqueBody.innerHTML = html;
    }

    function displayActionLists(products, productsMap) {
        renderUltimasMovimentacoes(productsMap);
        renderAlertasEstoque(products);
    }

    function displayCharts(products, movements, groups, obras) {
        renderValorPorGrupoChart(products, groups);
        renderTopObrasChart(movements, obras);
        renderEntradasSaidasChart(movements);
    }

    // --- Função Principal ---
    async function loadDashboard() {
        try {
            kpiValorTotalEl.textContent = 'Carregando...';
            // Busca de dados em paralelo
            const [productsSnap, movementsSnap, groupsSnap, obrasSnap] = await Promise.all([
                getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
                getDocs(collection(db, 'movimentacoes')),
                getDocs(collection(db, 'grupos')),
                getDocs(collection(db, 'obras'))
            ]);

            // Mapeamento dos dados
            const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const movements = movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const productsMap = Object.fromEntries(productsSnap.docs.map(doc => [doc.id, doc.data()]));
            const groups = Object.fromEntries(groupsSnap.docs.map(doc => [doc.id, doc.data()]));
            const obras = Object.fromEntries(obrasSnap.docs.map(doc => [doc.id, doc.data()]));

            // Renderização dos componentes
            displayKpis(products, movements);
            displayCharts(products, movements, groups, obras);
            displayActionLists(products, productsMap);

            feather.replace();

        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
            kpiValorTotalEl.textContent = 'Erro';
            kpiItensMinimoEl.textContent = 'Erro';
            kpiReservasEl.textContent = 'Erro';
            kpiCustoObrasEl.textContent = 'Erro';
        }
    }

    loadDashboard();
});
