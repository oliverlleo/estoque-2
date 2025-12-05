import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    const tableBody = document.querySelector('#table-consultas tbody');
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        cor: document.getElementById('filter-cor'),
        local: document.getElementById('filter-local'),
        locacao: document.getElementById('filter-locacao'),
        comReserva: document.getElementById('filter-com-reserva')
    };

    // Toggle and New Mode Elements
    const toggleSwitch = document.getElementById('consultas-toggle');
    const filtersProduto = document.getElementById('filters-produto');
    const filtersLocacao = document.getElementById('filters-locacao');
    const toggleLabelProduto = document.getElementById('toggle-label-produto');
    const toggleLabelLocacao = document.getElementById('toggle-label-locacao');

    const locacaoFilterLocal = document.getElementById('locacao-filter-local');
    const locacaoFilterInput = document.getElementById('locacao-filter-input');
    const btnBuscarLocacao = document.getElementById('btn-buscar-locacao');
    const btnGerarEtiquetaLocacao = document.getElementById('btn-gerar-etiqueta-locacao');

    let consolidatedData = [];
    let globalMovementsByProduct = {}; // Armazena as movimentações por produto globalmente
    let configData = {}; // Armazena configurações globais (locais, tipos, etc)

    // --- Estado da Ordenação ---
    let sortState = {
        column: null,
        direction: 'asc' // or 'desc'
    };

    // --- Elementos do Modal de Histórico ---
    const historyModal = document.getElementById('history-modal');
    const historyModalClose = document.getElementById('history-modal-close');
    const historyTableBody = document.querySelector('#table-history-modal tbody');
    const historyModalTitle = document.getElementById('history-modal-product-title');

    // Filtros do Modal
    const historyFilterLocal = document.getElementById('history-filter-local');
    const historyFilterLocacao = document.getElementById('history-filter-locacao');
    const historyFilterTipo = document.getElementById('history-filter-tipo');
    const historyFilterSubtipo = document.getElementById('history-filter-subtipo');

    // Estado do Modal
    let currentProductHistory = [];
    let currentProductData = null;

    historyModalClose.onclick = () => { historyModal.style.display = 'none'; };
    window.onclick = (event) => {
        if (event.target == historyModal) {
            historyModal.style.display = 'none';
        }
    };

    async function loadConfigData() {
        const [tiposEntradaSnapshot, tiposSaidaSnapshot, obrasSnapshot] = await Promise.all([
            getDocs(collection(db, 'tipos_entrada')),
            getDocs(collection(db, 'tipos_saida')),
            getDocs(collection(db, 'obras'))
        ]);
        configData.tipos_entrada = {};
        tiposEntradaSnapshot.forEach(doc => configData.tipos_entrada[doc.id] = doc.data());

        configData.tipos_saida = {};
        tiposSaidaSnapshot.forEach(doc => configData.tipos_saida[doc.id] = doc.data());

        configData.obras = {};
        obrasSnapshot.forEach(doc => configData.obras[doc.id] = doc.data());
    }

    async function fetchDataAndCalculate() {
        await loadConfigData(); // Carrega configs primeiro

        // 1. Busca todas as fontes de dados necessárias em paralelo.
        const [productsSnapshot, locaisSnapshot, movementsSnapshot, conversoesSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais')),
            getDocs(query(collection(db, 'movimentacoes'))),
            getDocs(collection(db, 'conversoes'))
        ]);

        configData.locais = {};
        filters.local.innerHTML = '<option value="">Todos os Locais</option>';
        // Clear and repopulate Locacao mode select as well
        locacaoFilterLocal.innerHTML = '<option value="">Selecione o Local...</option>';

        locaisSnapshot.forEach(doc => {
            configData.locais[doc.id] = doc.data();
            // Popula o filtro de locais
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().nome;
            filters.local.appendChild(option);

            // Populate Locacao Mode Select
            const option2 = document.createElement('option');
            option2.value = doc.id;
            option2.textContent = doc.data().nome;
            locacaoFilterLocal.appendChild(option2);
        });

        const conversoesMap = {};
        conversoesSnapshot.forEach(doc => {
            conversoesMap[doc.id] = doc.data();
        });

        // 2. Processa todas as movimentações para calcular o custo médio e as reservas.
        globalMovementsByProduct = {};
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            if (!globalMovementsByProduct[mov.productId]) {
                globalMovementsByProduct[mov.productId] = [];
            }
            globalMovementsByProduct[mov.productId].push(mov);
        });

        // 3. Mapeia os dados do produto e calcula os valores derivados.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();
            const productId = productDoc.id;
            const productMovements = globalMovementsByProduct[productId] || [];

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

            let estoqueAtual = 0;
            let locacaoCompleta = 'N/A';
            if (product.locacoes && Array.isArray(product.locacoes)) {
                estoqueAtual = product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0);
                if (product.locacoes.length > 0) {
                    locacaoCompleta = product.locacoes.map(loc => {
                        const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                        return `${loc.locacao} (${localNome}) - <b>Estoque: ${loc.estoque || 0}</b>`;
                    }).join('<br>');
                }
            }

            return {
                id: productId, // Adiciona o ID para referência no click
                ...product,
                estoque: estoqueAtual,
                cor: product.cor || '-',
                quantidadeReservada: reservedQuantity,
                valorMedio: averageCost,
                valorTotalEstoque: estoqueAtual * averageCost,
                localDisplay: locacaoCompleta // Usado apenas para exibição na tabela principal
            };
        });

        // 4. Renderiza a tabela e calcula o total geral.
        // Check mode
        if (toggleSwitch && toggleSwitch.checked) {
             // Do nothing or render empty? Keep logic separate.
        } else {
             renderTable(consolidatedData);
             calculateAndDisplayGlobalTotal(consolidatedData);
        }
    }

    // --- Toggle Switch Logic ---
    if (toggleSwitch) {
        toggleSwitch.addEventListener('change', () => {
            if (toggleSwitch.checked) {
                // Locacao Mode
                if (filtersProduto) filtersProduto.style.display = 'none';
                if (filtersLocacao) filtersLocacao.style.display = 'grid';
                if (toggleLabelProduto) {
                    toggleLabelProduto.style.fontWeight = 'normal';
                    toggleLabelProduto.style.color = '#6c757d';
                }
                if (toggleLabelLocacao) {
                    toggleLabelLocacao.style.fontWeight = 'bold';
                    toggleLabelLocacao.style.color = '#0d6efd';
                }
                tableBody.innerHTML = ''; // Clear table
                document.getElementById('total-custo-estoque').textContent = 'R$ 0,00';
            } else {
                // Produto Mode
                if (filtersLocacao) filtersLocacao.style.display = 'none';
                if (filtersProduto) filtersProduto.style.display = 'grid';
                if (toggleLabelLocacao) {
                    toggleLabelLocacao.style.fontWeight = 'normal';
                    toggleLabelLocacao.style.color = '#6c757d';
                }
                if (toggleLabelProduto) {
                    toggleLabelProduto.style.fontWeight = 'bold';
                    toggleLabelProduto.style.color = '#0d6efd';
                }
                applyFilters();
            }
        });
    }

    // --- Locacao Mode Actions ---
    if (btnBuscarLocacao) {
        btnBuscarLocacao.addEventListener('click', () => {
            const localId = locacaoFilterLocal.value;
            const locacaoText = locacaoFilterInput.value.trim().toLowerCase();

            if (!localId && !locacaoText) {
                alert("Selecione um local ou digite uma locação.");
                return;
            }

            const results = consolidatedData.filter(product => {
                if (!product.locacoes) return false;
                return product.locacoes.some(loc => {
                    const matchLocal = !localId || loc.localId === localId;
                    const matchLocacao = !locacaoText || (loc.locacao || '').toLowerCase().includes(locacaoText);
                    return matchLocal && matchLocacao;
                });
            });

            renderLocacaoTable(results);
        });
    }

    if (btnGerarEtiquetaLocacao) {
        btnGerarEtiquetaLocacao.addEventListener('click', () => {
            const localId = locacaoFilterLocal.value;
            const locacaoText = locacaoFilterInput.value.trim();

            const labels = [];
            const seen = new Set();

            const results = consolidatedData.filter(product => {
                if (!product.locacoes) return false;
                return product.locacoes.some(loc => {
                    const matchLocal = !localId || loc.localId === localId;
                    const matchLocacao = !locacaoText || (loc.locacao || '').toLowerCase().includes(locacaoText.toLowerCase());
                    return matchLocal && matchLocacao;
                });
            });

            results.forEach(product => {
                product.locacoes.forEach(loc => {
                    const matchLocal = !localId || loc.localId === localId;
                    const matchLocacao = !locacaoText || (loc.locacao || '').toLowerCase().includes(locacaoText.toLowerCase());

                    if (matchLocal && matchLocacao) {
                        const key = `${loc.localId}-${loc.locacao}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            labels.push({
                                localId: loc.localId,
                                localName: configData.locais[loc.localId]?.nome || 'Desconhecido',
                                locacao: loc.locacao
                            });
                        }
                    }
                });
            });

            if (labels.length === 0) {
                alert("Nenhuma locação encontrada para gerar etiquetas.");
                return;
            }

            localStorage.setItem('etiquetasLocacaoParaImprimir', JSON.stringify(labels));
            window.open('etiquetas-locacao.html', '_blank');
        });
    }

    function renderLocacaoTable(data) {
        tableBody.innerHTML = '';
        let totalCustoFiltrado = 0;

        data.forEach(item => {
             const movements = globalMovementsByProduct[item.id] || [];
             const reservasPorObra = {};

             movements.forEach(mov => {
                 if (mov.tipo === 'reserva') {
                     const obraId = mov.obraId || 'sem_obra';
                     reservasPorObra[obraId] = (reservasPorObra[obraId] || 0) + mov.quantidade;
                 } else if (mov.tipo === 'reserva_cancelada') {
                     const obraId = mov.obraId || 'sem_obra';
                     reservasPorObra[obraId] = (reservasPorObra[obraId] || 0) - mov.quantidade;
                 }
             });

             let reservedString = '';
             const obrasComReserva = Object.entries(reservasPorObra).filter(([_, qty]) => qty > 0);
             if (obrasComReserva.length > 0) {
                 reservedString = obrasComReserva.map(([obraId, qty]) => {
                     const obraNome = configData.obras[obraId]?.nome || 'Obra Desconhecida';
                     return `<div style="font-size: 0.85em; white-space: nowrap;">${obraNome}: ${qty}</div>`;
                 }).join('');
             } else {
                 reservedString = '0';
             }

             totalCustoFiltrado += item.valorTotalEstoque || 0;

             const row = document.createElement('tr');
             row.className = 'main-row cursor-pointer hover:bg-gray-100';
             row.onclick = () => openHistoryModal(item);

             row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td>${(item.estoque || 0).toString().replace('.', ',')}</td>
                <td>${reservedString}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(3).replace('.', ',')}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2).replace('.', ',')}</td>
                <td>${item.localDisplay}</td>
            `;
            tableBody.appendChild(row);
        });

        document.getElementById('total-custo-estoque').textContent = totalCustoFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        feather.replace();
    }

    // --- Event Listeners para Ordenação ---
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.column;

            // Toggle direction if clicking same column, otherwise reset to asc
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }

            // Update UI
            document.querySelectorAll('th.sortable').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            th.classList.add(`sort-${sortState.direction}`);

            // Apply filters first (which calls renderTable, but we need to pass sorted data)
            // Easier way: call applyFilters which filters consolidatedData then calls renderTable.
            // But applyFilters doesn't know about sort.
            // We should sort INSIDE renderTable or sort consolidatedData/filteredData before rendering.

            // Let's re-apply filters which will trigger a render with the new sort state
            applyFilters();
        });
    });

    function calculateAndDisplayGlobalTotal(data) {
        const totalValorEstoqueGeral = data.reduce((acc, item) => acc + (item.valorTotalEstoque || 0), 0);
        document.getElementById('total-valor-estoque-geral').textContent = totalValorEstoqueGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        let totalCustoFiltrado = 0;

        // Apply sorting
        if (sortState.column) {
            data.sort((a, b) => {
                let valA = a[sortState.column];
                let valB = b[sortState.column];

                // Handle null/undefined
                if (valA === null || valA === undefined) valA = '';
                if (valB === null || valB === undefined) valB = '';

                // Specific column handling if needed (numbers vs strings)
                if (['estoque', 'reservado', 'custoMedio', 'custoTotal'].includes(sortState.column)) {
                    valA = Number(valA) || 0;
                    valB = Number(valB) || 0;
                } else {
                    valA = valA.toString().toLowerCase();
                    valB = valB.toString().toLowerCase();
                }

                if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        data.forEach(item => {
            totalCustoFiltrado += item.valorTotalEstoque || 0;
            const row = document.createElement('tr');
            row.className = 'main-row cursor-pointer hover:bg-gray-100'; // Add cursor pointer for UX
            row.onclick = () => openHistoryModal(item); // Attach click event

            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td>${(item.estoque || 0).toString().replace('.', ',')}</td>
                <td>${(item.quantidadeReservada || 0).toString().replace('.', ',')}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(3).replace('.', ',')}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2).replace('.', ',')}</td>
                <td>${item.localDisplay}</td>
            `;
            tableBody.appendChild(row);
        });
        document.getElementById('total-custo-estoque').textContent = totalCustoFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        feather.replace();
    }

    // --- Funções do Modal de Histórico ---

    function openHistoryModal(productItem) {
        currentProductData = productItem;
        historyModalTitle.textContent = `${productItem.codigo} - ${productItem.descricao}`;
        historyModal.style.display = 'block';

        // Carrega movimentos brutos
        const rawMovements = globalMovementsByProduct[productItem.id] || [];

        // Popula filtros iniciais com base nos dados disponíveis
        populateHistoryFilters(productItem, rawMovements);

        // Processa movimentos para exibição (calculando custos históricos)
        currentProductHistory = processMovementsForHistory(rawMovements, productItem);

        renderHistoryTable(currentProductHistory);
    }

    function populateHistoryFilters(productItem, movements) {
        // Filtro Local
        historyFilterLocal.innerHTML = '<option value="">Todos</option>';
        if (productItem.locacoes) {
            const locaisIds = [...new Set(productItem.locacoes.map(l => l.localId))];
            locaisIds.forEach(id => {
                const nome = configData.locais[id]?.nome || 'Desconhecido';
                historyFilterLocal.innerHTML += `<option value="${id}">${nome}</option>`;
            });
        }

        // Filtro Locação
        historyFilterLocacao.innerHTML = '<option value="">Todas</option>';
        if (productItem.locacoes) {
            const locacoesNomes = [...new Set(productItem.locacoes.map(l => l.locacao))];
            locacoesNomes.forEach(loc => {
                if (loc) historyFilterLocacao.innerHTML += `<option value="${loc}">${loc}</option>`;
            });
        }

        // Filtro Sub-Tipo (Dinâmico baseado nas configs e uso)
        historyFilterSubtipo.innerHTML = ''; // Limpa
        const subTipos = new Set();
        subTipos.add('Importação NF');
        Object.values(configData.tipos_entrada || {}).forEach(t => subTipos.add(t.nome));
        Object.values(configData.tipos_saida || {}).forEach(t => subTipos.add(t.nome));

        subTipos.forEach(st => {
            const option = document.createElement('option');
            option.value = st;
            option.textContent = st;
            historyFilterSubtipo.appendChild(option);
        });
    }

    function processMovementsForHistory(movements, productItem) {
        // Ordena por data
        movements.sort((a, b) => a.data.toMillis() - b.data.toMillis());

        let totalQuantity = 0;
        let totalCost = 0;

        return movements.map(mov => {
            let custoUnitarioMedio = 0;
            let custoTotalMov = 0;

            // Recalcula o custo médio histórico passo-a-passo
            if (mov.tipo === 'entrada' && mov.quantidade > 0) {
                 // Lógica simplificada de custo total de entrada se não tiver o campo explícito
                let valorTotalEntrada = mov.custo_total_entrada;
                if (valorTotalEntrada === undefined) {
                    valorTotalEntrada = (mov.quantidade_compra * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
                }

                totalCost += valorTotalEntrada;
                totalQuantity += mov.quantidade;

                custoUnitarioMedio = valorTotalEntrada / mov.quantidade;
                custoTotalMov = valorTotalEntrada;

            } else if (mov.tipo === 'saida') {
                const currentAvgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
                // Saída usa o custo médio atual
                custoUnitarioMedio = currentAvgCost;
                custoTotalMov = mov.quantidade * currentAvgCost;

                totalCost -= custoTotalMov;
                totalQuantity -= mov.quantidade;
            }

            // Resolve Sub-tipo e Obra
            let subTipo = '-';
            const isXmlImport = mov.observacao && mov.observacao.includes('Importado via XML');

            if (isXmlImport) {
                subTipo = 'Importação NF';
            } else if (mov.tipo === 'entrada' && mov.tipo_entradaId) {
                subTipo = configData.tipos_entrada?.[mov.tipo_entradaId]?.nome || 'N/A';
            } else if (mov.tipo === 'saida' && mov.tipo_saidaId) {
                subTipo = configData.tipos_saida?.[mov.tipo_saidaId]?.nome || 'N/A';
            }

            const obraNome = configData.obras?.[mov.obraId]?.nome || '-';

            return {
                raw: mov,
                data: mov.data ? new Date(mov.data.seconds * 1000).toLocaleString('pt-BR') : '',
                tipo: mov.tipo,
                subTipo: subTipo,
                codigo: productItem.codigo,
                descricao: productItem.descricao,
                un: productItem.un,
                qtde: mov.quantidade,
                nf: mov.nf || '-',
                custoMedioUnit: custoUnitarioMedio,
                custoTotal: custoTotalMov,
                requisitante: mov.requisitante || '-',
                obra: obraNome,
                obs: mov.observacao || '-',
                localId: getLocalIdFromMovement(mov, productItem), // Helper para tentar identificar o local
                locacao: mov.locacao // A movimentação tem o campo locacao salvo
            };
        });
    }

    // Tenta inferir o Local ID baseada na locação da movimentação e no cadastro do produto
    function getLocalIdFromMovement(mov, product) {
        if (!mov.locacao) return null;
        // Procura no cadastro do produto uma locação com esse nome
        const locData = product.locacoes?.find(l => l.locacao === mov.locacao);
        return locData ? locData.localId : null;
    }

    function renderHistoryTable(historyData) {
        historyTableBody.innerHTML = '';

        // Filtros
        const localFilter = historyFilterLocal.value;
        const locacaoFilter = historyFilterLocacao.value;

        const selectedTipos = Array.from(historyFilterTipo.selectedOptions).map(opt => opt.value);
        const selectedSubTipos = Array.from(historyFilterSubtipo.selectedOptions).map(opt => opt.value);

        const filteredHistory = historyData.filter(item => {
            // Filtro de Local (Complexo pois a mov nem sempre tem localId explicito, mas tentamos inferir)
            if (localFilter && item.localId !== localFilter) return false;

            if (locacaoFilter && item.locacao !== locacaoFilter) return false;

            if (selectedTipos.length > 0 && !selectedTipos.includes(item.tipo)) return false;

            if (selectedSubTipos.length > 0 && !selectedSubTipos.includes(item.subTipo)) return false;

            return true;
        });

        // Inverte ordem para mostrar mais recente primeiro na tabela
        const displayData = [...filteredHistory].reverse();

        displayData.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.data}</td>
                <td class="${item.tipo}">${item.tipo.toUpperCase()}</td>
                <td>${item.subTipo}</td>
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.un}</td>
                <td>${Number(item.qtde).toLocaleString('pt-BR')}</td>
                <td>${item.nf}</td>
                <td>${item.custoMedioUnit.toFixed(3).replace('.', ',')}</td>
                <td>${item.custoTotal.toFixed(2).replace('.', ',')}</td>
                <td>${item.requisitante}</td>
                <td>${item.obra}</td>
                <td>${item.obs}</td>
            `;
            historyTableBody.appendChild(row);
        });
    }

    // Event Listeners para os filtros do modal
    historyFilterLocal.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterLocacao.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterTipo.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterSubtipo.addEventListener('change', () => renderHistoryTable(currentProductHistory));


    function applyFilters() {
        const filterValues = {
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            cor: filters.cor.value.toLowerCase(),
            local: filters.local.value, // Select uses exact value (ID)
            locacao: filters.locacao.value.toLowerCase(),
            comReserva: filters.comReserva.checked
        };

        const filteredData = consolidatedData.filter(item => {
            const matchesCodigo = (item.codigo || '').toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = (item.descricao || '').toLowerCase().includes(filterValues.descricao);
            const matchesCor = (item.cor || '').toLowerCase().includes(filterValues.cor);

            // Filtro de Reserva
            if (filterValues.comReserva && (item.quantidadeReservada || 0) <= 0) {
                return false;
            }

            // Filtro de Local e Locação (verifica se alguma das locações do produto atende)
            // Se não houver filtro de local nem locação, passa direto nesta checagem
            let matchesLocalLocacao = true;

            if (filterValues.local || filterValues.locacao) {
                if (!item.locacoes || item.locacoes.length === 0) {
                    matchesLocalLocacao = false; // Se filtrar por local/locação e produto não tiver, falha
                } else {
                    matchesLocalLocacao = item.locacoes.some(loc => {
                        const localMatch = !filterValues.local || loc.localId === filterValues.local;
                        const locacaoMatch = !filterValues.locacao || (loc.locacao || '').toLowerCase().includes(filterValues.locacao);
                        return localMatch && locacaoMatch;
                    });
                }
            }

            return matchesCodigo && matchesDescricao && matchesCor && matchesLocalLocacao;
        });

        renderTable(filteredData);
    }

    Object.values(filters).forEach(input => input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', applyFilters));

    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
