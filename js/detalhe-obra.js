import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const obraId = params.get('id');
    const btnExportExcel = document.getElementById('btn-export-excel');
    const filterCodigo = document.getElementById('filter-codigo-produto');
    const filterDescricao = document.getElementById('filter-descricao-produto');

    let currentItens = [];
    let obraInfo = {};
    let charts = {}; // Para armazenar instâncias dos gráficos

    if (!obraId) {
        document.body.innerHTML = '<h1>ID da Obra não fornecido.</h1>';
        return;
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

    async function carregarDetalhesDaObra() {
        try {
            const [obraSnap, movementsSnap, productsSnap, fornecedoresSnap, gruposSnap, aplicacoesSnap] = await Promise.all([
                getDoc(doc(db, 'obras', obraId)),
                getDocs(query(collection(db, 'movimentacoes'), where('obraId', '==', obraId), where('tipo', '==', 'saida'))),
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

            movementsSnap.forEach(movDoc => {
                const movimentacao = movDoc.data();
                const produto = productsMap[movimentacao.productId];
                if (produto) {
                    const valorMedio = movimentacao.valorMedioHistorico || 0;
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

            currentItens = itensUtilizados;
            const obraData = obraSnap.data();
            obraInfo = {
                codigo: obraData.codigo || 'S/C',
                nome: obraData.nome
            };

            const custoPorGrupo = {};
            const custoPorFornecedor = {};
            itensUtilizados.forEach(item => {
                if (item.grupo && item.valorTotal > 0) {
                    custoPorGrupo[item.grupo] = (custoPorGrupo[item.grupo] || 0) + item.valorTotal;
                }
                if (item.fornecedor && item.valorTotal > 0) {
                    custoPorFornecedor[item.fornecedor] = (custoPorFornecedor[item.fornecedor] || 0) + item.valorTotal;
                }
            });

            document.getElementById('obra-titulo').textContent = `${obraInfo.codigo} - ${obraInfo.nome}`;
            const custoTotalElement = document.getElementById('obra-custo-total');
            if (custoTotalElement) {
                custoTotalElement.innerHTML = `Custo Total: <span class="font-semibold text-blue-600">${custoTotalDaObra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>`;
            }

            renderTabelaItens(itensUtilizados);
            renderCharts(custoPorGrupo, custoPorFornecedor);

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
        const filteredItens = currentItens.filter(item => {
            const codigoMatch = item.codigo.toLowerCase().includes(codigoFilter);
            const descricaoMatch = item.descricao.toLowerCase().includes(descricaoFilter);
            return codigoMatch && descricaoMatch;
        });
        renderTabelaItens(filteredItens);
    }

    function exportToExcel() {
        if (currentItens.length === 0) {
            alert("Não há itens para exportar.");
            return;
        }
        const dataForExport = currentItens.map(item => ({
            'Código': item.codigo, 'Descrição': item.descricao, 'UN': item.un, 'Cor': item.cor,
            'Fornecedor': item.fornecedor, 'Grupo': item.grupo, 'Aplicações': item.aplicacoes,
            'Qtde': item.qtde, 'Observação': item.observacao, 'Valor Médio': item.valorMedio,
            'Valor Total': item.valorTotal
        }));
        const worksheet = XLSX.utils.json_to_sheet([]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.sheet_add_aoa(worksheet, [[`Código da Obra: ${obraInfo.codigo}`]], { origin: 'A1' });
        XLSX.utils.sheet_add_aoa(worksheet, [[`Nome da Obra: ${obraInfo.nome}`]], { origin: 'A2' });
        XLSX.utils.sheet_add_json(worksheet, dataForExport, { origin: 'A4', skipHeader: false });
        worksheet['!cols'] = [
            { wch: 15 }, { wch: 40 }, { wch: 8 }, { wch: 15 }, { wch: 25 },
            { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }
        ];
        XLSX.writeFile(workbook, `Itens_Obra_${obraInfo.codigo}_${obraInfo.nome}.xlsx`);
    }

    filterCodigo.addEventListener('input', applyFilters);
    filterDescricao.addEventListener('input', applyFilters);
    btnExportExcel.addEventListener('click', exportToExcel);

    carregarDetalhesDaObra();
});
