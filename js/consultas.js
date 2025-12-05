import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    // --- Elementos UI Gerais ---
    const tableBody = document.querySelector('#table-consultas tbody');
    const tableHeadersRow = document.getElementById('table-headers');

    // Toggle Switch
    const toggleSwitch = document.getElementById('consultas-toggle');
    const labelProduto = document.getElementById('toggle-label-produto');
    const labelLocacao = document.getElementById('toggle-label-locacao');
    const filtersProduto = document.getElementById('filters-produto');
    const filtersLocacao = document.getElementById('filters-locacao');
    const footerLabelColspan = document.getElementById('footer-label-colspan');
    const footerGeneralLabelColspan = document.getElementById('footer-general-label-colspan');

    // Filtros Produto
    const filters = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        cor: document.getElementById('filter-cor'),
        local: document.getElementById('filter-local'),
        locacao: document.getElementById('filter-locacao'),
        comReserva: document.getElementById('filter-com-reserva')
    };

    // Filtros Locação
    const filterLocacaoInput = document.getElementById('filter-locacao-mode-input');
    const locacoesDatalist = document.getElementById('locacoes-datalist');

    // --- Estado da Aplicação ---
    let currentMode = 'produto'; // 'produto' ou 'locacao'
    let consolidatedData = []; // Dados processados dos produtos (usado no modo Produto)
    let globalMovementsByProduct = {}; // Armazena todas movimentações por produto (usado em ambos)
    let configData = {}; // Configurações globais
    let allLocationsList = new Set(); // Lista única de todas as locações encontradas nos produtos

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

    // --- Inicialização e Carregamento de Dados ---

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
        locaisSnapshot.forEach(doc => {
            configData.locais[doc.id] = doc.data();
            // Popula o filtro de locais
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().nome;
            filters.local.appendChild(option);
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

        allLocationsList.clear();

        // 3. Mapeia os dados do produto e calcula os valores derivados.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();
            const productId = productDoc.id;
            const productMovements = globalMovementsByProduct[productId] || [];

            // Ordena as movimentações por data
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

                // Coleta todas as locações para o Datalist
                product.locacoes.forEach(loc => {
                    if (loc.locacao) allLocationsList.add(loc.locacao);
                });

                if (product.locacoes.length > 0) {
                    locacaoCompleta = product.locacoes.map(loc => {
                        const localNome = configData.locais[loc.localId]?.nome || 'Desconhecido';
                        return `${loc.locacao} (${localNome}) - <b>Estoque: ${loc.estoque || 0}</b>`;
                    }).join('<br>');
                }
            }

            return {
                id: productId, // ID do Firestore
                ...product,
                estoque: estoqueAtual,
                cor: product.cor || '-',
                quantidadeReservada: reservedQuantity,
                valorMedio: averageCost,
                valorTotalEstoque: estoqueAtual * averageCost,
                localDisplay: locacaoCompleta
            };
        });

        // Popula o Datalist de Locações
        locacoesDatalist.innerHTML = '';
        Array.from(allLocationsList).sort().forEach(loc => {
            const option = document.createElement('option');
            option.value = loc;
            locacoesDatalist.appendChild(option);
        });

        // Renderiza a tabela inicial (Modo Produto)
        applyFilters();
        calculateAndDisplayGlobalTotal(consolidatedData);
    }

    // --- Lógica de Toggle (Alternar Modos) ---
    toggleSwitch.addEventListener('change', function() {
        if (this.checked) {
            // Modo Locação
            currentMode = 'locacao';
            labelProduto.style.color = '#6c757d';
            labelProduto.style.fontWeight = 'normal';
            labelLocacao.style.color = '#0d6efd';
            labelLocacao.style.fontWeight = 'bold';

            filtersProduto.style.display = 'none';
            filtersLocacao.style.display = 'grid';

            // Limpa tabela até selecionar locação
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">Selecione ou digite um endereço acima para visualizar os itens.</td></tr>';
            document.getElementById('total-custo-estoque').textContent = 'R$ 0,00';

            // Re-render Headers para Modo Locação
            renderHeadersForLocationMode();

        } else {
            // Modo Produto
            currentMode = 'produto';
            labelProduto.style.color = '#0d6efd';
            labelProduto.style.fontWeight = 'bold';
            labelLocacao.style.color = '#6c757d';
            labelLocacao.style.fontWeight = 'normal';

            filtersLocacao.style.display = 'none';
            filtersProduto.style.display = 'grid';

            // Re-render Headers para Modo Produto
            renderHeadersForProductMode();

            // Re-aplica filtros e renderiza dados de produto
            applyFilters();
        }
    });

    function renderHeadersForProductMode() {
        tableHeadersRow.innerHTML = `
            <th class="sortable" data-column="codigo">Código</th>
            <th class="sortable" data-column="descricao">Descrição</th>
            <th class="sortable" data-column="cor">Cor</th>
            <th class="sortable" data-column="estoque">Estoque Atual</th>
            <th class="sortable" data-column="reservado">Reservado</th>
            <th class="sortable" data-column="unidade">UN</th>
            <th class="sortable" data-column="custoMedio">Custo Un. Médio</th>
            <th class="sortable" data-column="custoTotal">Custo Total Estoque</th>
            <th class="sortable" data-column="locacao">Locação</th>
        `;
        setupSortListeners();
        footerLabelColspan.setAttribute('colspan', '7');
        footerGeneralLabelColspan.setAttribute('colspan', '7');
    }

    function renderHeadersForLocationMode() {
        tableHeadersRow.innerHTML = `
            <th class="sortable" data-column="codigo">Código</th>
            <th class="sortable" data-column="descricao">Descrição</th>
            <th class="sortable" data-column="cor">Cor</th>
            <th class="sortable" data-column="estoqueLocacao">Estoque Local</th>
            <th class="sortable" data-column="reservadoDetalhado">Reservado (Detalhado)</th>
            <th class="sortable" data-column="unidade">UN</th>
            <th class="sortable" data-column="custoMedio">Custo Un. Médio</th>
            <th class="sortable" data-column="custoTotalLocacao">Custo Total Local</th>
            <th class="sortable" data-column="locacaoConfirmacao">Locação</th>
        `;
        setupSortListeners();
        footerLabelColspan.setAttribute('colspan', '7');
        footerGeneralLabelColspan.setAttribute('colspan', '7');
    }

    function setupSortListeners() {
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.column;
                if (sortState.column === column) {
                    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortState.column = column;
                    sortState.direction = 'asc';
                }
                document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                th.classList.add(`sort-${sortState.direction}`);

                if (currentMode === 'produto') {
                    applyFilters();
                } else {
                    filterByLocation(filterLocacaoInput.value);
                }
            });
        });
    }

    // --- Lógica de Filtro Modo Locação ---
    filterLocacaoInput.addEventListener('input', (e) => {
        const locacao = e.target.value;
        if (locacao && locacao.length > 0) {
            filterByLocation(locacao);
        } else {
             tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">Selecione ou digite um endereço acima para visualizar os itens.</td></tr>';
             document.getElementById('total-custo-estoque').textContent = 'R$ 0,00';
        }
    });

    function filterByLocation(locacaoSearch) {
        if (!locacaoSearch) return;
        const searchNormal = locacaoSearch.toLowerCase().trim();

        // 1. Filtra produtos que tenham a locação exata ou parcial?
        // O requisito diz "Lista de Materiais... presentes naquele endereço específico".
        // Vamos buscar match exato primeiro, ou startsWith para ser mais útil (ex: '1-A' traz '1-A-01'?)
        // O prompt diz "Selecionar ou digitar o ID da Locação". "Tabela deve ser carregada listando todos os materiais presentes naquele endereço específico".
        // Vou assumir que deve ser um match mais estrito para ser uma "Consulta de Endereço".
        // Mas para usabilidade, 'includes' é melhor. Vamos usar 'includes' para flexibilidade.

        const locationData = [];

        consolidatedData.forEach(product => {
            if (!product.locacoes) return;

            // Encontra se o produto tem estoque na locação pesquisada
            // Pode haver multiplas entradas de locação para o mesmo produto? Sim (locais diferentes).
            // Mas aqui estamos filtrando POR LOCACAO (string de endereço).

            // Filtra as entradas de locação deste produto que batem com a pesquisa
            const matchingLocs = product.locacoes.filter(loc =>
                (loc.locacao || '').toLowerCase() === searchNormal ||
                (loc.locacao || '').toLowerCase().includes(searchNormal)
            );

            if (matchingLocs.length > 0) {
                // Calcula estoque TOTAL NESTA LOCAÇÃO (pode ter duplicidade se filtro for amplo, mas normalmente é 1 por produto/local)
                const estoqueNestaLocacao = matchingLocs.reduce((acc, l) => acc + (l.estoque || 0), 0);

                if (estoqueNestaLocacao > 0 || product.quantidadeReservada > 0) { // Mostra se tem estoque OU reserva?
                    // Requisito: "listando todos os materiais presentes naquele endereço" -> Implica estoque > 0.
                    // Mas e se tiver reserva mas estoque 0? Pode estar "presente" logisticamente. Vamos manter se estoque > 0.
                    if (estoqueNestaLocacao <= 0) return;

                    // Calcula Reservado Detalhado
                    const { totalReservado, detalheReserva } = calculateDetailedReservations(product, searchNormal);

                    locationData.push({
                        ...product,
                        estoqueLocacao: estoqueNestaLocacao,
                        custoTotalLocacao: estoqueNestaLocacao * product.valorMedio,
                        locacaoConfirmacao: matchingLocs.map(l => l.locacao).join(', '),
                        reservadoDetalhadoTotal: totalReservado,
                        reservadoDetalhadoDesc: detalheReserva
                    });
                }
            }
        });

        renderLocationTable(locationData);
    }

    function calculateDetailedReservations(product, locacaoFilter) {
        // "Fonte dos Dados: Histórico de movimentação... agregar as reservas por Obra para o material NAQUELA LOCAÇÃO."
        // Isso é difícil pois 'reserva' não necessariamente tem 'locacao' preenchida se for uma reserva geral.
        // Mas o sistema salva locação na reserva se especificado.
        // Se a reserva não tiver locação, ela conta para o produto como um todo.
        // Se a instrução diz "para o material naquela Locação", devo filtrar movs de reserva que tenham ESSA locação?
        // Memória: "When creating a reservation... system must explicitly save the locacao field".
        // Então podemos filtrar movs de reserva pela locacao também.

        const movements = globalMovementsByProduct[product.id] || [];
        const reservationsByObra = {};
        let totalReservado = 0;

        movements.forEach(mov => {
            if (mov.tipo === 'reserva') {
                // Verifica se a reserva é para esta locação (ou se locação é vazia/nula conta? Melhor ser estrito se o filtro é por endereço)
                // Se filtro for '1-A', e reserva for '1-A', conta.
                const movLoc = (mov.locacao || '').toLowerCase();
                if (movLoc.includes(locacaoFilter)) {
                    totalReservado += mov.quantidade;
                    const obraName = configData.obras[mov.obraId]?.nome || 'Sem Obra';
                    reservationsByObra[obraName] = (reservationsByObra[obraName] || 0) + mov.quantidade;
                }
            }
        });

        // Formata detalhe: "15 (Obra A: 10, Obra B: 5)"
        let descParts = [];
        for (const [obra, qtd] of Object.entries(reservationsByObra)) {
            descParts.push(`${obra}: ${qtd}`);
        }

        let detalheStr = totalReservado.toString();
        if (descParts.length > 0) {
            detalheStr += ` (${descParts.join(', ')})`;
        } else if (totalReservado > 0) {
            // Se tem reserva mas não achou obra (improvável)
             detalheStr += ` (Geral)`;
        }

        return { totalReservado, detalheReserva: detalheStr };
    }

    function renderLocationTable(data) {
        tableBody.innerHTML = '';
        let totalCustoLocacao = 0;

        // Apply sorting
        if (sortState.column) {
            data.sort((a, b) => {
                let valA = a[sortState.column];
                let valB = b[sortState.column];

                // Mapeia colunas especificas
                if (sortState.column === 'reservadoDetalhado') {
                    valA = a.reservadoDetalhadoTotal;
                    valB = b.reservadoDetalhadoTotal;
                }

                if (valA === null || valA === undefined) valA = '';
                if (valB === null || valB === undefined) valB = '';

                if (['estoqueLocacao', 'reservadoDetalhadoTotal', 'custoMedio', 'custoTotalLocacao'].includes(sortState.column) || typeof valA === 'number') {
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
            totalCustoLocacao += item.custoTotalLocacao || 0;
            const row = document.createElement('tr');
            row.className = 'main-row cursor-pointer hover:bg-gray-100';
            row.onclick = () => openHistoryModal(item);

            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td style="font-weight: bold;">${(item.estoqueLocacao || 0).toString().replace('.', ',')}</td>
                <td>${item.reservadoDetalhadoDesc || '0'}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(3).replace('.', ',')}</td>
                <td>${(item.custoTotalLocacao || 0).toFixed(2).replace('.', ',')}</td>
                <td>${item.locacaoConfirmacao}</td>
            `;
            tableBody.appendChild(row);
        });

        document.getElementById('total-custo-estoque').textContent = totalCustoLocacao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        feather.replace();
    }


    // --- Funções Comuns e Modo Produto (Originais) ---

    function calculateAndDisplayGlobalTotal(data) {
        const totalValorEstoqueGeral = data.reduce((acc, item) => acc + (item.valorTotalEstoque || 0), 0);
        document.getElementById('total-valor-estoque-geral').textContent = totalValorEstoqueGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function renderTable(data) {
        if (currentMode !== 'produto') return;

        tableBody.innerHTML = '';
        let totalCustoFiltrado = 0;

        // Apply sorting
        if (sortState.column) {
            data.sort((a, b) => {
                let valA = a[sortState.column];
                let valB = b[sortState.column];

                if (valA === null || valA === undefined) valA = '';
                if (valB === null || valB === undefined) valB = '';

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
            row.className = 'main-row cursor-pointer hover:bg-gray-100';
            row.onclick = () => openHistoryModal(item);

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

        const rawMovements = globalMovementsByProduct[productItem.id] || [];
        populateHistoryFilters(productItem, rawMovements);
        currentProductHistory = processMovementsForHistory(rawMovements, productItem);
        renderHistoryTable(currentProductHistory);
    }

    function populateHistoryFilters(productItem, movements) {
        historyFilterLocal.innerHTML = '<option value="">Todos</option>';
        if (productItem.locacoes) {
            const locaisIds = [...new Set(productItem.locacoes.map(l => l.localId))];
            locaisIds.forEach(id => {
                const nome = configData.locais[id]?.nome || 'Desconhecido';
                historyFilterLocal.innerHTML += `<option value="${id}">${nome}</option>`;
            });
        }

        historyFilterLocacao.innerHTML = '<option value="">Todas</option>';
        if (productItem.locacoes) {
            const locacoesNomes = [...new Set(productItem.locacoes.map(l => l.locacao))];
            locacoesNomes.forEach(loc => {
                if (loc) historyFilterLocacao.innerHTML += `<option value="${loc}">${loc}</option>`;
            });
        }

        historyFilterSubtipo.innerHTML = '';
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
        movements.sort((a, b) => a.data.toMillis() - b.data.toMillis());

        let totalQuantity = 0;
        let totalCost = 0;

        return movements.map(mov => {
            let custoUnitarioMedio = 0;
            let custoTotalMov = 0;

            if (mov.tipo === 'entrada' && mov.quantidade > 0) {
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
                custoUnitarioMedio = currentAvgCost;
                custoTotalMov = mov.quantidade * currentAvgCost;
                totalCost -= custoTotalMov;
                totalQuantity -= mov.quantidade;
            }

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
                localId: getLocalIdFromMovement(mov, productItem),
                locacao: mov.locacao
            };
        });
    }

    function getLocalIdFromMovement(mov, product) {
        if (!mov.locacao) return null;
        const locData = product.locacoes?.find(l => l.locacao === mov.locacao);
        return locData ? locData.localId : null;
    }

    function renderHistoryTable(historyData) {
        historyTableBody.innerHTML = '';
        const localFilter = historyFilterLocal.value;
        const locacaoFilter = historyFilterLocacao.value;
        const selectedTipos = Array.from(historyFilterTipo.selectedOptions).map(opt => opt.value);
        const selectedSubTipos = Array.from(historyFilterSubtipo.selectedOptions).map(opt => opt.value);

        const filteredHistory = historyData.filter(item => {
            if (localFilter && item.localId !== localFilter) return false;
            if (locacaoFilter && item.locacao !== locacaoFilter) return false;
            if (selectedTipos.length > 0 && !selectedTipos.includes(item.tipo)) return false;
            if (selectedSubTipos.length > 0 && !selectedSubTipos.includes(item.subTipo)) return false;
            return true;
        });

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

    historyFilterLocal.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterLocacao.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterTipo.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterSubtipo.addEventListener('change', () => renderHistoryTable(currentProductHistory));


    function applyFilters() {
        if (currentMode !== 'produto') return;

        const filterValues = {
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            cor: filters.cor.value.toLowerCase(),
            local: filters.local.value,
            locacao: filters.locacao.value.toLowerCase(),
            comReserva: filters.comReserva.checked
        };

        const filteredData = consolidatedData.filter(item => {
            const matchesCodigo = (item.codigo || '').toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = (item.descricao || '').toLowerCase().includes(filterValues.descricao);
            const matchesCor = (item.cor || '').toLowerCase().includes(filterValues.cor);

            if (filterValues.comReserva && (item.quantidadeReservada || 0) <= 0) {
                return false;
            }

            let matchesLocalLocacao = true;
            if (filterValues.local || filterValues.locacao) {
                if (!item.locacoes || item.locacoes.length === 0) {
                    matchesLocalLocacao = false;
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
