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
    let selectedGroupId = null; // Para filtrar por grupo ao clicar no grafico/tabela
    let gruposMap = {}; // Mapa de grupos (ID -> Objeto)
    let sortState = { column: 'descricao', direction: 'asc' }; // Default sorting

    if (!obraId) {
        document.body.innerHTML = '<h1>ID da Obra não fornecido.</h1>';
        return;
    }

    function renderFinancialTable(orcadoMap, negociadoMap, realizadoMap, vendidoMap) {
        const tableBody = document.getElementById('financial-details-body');
        const tableFooter = document.getElementById('financial-details-footer');

        if (!tableBody || !tableFooter) return;

        tableBody.innerHTML = '';
        tableFooter.innerHTML = '';

        // Obter todos os IDs de grupo únicos presentes em qualquer um dos mapas
        const allGroupIds = new Set([
            ...Object.keys(orcadoMap || {}),
            ...Object.keys(negociadoMap || {}),
            ...Object.keys(realizadoMap || {}),
            ...Object.keys(vendidoMap || {})
        ]);

        let totalOrcado = 0;
        let totalNegociado = 0;
        let totalRealizado = 0;
        let totalVendido = 0;

        // Consolidar dados para renderização
        const rowsToRender = [];
        const semGrupoTotals = {
            orcado: 0,
            negociado: 0,
            realizado: 0,
            vendido: 0,
            hasData: false
        };

        allGroupIds.forEach(groupId => {
            const valOrcado = orcadoMap && orcadoMap[groupId] ? parseFloat(orcadoMap[groupId]) : 0;
            const valNegociado = negociadoMap && negociadoMap[groupId] ? parseFloat(negociadoMap[groupId]) : 0;
            const valRealizado = realizadoMap[groupId] || 0;
            const valVendido = vendidoMap && vendidoMap[groupId] ? parseFloat(vendidoMap[groupId]) : 0;

            // Se todos os valores forem zero, ignora esta linha
            if (valOrcado === 0 && valNegociado === 0 && valRealizado === 0 && valVendido === 0) {
                return;
            }

            const groupName = gruposMap[groupId]?.nome;

            if (groupName) {
                // Grupo conhecido e válido
                rowsToRender.push({
                    id: groupId,
                    nome: groupName,
                    valOrcado,
                    valNegociado,
                    valRealizado,
                    valVendido
                });
            } else {
                // Grupo desconhecido ou 'sem_grupo' -> Consolidar
                semGrupoTotals.orcado += valOrcado;
                semGrupoTotals.negociado += valNegociado;
                semGrupoTotals.realizado += valRealizado;
                semGrupoTotals.vendido += valVendido;
                semGrupoTotals.hasData = true;
            }
        });

        // Adicionar linha consolidada de "Sem Grupo/Outros" se houver dados
        if (semGrupoTotals.hasData) {
            rowsToRender.push({
                id: 'sem_grupo_consolidado', // ID especial para seleção
                nome: 'Sem Grupo/Outros',
                valOrcado: semGrupoTotals.orcado,
                valNegociado: semGrupoTotals.negociado,
                valRealizado: semGrupoTotals.realizado,
                valVendido: semGrupoTotals.vendido
            });
        }

        // Ordenar alfabeticamente
        rowsToRender.sort((a, b) => a.nome.localeCompare(b.nome));

        // Formatação (SEM CIFRÃO)
        const fmtBRL = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtPerc = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

        // Renderizar linhas
        rowsToRender.forEach(rowInfo => {
            const groupId = rowInfo.id;

            totalOrcado += rowInfo.valOrcado;
            totalNegociado += rowInfo.valNegociado;
            totalRealizado += rowInfo.valRealizado;
            totalVendido += rowInfo.valVendido;

            // Cálculos de porcentagem
            let percNegOrc = 0;
            if (rowInfo.valOrcado > 0) {
                percNegOrc = (rowInfo.valNegociado / rowInfo.valOrcado) * 100;
            }

            let percRealNeg = 0;
            if (rowInfo.valNegociado > 0) {
                percRealNeg = (rowInfo.valRealizado / rowInfo.valNegociado) * 100;
            }

            let percRealVend = 0;
            if (rowInfo.valVendido > 0) {
                percRealVend = (rowInfo.valRealizado / rowInfo.valVendido) * 100;
            }

            const row = document.createElement('tr');
            row.className = `bg-white border-b hover:bg-gray-50 cursor-pointer transition-colors ${selectedGroupId === groupId ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`;
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-black">${rowInfo.nome}</td>
                <td class="px-6 py-4 text-right text-black">${fmtBRL(rowInfo.valOrcado)}</td>
                <td class="px-6 py-4 text-center font-semibold text-black ${percNegOrc > 100 ? 'text-red-600' : 'text-green-600'}">${fmtPerc(percNegOrc)}</td>
                <td class="px-6 py-4 text-right text-black">${fmtBRL(rowInfo.valNegociado)}</td>
                <td class="px-6 py-4 text-center font-semibold text-black ${percRealNeg > 100 ? 'text-red-600' : 'text-green-600'}">${fmtPerc(percRealNeg)}</td>
                <td class="px-6 py-4 text-right font-bold text-black">${fmtBRL(rowInfo.valRealizado)}</td>
                <td class="px-6 py-4 text-center font-semibold text-black ${percRealVend > 100 ? 'text-red-600' : 'text-green-600'}">${fmtPerc(percRealVend)}</td>
                <td class="px-6 py-4 text-right font-bold text-black">${fmtBRL(rowInfo.valVendido)}</td>
            `;

            row.addEventListener('click', () => {
                if (selectedGroupId === groupId) {
                    selectedGroupId = null; // Toggle off
                } else {
                    selectedGroupId = groupId; // Select
                }
                applyFilters();
                renderFinancialTable(orcadoMap, negociadoMap, realizadoMap, vendidoMap);
            });

            tableBody.appendChild(row);
        });

        // Totais
        let totalPercNegOrc = 0;
        if (totalOrcado > 0) totalPercNegOrc = (totalNegociado / totalOrcado) * 100;

        let totalPercRealNeg = 0;
        if (totalNegociado > 0) totalPercRealNeg = (totalRealizado / totalNegociado) * 100;

        let totalPercRealVend = 0;
        if (totalVendido > 0) totalPercRealVend = (totalRealizado / totalVendido) * 100;

        const footerRow = document.createElement('tr');
        footerRow.className = 'cursor-pointer hover:bg-gray-100 transition-colors'; // Add visual feedback
        footerRow.innerHTML = `
            <td class="px-6 py-4 font-bold text-black">TOTAL</td>
            <td class="px-6 py-4 text-right font-bold text-black">${fmtBRL(totalOrcado)}</td>
            <td class="px-6 py-4 text-center font-bold text-black">${fmtPerc(totalPercNegOrc)}</td>
            <td class="px-6 py-4 text-right font-bold text-black">${fmtBRL(totalNegociado)}</td>
            <td class="px-6 py-4 text-center font-bold text-black">${fmtPerc(totalPercRealNeg)}</td>
            <td class="px-6 py-4 text-right font-bold text-black" style="color: #0d6efd !important;">${fmtBRL(totalRealizado)}</td>
            <td class="px-6 py-4 text-center font-bold text-black">${fmtPerc(totalPercRealVend)}</td>
            <td class="px-6 py-4 text-right font-bold text-black">${fmtBRL(totalVendido)}</td>
        `;

        footerRow.addEventListener('click', () => {
            selectedGroupId = null; // Clear filter
            applyFilters();
            renderFinancialTable(orcadoMap, negociadoMap, realizadoMap, vendidoMap); // Re-render to clear selection highlights
        });

        tableFooter.appendChild(footerRow);
    }

    function renderCharts(custoPorGrupo, custoPorFornecedor) {
        // Destruir gráficos existentes
        if (charts.groupChart) charts.groupChart.destroy();
        if (charts.supplierChart) charts.supplierChart.destroy();

        // custoPorGrupo agora usa IDs como chaves. Precisamos de labels (nomes).
        const groupIds = Object.keys(custoPorGrupo);
        const groupLabels = groupIds.map(id => gruposMap[id]?.nome || 'Sem Grupo/Outros');
        const groupValues = Object.values(custoPorGrupo);

        const groupCtx = document.getElementById('groupChart')?.getContext('2d');
        if (groupCtx) {
            charts.groupChart = new Chart(groupCtx, {
                type: 'doughnut',
                data: {
                    labels: groupLabels,
                    datasets: [{
                        label: 'Custo por Grupo',
                        data: groupValues,
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
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const clickedGroupId = groupIds[index];

                            if (selectedGroupId === clickedGroupId) {
                                selectedGroupId = null; // Toggle off
                            } else {
                                selectedGroupId = clickedGroupId; // Select
                            }

                            applyFilters();
                            // Se a tabela estiver visivel, deve atualizar visualmente tambem (opcional, já que toggle chama updateToggleUI que chama applyFilters)
                            // Se quisermos que o gráfico de feedback visual de seleção, seria mais complexo com Chart.js padrão (precisaria mudar cores do dataset)
                            // Por enquanto, apenas filtra.

                            // Força update da tabela se estiver no modo tabela
                            if (financialToggle.checked) {
                                renderFinancialTable(obraInfo.orcado, obraInfo.negociado, custoPorGrupo);
                            }
                        } else {
                            // Clicked outside segments (background) -> Clear filter
                            selectedGroupId = null;
                            applyFilters();

                            if (financialToggle.checked) {
                                renderFinancialTable(obraInfo.orcado, obraInfo.negociado, custoPorGrupo);
                            }
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) { label += ': '; }

                                    if (context.parsed !== null) {
                                        const value = context.parsed;
                                        // Calculate total manually if needed, or access chart metadata
                                        let total = 0;
                                        if (context.dataset.data) {
                                            total = context.dataset.data.reduce((acc, curr) => acc + curr, 0);
                                        }

                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(2) + '%' : '0%';

                                        label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
                                        label += ` (${percentage})`;
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
            // Alterado para usar ID do grupo para agregação mais precisa
            const grupoKey = item.grupoId || 'sem_grupo';
            if (item.valorTotal > 0) {
                 porGrupo[grupoKey] = (porGrupo[grupoKey] || 0) + item.valorTotal;
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

            // Popula a variável global do escopo
            gruposMap = {};
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
                        grupoId: produto.grupoId, // Adicionado para filtragem robusta
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
                        grupoId: produto.grupoId, // Adicionado para filtragem robusta
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

            // Função para update da UI do Toggle Financeiro (precisa estar aqui para acessar activeDataset/obraInfo que são locais ao escopo DOMContentLoaded, mas fora desta função?)
            // activeDataset e obraInfo estão no escopo de DOMContentLoaded.
            // Então updateFinancialToggleUI pode ser definida lá fora?
            // Não, ela é chamada aqui.
            // Mas os listeners devem ser definidos apenas uma vez.
            // O problema anterior era redefinição de updateToggleUI.

            // Vamos definir a função de update do toggle financeiro
            const updateFinancialToggleUI = () => {
                if (financialToggle.checked) {
                    // Modo DADOS
                    labelGrafico.style.fontWeight = 'normal';
                    labelGrafico.style.color = '#6c757d';
                    labelDados.style.fontWeight = 'bold';
                    labelDados.style.color = '#0d6efd';

                    chartsView.classList.add('hidden');
                    dataView.classList.remove('hidden');

                    const financials = calculateFinancials(activeDataset);
                    renderFinancialTable(obraInfo.orcado, obraInfo.negociado, financials.porGrupo);

                } else {
                    // Modo GRÁFICO
                    labelGrafico.style.fontWeight = 'bold';
                    labelGrafico.style.color = '#0d6efd';
                    labelDados.style.fontWeight = 'normal';
                    labelDados.style.color = '#6c757d';

                    chartsView.classList.remove('hidden');
                    dataView.classList.add('hidden');
                }
            }

            // Remover listeners antigos? Não consigo remover facilmente anonimos/redifinidos.
            // Mas como carregarDetalhesDaObra é chamado apenas uma vez no load, está ok adicionar listeners aqui?
            // Sim, carregarDetalhesDaObra é chamado uma vez no final do script.

            // ATENÇÃO: Se carregarDetalhesDaObra falhar, listeners não são adicionados.
            // Mas se falhar, a tela mostra erro. Ok.

            // Limpar listeners anteriores para evitar duplicacao se chamado multiplas vezes (improvavel aqui, mas boa pratica)
            // Clonar e substituir elementos remove listeners
            const cloneAndReplace = (el) => {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                return newEl;
            };

            // Vamos apenas adicionar, assumindo execução única.
            financialToggle.onchange = updateFinancialToggleUI;
            labelGrafico.onclick = () => {
                 if (financialToggle.checked) {
                    financialToggle.checked = false;
                    updateFinancialToggleUI();
                }
            };
            labelDados.onclick = () => {
                if (!financialToggle.checked) {
                    financialToggle.checked = true;
                    updateFinancialToggleUI();
                }
            };

            // Chamada inicial para configurar UI baseada no estado inicial
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

        // Update header visual state
        const headers = document.querySelectorAll('#detalhe-obra-headers .sortable');
        headers.forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            if (header.dataset.column === sortState.column) {
                header.classList.add(sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        // Sort logic
        itens.sort((a, b) => {
            let valA = a[sortState.column] || '';
            let valB = b[sortState.column] || '';

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
            return 0;
        });

        tabelaBody.innerHTML = '';
        itens.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'bg-white border-b hover:bg-gray-50';
            const valorMedioFmt = (item.valorMedio || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const valorTotalFmt = (item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-black whitespace-nowrap">${item.codigo}</td>
                <td class="px-6 py-4 text-black">${item.descricao}</td>
                <td class="px-6 py-4 text-black">${item.un}</td>
                <td class="px-6 py-4 text-black">${item.cor}</td>
                <td class="px-6 py-4 text-black">${item.fornecedor}</td>
                <td class="px-6 py-4 text-black">${item.grupo}</td>
                <td class="px-6 py-4 text-black">${item.aplicacoes}</td>
                <td class="px-6 py-4 text-right text-black">${item.qtde}</td>
                <td class="px-6 py-4 text-black">${item.observacao}</td>
                <td class="px-6 py-4 text-right text-black">${valorMedioFmt}</td>
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

            let grupoMatch = true;
            if (selectedGroupId) {
                const itemGroupId = item.grupoId || 'sem_grupo';

                if (selectedGroupId === 'sem_grupo_consolidado') {
                    // Match se o grupo do item NAO existir no mapa de grupos conhecidos
                    // OU se for explicitamente 'sem_grupo'
                    const isKnownGroup = gruposMap[item.grupoId];
                    grupoMatch = !isKnownGroup;
                } else {
                    grupoMatch = itemGroupId === selectedGroupId;
                }
            }

            return codigoMatch && descricaoMatch && grupoMatch;
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

        // Update Table if visible
        if (financialToggle.checked) {
            renderFinancialTable(obraInfo.orcado, obraInfo.negociado, financials.porGrupo);
        }

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

    document.getElementById('detalhe-obra-headers').addEventListener('click', (e) => {
        if (e.target.classList.contains('sortable')) {
            const column = e.target.dataset.column;
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }
            applyFilters();
        }
    });

    carregarDetalhesDaObra();
});
