import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const obraId = params.get('id');
    const btnExportExcel = document.getElementById('btn-export-excel');
    const filterCodigo = document.getElementById('filter-codigo-produto');
    const filterDescricao = document.getElementById('filter-descricao-produto');
    const viewToggle = document.getElementById('view-toggle');
    const labelItens = document.getElementById('toggle-label-itens');
    const labelReservas = document.getElementById('toggle-label-reservas');

    // New Financial Toggle Elements
    const financialToggle = document.getElementById('financial-view-toggle');
    const labelGrafico = document.getElementById('toggle-label-grafico');
    const labelDados = document.getElementById('toggle-label-dados');
    const chartsView = document.getElementById('financial-charts-view');
    const dataView = document.getElementById('financial-data-view');

    let currentItens = []; // Itens de Saída (Consumidos)
    let currentReservas = []; // Itens Reservados
    let activeDataset = []; // Dataset atualmente exibido
    let obraInfo = {};
    let charts = {}; // Para armazenar instâncias dos gráficos

    if (!obraId) {
        document.body.innerHTML = '<h1>ID da Obra não fornecido.</h1>';
        return;
    }

    function renderFinancialTable(orcadoMap, negociadoMap, realizadoMap, gruposMap) {
        const tableBody = document.getElementById('financial-details-body');
        const tableFooter = document.getElementById('financial-details-footer');

        if (!tableBody || !tableFooter) return;

        tableBody.innerHTML = '';
        tableFooter.innerHTML = '';

        // Obter todos os IDs de grupo únicos presentes em qualquer um dos mapas
        const allGroupIds = new Set([
            ...Object.keys(orcadoMap || {}),
            ...Object.keys(negociadoMap || {}),
            ...Object.keys(realizadoMap || {})
        ]);

        let totalOrcado = 0;
        let totalNegociado = 0;
        let totalRealizado = 0;

        // Converter para array para ordenar (opcional, por nome do grupo)
        const groupsArray = Array.from(allGroupIds).map(id => ({
            id,
            nome: gruposMap[id]?.nome || 'Sem Grupo/Outros'
        })).sort((a, b) => a.nome.localeCompare(b.nome));

        groupsArray.forEach(group => {
            // Se o nome do grupo for o ID (fallback) ou indefinido, usamos uma label genérica
            const groupName = group.nome;
            const groupId = group.id;

            // Para realizado, a chave no mapa 'realizadoMap' é o NOME do grupo (vindo de renderCharts/calculateFinancials que usa nomes).
            // Porém, os mapas orcadoMap e negociadoMap usam IDs.
            // Precisamos ajustar isso. calculateFinancials retorna porGrupo onde a chave é o NOME do grupo.
            // Isso cria uma inconsistência. O ideal seria calculateFinancials retornar por ID.
            // Mas para não quebrar os gráficos existentes, vamos tentar mapear pelo nome se possível, ou ajustar calculateFinancials.

            // Ajuste: Vamos assumir que realizadoMap usa NOME DO GRUPO como chave (veja calculateFinancials).
            // O orcadoMap e negociadoMap usam ID como chave (veja js/obras.js).

            // Então:
            const valOrcado = orcadoMap && orcadoMap[groupId] ? parseFloat(orcadoMap[groupId]) : 0;
            const valNegociado = negociadoMap && negociadoMap[groupId] ? parseFloat(negociadoMap[groupId]) : 0;

            // Para pegar o realizado, precisamos do NOME do grupo, pois calculateFinancials agrega por nome.
            const valRealizado = realizadoMap[groupName] || 0;

            totalOrcado += valOrcado;
            totalNegociado += valNegociado;
            totalRealizado += valRealizado;

            // Cálculos de porcentagem
            let percNegOrc = 0;
            if (valOrcado > 0) {
                percNegOrc = (valNegociado / valOrcado) * 100;
            }

            let percRealNeg = 0;
            if (valNegociado > 0) {
                percRealNeg = (valRealizado / valNegociado) * 100;
            }

            // Formatação
            const fmtBRL = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const fmtPerc = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

            const row = document.createElement('tr');
            row.className = 'bg-white border-b hover:bg-gray-50';
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-gray-900">${groupName}</td>
                <td class="px-6 py-4 text-right">${fmtBRL(valOrcado)}</td>
                <td class="px-6 py-4 text-center font-semibold ${percNegOrc > 100 ? 'text-red-600' : 'text-green-600'}">${fmtPerc(percNegOrc)}</td>
                <td class="px-6 py-4 text-right">${fmtBRL(valNegociado)}</td>
                <td class="px-6 py-4 text-center font-semibold ${percRealNeg > 100 ? 'text-red-600' : 'text-green-600'}">${fmtPerc(percRealNeg)}</td>
                <td class="px-6 py-4 text-right font-bold">${fmtBRL(valRealizado)}</td>
            `;
            tableBody.appendChild(row);
        });

        // Totais
        let totalPercNegOrc = 0;
        if (totalOrcado > 0) totalPercNegOrc = (totalNegociado / totalOrcado) * 100;

        let totalPercRealNeg = 0;
        if (totalNegociado > 0) totalPercRealNeg = (totalRealizado / totalNegociado) * 100;

        const fmtBRL = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const fmtPerc = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

        const footerRow = document.createElement('tr');
        footerRow.innerHTML = `
            <td class="px-6 py-4 font-bold">TOTAL</td>
            <td class="px-6 py-4 text-right font-bold">${fmtBRL(totalOrcado)}</td>
            <td class="px-6 py-4 text-center font-bold">${fmtPerc(totalPercNegOrc)}</td>
            <td class="px-6 py-4 text-right font-bold">${fmtBRL(totalNegociado)}</td>
            <td class="px-6 py-4 text-center font-bold">${fmtPerc(totalPercRealNeg)}</td>
            <td class="px-6 py-4 text-right font-bold text-blue-600">${fmtBRL(totalRealizado)}</td>
        `;
        tableFooter.appendChild(footerRow);
    }

    function renderCharts(custoPorGrupo, custoPorFornecedor) {
        // Destruir gráficos existentes para evitar sobreposição de tooltips e eventos
        if (charts.groupChart) charts.groupChart.destroy();
        if (charts.supplierChart) charts.supplierChart.destroy();

        const groupCtx = document.getElementById('groupChart')?.getContext('2d');
        if (groupCtx) {
            charts.groupChart = new Chart(groupCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(custoPorGrupo),
                    datasets: [{
                        label: 'Custo por Grupo',
                        data: Object.values(custoPorGrupo),
                        backgroundColor: [
                            'rgba(59, 130, 246, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(16, 185, 129, 0.7)',
                            'rgba(249, 115, 22, 0.7)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)',
                            'rgba(245, 158, 11, 0.7)', 'rgba(22, 163, 74, 0.7)', 'rgba(37, 99, 235, 0.7)'
                        ],
                        borderColor: [
                            '#FFFFFF'
                        ],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) { label += ': '; }
                                    if (context.parsed !== null) {
                                        label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }

        const supplierCtx = document.getElementById('supplierChart')?.getContext('2d');
        if (supplierCtx) {
            charts.supplierChart = new Chart(supplierCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(custoPorFornecedor),
                    datasets: [{
                        label: 'Custo por Fornecedor',
                        data: Object.values(custoPorFornecedor),
                        backgroundColor: 'rgba(59, 130, 246, 0.6)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1,
                        borderRadius: 8,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) { label += ': '; }
                                    if (context.parsed.x !== null) {
                                        label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.x);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { display: false } },
                        y: { grid: { display: false } }
                    }
                }
            });
        }
    }

    function calculateFinancials(items) {
        let total = 0;
        const porGrupo = {};
        const porFornecedor = {};

        items.forEach(item => {
            if (item.valorTotal) {
                total += item.valorTotal;
            }
            if (item.grupo && item.valorTotal > 0) {
                porGrupo[item.grupo] = (porGrupo[item.grupo] || 0) + item.valorTotal;
            }
            if (item.fornecedor && item.valorTotal > 0) {
                porFornecedor[item.fornecedor] = (porFornecedor[item.fornecedor] || 0) + item.valorTotal;
            }
        });

        return { total, porGrupo, porFornecedor };
    }

    async function carregarDetalhesDaObra() {
        try {
            const [obraSnap, movementsSnap, reservasSnap, productsSnap, fornecedoresSnap, gruposSnap, aplicacoesSnap] = await Promise.all([
                getDoc(doc(db, 'obras', obraId)),
                getDocs(query(collection(db, 'movimentacoes'), where('obraId', '==', obraId), where('tipo', '==', 'saida'))),
                getDocs(query(collection(db, 'movimentacoes'), where('obraId', '==', obraId), where('tipo', '==', 'reserva'))),
                getDocs(collection(db, 'produtos')),
                getDocs(collection(db, 'fornecedores')),
                getDocs(collection(db, 'grupos')),
                getDocs(collection(db, 'aplicacoes'))
            ]);

            const productsMap = {};
            productsSnap.forEach(prodDoc => { productsMap[prodDoc.id] = prodDoc.data(); });
            const fornecedoresMap = {};
            fornecedoresSnap.forEach(fornDoc => { fornecedoresMap[fornDoc.id] = fornDoc.data(); });
            const gruposMap = {};
            gruposSnap.forEach(grupoDoc => { gruposMap[grupoDoc.id] = grupoDoc.data(); });
            const aplicacoesMap = {};
            aplicacoesSnap.forEach(appDoc => { aplicacoesMap[appDoc.id] = appDoc.data(); });

            let custoTotalDaObra = 0;
            const itensUtilizados = [];
            const itensReservados = [];

            // Processar Saídas (Itens Utilizados)
            movementsSnap.forEach(movDoc => {
                const movimentacao = movDoc.data();
                const produto = productsMap[movimentacao.productId];
                if (produto) {
                    // Fallback para produto.valorMedio se o historico for 0 ou indefinido
                    const valorMedio = movimentacao.valorMedioHistorico || produto.valorMedio || 0;
                    const valorTotalItem = movimentacao.quantidade * valorMedio;
                    custoTotalDaObra += valorTotalItem;

                    const fornecedor = produto.fornecedorId ? (fornecedoresMap[produto.fornecedorId]?.nome || 'N/A') : 'N/A';
                    const grupo = produto.grupoId ? (gruposMap[produto.grupoId]?.nome || 'N/A') : 'N/A';
                    const aplicacoes = (produto.aplicacaoIds || []).map(id => aplicacoesMap[id]?.nome || '').filter(Boolean).join(', ') || 'N/A';

                    itensUtilizados.push({
                        codigo: produto.codigo,
                        descricao: produto.descricao,
                        un: produto.un,
                        cor: produto.cor || '-',
                        fornecedor,
                        grupo,
                        aplicacoes,
                        qtde: movimentacao.quantidade,
                        observacao: movimentacao.observacao || '-',
                        valorMedio: valorMedio,
                        valorTotal: valorTotalItem
                    });
                }
            });

            // Processar Reservas
            reservasSnap.forEach(movDoc => {
                const movimentacao = movDoc.data();
                const produto = productsMap[movimentacao.productId];
                if (produto) {
                    // Para reservas, usamos o valor médio atual do produto se não houver histórico,
                    // ou mantemos zero se preferir. O usuário pediu "os valores mais dos itens".
                    // Assumindo valorMedio do produto atual se não salvo na movimentação.
                    // Reservas geralmente não tem valorMedioHistorico salvo no momento da reserva (depende da implementação).
                    // Vou tentar usar valorMedioHistorico se existir, senão o do produto.
                    const valorMedio = movimentacao.valorMedioHistorico || produto.valorMedio || 0;
                    const valorTotalItem = movimentacao.quantidade * valorMedio;

                    const fornecedor = produto.fornecedorId ? (fornecedoresMap[produto.fornecedorId]?.nome || 'N/A') : 'N/A';
                    const grupo = produto.grupoId ? (gruposMap[produto.grupoId]?.nome || 'N/A') : 'N/A';
                    const aplicacoes = (produto.aplicacaoIds || []).map(id => aplicacoesMap[id]?.nome || '').filter(Boolean).join(', ') || 'N/A';

                    itensReservados.push({
                        codigo: produto.codigo,
                        descricao: produto.descricao,
                        un: produto.un,
                        cor: produto.cor || '-',
                        fornecedor,
                        grupo,
                        aplicacoes,
                        qtde: movimentacao.quantidade,
                        observacao: movimentacao.observacao || '-',
                        valorMedio: valorMedio,
                        valorTotal: valorTotalItem
                    });
                }
            });

            currentItens = itensUtilizados;
            currentReservas = itensReservados;

            const obraData = obraSnap.data();
            obraInfo = {
                codigo: obraData.codigo || 'S/C',
                nome: obraData.nome,
                orcado: obraData.orcado || {},
                negociado: obraData.negociado || {}
            };

            document.getElementById('obra-titulo').textContent = `${obraInfo.codigo} - ${obraInfo.nome}`;

            // Calculando total do orçamento para exibição no header (usando a soma dos grupos se for objeto, ou o valor legado se for string/numero)
            let totalOrcamentoExibicao = 0;
            if (typeof obraData.orcamento === 'object') {
                 // Caso legado onde talvez fosse salvo diferente? Não, o código antigo usava obraData.orcamento diretamente.
                 // Vamos verificar se existe o campo orcado (novo) e usar ele preferencialmente?
                 // O código antigo em detalhe-obra.js fazia: parseFloat(obraData.orcamento)
                 // O código em obras.js mostra que 'orcado' é um objeto. 'orcamento' devia ser um campo antigo de valor total.
                 // Vamos manter a lógica antiga para o header se existir, mas somar o 'orcado' se não.
                 if (obraData.orcamento && !isNaN(parseFloat(obraData.orcamento))) {
                     totalOrcamentoExibicao = parseFloat(obraData.orcamento);
                 } else if (obraData.orcado) {
                     totalOrcamentoExibicao = Object.values(obraData.orcado).reduce((a, b) => a + b, 0);
                 }
            } else if (obraData.orcamento) {
                 totalOrcamentoExibicao = parseFloat(obraData.orcamento);
            } else if (obraData.orcado) {
                 totalOrcamentoExibicao = Object.values(obraData.orcado).reduce((a, b) => a + b, 0);
            }

            const orcamentoElement = document.getElementById('obra-orcamento');
            if (orcamentoElement) {
                orcamentoElement.innerHTML = `Orçamento: <span class="font-semibold" style="color: red;">${totalOrcamentoExibicao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>`;
            }

            // Função para update da UI do Toggle Financeiro
            function updateFinancialToggleUI() {
                if (financialToggle.checked) {
                    // Modo DADOS
                    labelGrafico.style.fontWeight = 'normal';
                    labelGrafico.style.color = '#6c757d';
                    labelDados.style.fontWeight = 'bold';
                    labelDados.style.color = '#0d6efd';

                    chartsView.classList.add('hidden');
                    dataView.classList.remove('hidden');

                    // Precisamos calcular os financeiros novamente para garantir que temos os dados
                    const financials = calculateFinancials(activeDataset); // activeDataset depende do outro toggle (Itens/Reservas)

                    // Renderiza a tabela usando os dados da obra e os realizados calculados
                    renderFinancialTable(obraInfo.orcado, obraInfo.negociado, financials.porGrupo, gruposMap);

                } else {
                    // Modo GRÁFICO
                    labelGrafico.style.fontWeight = 'bold';
                    labelGrafico.style.color = '#0d6efd';
                    labelDados.style.fontWeight = 'normal';
                    labelDados.style.color = '#6c757d';

                    chartsView.classList.remove('hidden');
                    dataView.classList.add('hidden');

                    // Os gráficos são atualizados em updateToggleUI
                }
            }

            // Event Listeners para o Toggle Financeiro
            financialToggle.addEventListener('change', updateFinancialToggleUI);

            labelGrafico.addEventListener('click', () => {
                if (financialToggle.checked) {
                    financialToggle.checked = false;
                    updateFinancialToggleUI();
                }
            });

            labelDados.addEventListener('click', () => {
                if (!financialToggle.checked) {
                    financialToggle.checked = true;
                    updateFinancialToggleUI();
                }
            });

            // Sobrescrever updateToggleUI para chamar também a atualização da tabela se necessário
            const originalUpdateToggleUI = updateToggleUI;
            updateToggleUI = function() {
                if (viewToggle.checked) {
                    // Modo Reservas
                    labelItens.style.fontWeight = 'normal';
                    labelItens.style.color = '#6c757d';
                    labelReservas.style.fontWeight = 'bold';
                    labelReservas.style.color = '#0d6efd'; // Azul
                    activeDataset = currentReservas;
                } else {
                    // Modo Itens (Saída)
                    labelItens.style.fontWeight = 'bold';
                    labelItens.style.color = '#dc3545'; // Vermelho
                    labelReservas.style.fontWeight = 'normal';
                    labelReservas.style.color = '#6c757d';
                    activeDataset = currentItens;
                }

                const financials = calculateFinancials(activeDataset);

                // Update Total Cost
                const custoTotalElement = document.getElementById('obra-custo-total');
                if (custoTotalElement) {
                     custoTotalElement.innerHTML = `Custo Total: <span class="font-semibold text-blue-600">${financials.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>`;
                }

                // Update Charts
                renderCharts(financials.porGrupo, financials.porFornecedor);

                // Update Table if visible
                if (financialToggle.checked) {
                    renderFinancialTable(obraInfo.orcado, obraInfo.negociado, financials.porGrupo, gruposMap);
                }

                applyFilters(); // Re-renderiza com filtros atuais
            };


            // Define o dataset ativo inicial com base no estado do toggle e atualiza UI (incluindo dashboard)
            activeDataset = viewToggle.checked ? currentReservas : currentItens;
            updateToggleUI();

        } catch (error) {
            console.error("Erro ao carregar detalhes da obra:", error);
            document.body.innerHTML = `<h1>Erro ao carregar dados. Verifique o console.</h1><p>${error.message}</p>`;
        }
    }

    function renderTabelaItens(itens) {
        const tabelaBody = document.getElementById('detalhe-obra-table-body');
        if (!tabelaBody) {
            console.error('Elemento #detalhe-obra-table-body não encontrado.');
            return;
        }
        tabelaBody.innerHTML = '';
        itens.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'bg-white border-b hover:bg-gray-50';
            const valorMedioFmt = (item.valorMedio || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const valorTotalFmt = (item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">${item.codigo}</td>
                <td class="px-6 py-4">${item.descricao}</td>
                <td class="px-6 py-4">${item.un}</td>
                <td class="px-6 py-4">${item.cor}</td>
                <td class="px-6 py-4">${item.fornecedor}</td>
                <td class="px-6 py-4">${item.grupo}</td>
                <td class="px-6 py-4">${item.aplicacoes}</td>
                <td class="px-6 py-4 text-right">${item.qtde}</td>
                <td class="px-6 py-4">${item.observacao}</td>
                <td class="px-6 py-4 text-right">${valorMedioFmt}</td>
                <td class="px-6 py-4 font-bold text-blue-600 text-right">${valorTotalFmt}</td>
            `;
            tabelaBody.appendChild(row);
        });
    }

    function applyFilters() {
        const codigoFilter = filterCodigo.value.toLowerCase();
        const descricaoFilter = filterDescricao.value.toLowerCase();
        const filteredItens = activeDataset.filter(item => {
            const codigoMatch = item.codigo.toLowerCase().includes(codigoFilter);
            const descricaoMatch = item.descricao.toLowerCase().includes(descricaoFilter);
            return codigoMatch && descricaoMatch;
        });
        renderTabelaItens(filteredItens);
    }

    function updateToggleUI() {
        if (viewToggle.checked) {
            // Modo Reservas
            labelItens.style.fontWeight = 'normal';
            labelItens.style.color = '#6c757d';
            labelReservas.style.fontWeight = 'bold';
            labelReservas.style.color = '#0d6efd'; // Azul
            activeDataset = currentReservas;
        } else {
            // Modo Itens (Saída)
            labelItens.style.fontWeight = 'bold';
            labelItens.style.color = '#dc3545'; // Vermelho
            labelReservas.style.fontWeight = 'normal';
            labelReservas.style.color = '#6c757d';
            activeDataset = currentItens;
        }

        const financials = calculateFinancials(activeDataset);

        // Update Total Cost
        const custoTotalElement = document.getElementById('obra-custo-total');
        if (custoTotalElement) {
             custoTotalElement.innerHTML = `Custo Total: <span class="font-semibold text-blue-600">${financials.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>`;
        }

        // Update Charts
        renderCharts(financials.porGrupo, financials.porFornecedor);

        applyFilters(); // Re-renderiza com filtros atuais
    }

    viewToggle.addEventListener('change', updateToggleUI);

    // Make text labels clickable
    labelItens.addEventListener('click', () => {
        if (viewToggle.checked) {
            viewToggle.checked = false;
            updateToggleUI();
        }
    });

    labelReservas.addEventListener('click', () => {
        if (!viewToggle.checked) {
            viewToggle.checked = true;
            updateToggleUI();
        }
    });

    function exportToExcel() {
        if (activeDataset.length === 0) {
            alert("Não há itens para exportar.");
            return;
        }
        const dataForExport = activeDataset.map(item => ({
            'Código': item.codigo, 'Descrição': item.descricao, 'UN': item.un, 'Cor': item.cor,
            'Fornecedor': item.fornecedor, 'Grupo': item.grupo, 'Aplicações': item.aplicacoes,
            'Qtde': item.qtde, 'Observação': item.observacao, 'Valor Médio': item.valorMedio,
            'Valor Total': item.valorTotal
        }));
        const worksheet = XLSX.utils.json_to_sheet([]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.sheet_add_aoa(worksheet, [[`Código da Obra: ${obraInfo.codigo}`]], { origin: 'A1' });
        XLSX.utils.sheet_add_aoa(worksheet, [[`Nome da Obra: ${obraInfo.nome}`]], { origin: 'A2' });
        const tipoListagem = viewToggle.checked ? "Reservas" : "Itens Utilizados";
        XLSX.utils.sheet_add_aoa(worksheet, [[`Listagem: ${tipoListagem}`]], { origin: 'A3' });
        XLSX.utils.sheet_add_json(worksheet, dataForExport, { origin: 'A5', skipHeader: false });
        worksheet['!cols'] = [
            { wch: 15 }, { wch: 40 }, { wch: 8 }, { wch: 15 }, { wch: 25 },
            { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }
        ];
        XLSX.writeFile(workbook, `${tipoListagem}_Obra_${obraInfo.codigo}_${obraInfo.nome}.xlsx`);
    }

    filterCodigo.addEventListener('input', applyFilters);
    filterDescricao.addEventListener('input', applyFilters);
    btnExportExcel.addEventListener('click', exportToExcel);

    carregarDetalhesDaObra();
});
