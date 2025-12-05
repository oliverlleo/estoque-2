import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    const tableBody = document.querySelector('#table-consultas tbody');
    const tableLocacaoBody = document.querySelector('#table-consultas-locacao tbody'); // Body da tabela de locação

    // --- Switch e Containers de Modo ---
    const modeToggle = document.getElementById('consultas-toggle');
    const modeProdutoContainer = document.getElementById('mode-produto-container');
    const modeLocacaoContainer = document.getElementById('mode-locacao-container');
    const toggleLabelProduto = document.getElementById('toggle-label-produto');
    const toggleLabelLocacao = document.getElementById('toggle-label-locacao');

    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        cor: document.getElementById('filter-cor'),
        local: document.getElementById('filter-local'),
        locacao: document.getElementById('filter-locacao'),
        comReserva: document.getElementById('filter-com-reserva')
    };

    const locacaoFilters = {
        searchInput: document.getElementById('locacao-search-input'),
        filterLocal: document.getElementById('locacao-filter-local')
    };

    let consolidatedData = [];
    let globalMovementsByProduct = {}; // Armazena as movimentações por produto globalmente
    let configData = {}; // Armazena configurações globais (locais, tipos, etc)
    let isLocacaoMode = false;

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
        locacaoFilters.filterLocal.innerHTML = '<option value="">Todos</option>'; // Popula filtro do modo Locação

        locaisSnapshot.forEach(doc => {
            configData.locais[doc.id] = doc.data();
            // Popula o filtro de locais (Modo Produto)
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().nome;
            filters.local.appendChild(option);

            // Popula o filtro de locais (Modo Locação)
            const optionLoc = document.createElement('option');
            optionLoc.value = doc.id;
            optionLoc.textContent = doc.data().nome;
            locacaoFilters.filterLocal.appendChild(optionLoc);
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
        renderTable(consolidatedData);
        calculateAndDisplayGlobalTotal(consolidatedData);
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

    // --- MODO LOCAÇÃO ---

    function handleToggleChange() {
        isLocacaoMode = modeToggle.checked;

        if (isLocacaoMode) {
            modeProdutoContainer.style.display = 'none';
            modeLocacaoContainer.style.display = 'block';
            toggleLabelProduto.style.fontWeight = 'normal';
            toggleLabelProduto.style.color = '#6c757d';
            toggleLabelLocacao.style.fontWeight = 'bold';
            toggleLabelLocacao.style.color = '#0d6efd';
            // Renderiza tabela vazia ou filtra se já tiver input
            filterAndRenderLocacaoTable();
        } else {
            modeProdutoContainer.style.display = 'block';
            modeLocacaoContainer.style.display = 'none';
            toggleLabelProduto.style.fontWeight = 'bold';
            toggleLabelProduto.style.color = '#0d6efd';
            toggleLabelLocacao.style.fontWeight = 'normal';
            toggleLabelLocacao.style.color = '#6c757d';
        }
    }

    modeToggle.addEventListener('change', handleToggleChange);

    function filterAndRenderLocacaoTable() {
        const searchText = locacaoFilters.searchInput.value.toLowerCase().trim();
        const selectedLocalId = locacaoFilters.filterLocal.value;

        if (!searchText && !selectedLocalId) {
            tableLocacaoBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Utilize os filtros acima para buscar uma locação.</td></tr>';
            return;
        }

        const itemsInLocation = [];

        consolidatedData.forEach(product => {
            if (!product.locacoes || !Array.isArray(product.locacoes)) return;

            product.locacoes.forEach(loc => {
                // Filtro Local (Depósito)
                if (selectedLocalId && loc.localId !== selectedLocalId) return;

                // Filtro Texto Locação (Endereço)
                const locacaoStr = (loc.locacao || '').toLowerCase();
                if (searchText && !locacaoStr.includes(searchText)) return;

                // Item encontrado na locação
                // Calcular reservas detalhadas por Obra
                const reservasDetalhadas = calculateDetailedReserves(product, loc);

                itemsInLocation.push({
                    codigo: product.codigo,
                    descricao: product.descricao,
                    cor: product.cor,
                    estoqueLocacao: loc.estoque || 0,
                    un: product.un,
                    custoMedio: product.valorMedio,
                    custoTotalLocacao: (loc.estoque || 0) * product.valorMedio,
                    locacao: loc.locacao,
                    reservasDetalhadas: reservasDetalhadas,
                    productRef: product
                });
            });
        });

        renderLocacaoTable(itemsInLocation);
    }

    function calculateDetailedReserves(product, locData) {
        // Precisa olhar no histórico de reservas para ver quais reservas pendentes apontam para esta locação (se aplicável)
        // O sistema atual de reservas não salva "locação" na reserva pendente no histórico de forma direta sempre,
        // mas a instrução diz: "Fonte dos Dados: Essa informação deve ser obtida consultando o histórico de movimentação do produto... para agregar as reservas por Obra para o material naquela Locação."

        // Nota: Reservas ativas são 'reserva'. Quando confirmada vira 'saida'.
        // O problema é que a reserva pode não ter local específico se foi feita genericamente.
        // Mas assumindo que podemos filtrar reservas que tenham locação especificada ou inferir.
        // Na implementação atual, a 'reserva' tem 'locacao' salva no documento?
        // Ver memory: "When creating a reservation movement... system must explicitly save the locacao field".
        // Então sim, podemos filtrar por locacao.

        const movements = globalMovementsByProduct[product.id] || [];
        const activeReserves = movements.filter(m => m.tipo === 'reserva');

        const reservesByObra = {};
        let totalReserved = 0;

        activeReserves.forEach(res => {
            // Verifica se a reserva é desta locação
            // Se a reserva tem locacao vazia ou diferente, ignora?
            // "O valor na coluna 'Reservado (Detalhado)' deve ser a quantidade total reservada para o item na locação"

            // Se locData.locacao for vazia, procuramos reservas com locacao vazia? Sim.
            // Se locData.locacao tiver valor, procuramos match exato.

            const resLocacao = res.locacao || '';
            const targetLocacao = locData.locacao || '';

            // Também precisa bater o Local ID se disponível na reserva (idealmente)
            // Assumindo que a string locação é única ou suficiente no contexto do filtro.
            // Mas para ser preciso:
            // A reserva tem localId? Não explicitamente no modelo padrão antigo, mas pode ter sido adicionado.
            // O `getLocalIdFromMovement` tenta inferir.

            if (resLocacao === targetLocacao) {
                // Checa localId se possível
                // Se o produto tem a mesma locação em locais diferentes, isso é um problema de ambiguidade que o sistema já tem.
                // Mas aqui estamos iterando sobre `product.locacoes`, sabemos o `loc.localId`.
                // A reserva salva localId? Vamos assumir que sim ou que a locação string é única por contexto visual.
                // Para garantir, vamos usar a string de locação.

                const obraId = res.obraId;
                const obraNome = configData.obras[obraId]?.nome || 'Obra Desconhecida';
                const qtd = res.quantidade || 0;

                if (!reservesByObra[obraNome]) {
                    reservesByObra[obraNome] = 0;
                }
                reservesByObra[obraNome] += qtd;
                totalReserved += qtd;
            }
        });

        // Formata a string
        if (totalReserved === 0) return "0";

        const detalhes = Object.entries(reservesByObra)
            .map(([obra, qtd]) => `${obra}: ${qtd}`)
            .join(', ');

        return `${totalReserved} (${detalhes})`;
    }

    function renderLocacaoTable(items) {
        tableLocacaoBody.innerHTML = '';
        if (items.length === 0) {
            tableLocacaoBody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Nenhum item encontrado nesta locação.</td></tr>';
            return;
        }

        // Sort by locacao then product code
        items.sort((a, b) => {
            const locA = (a.locacao || '').toLowerCase();
            const locB = (b.locacao || '').toLowerCase();
            if (locA < locB) return -1;
            if (locA > locB) return 1;
            return a.codigo.localeCompare(b.codigo);
        });

        items.forEach(item => {
            const row = document.createElement('tr');
            // Reutiliza o modal de histórico ao clicar, passando a referência do produto
            row.className = 'cursor-pointer hover:bg-gray-100';
            row.onclick = () => openHistoryModal(item.productRef);

            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td>${Number(item.estoqueLocacao).toLocaleString('pt-BR')}</td>
                <td>${item.reservasDetalhadas}</td>
                <td>${item.un}</td>
                <td>${(item.custoMedio || 0).toFixed(3).replace('.', ',')}</td>
                <td>${(item.custoTotalLocacao || 0).toFixed(2).replace('.', ',')}</td>
                <td>${item.locacao}</td>
            `;
            tableLocacaoBody.appendChild(row);
        });
    }

    // Event listeners para filtros de locação
    locacaoFilters.searchInput.addEventListener('input', filterAndRenderLocacaoTable);
    locacaoFilters.filterLocal.addEventListener('change', filterAndRenderLocacaoTable);

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
