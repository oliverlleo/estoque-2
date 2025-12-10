import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Consultas carregada.");

    // --- Elementos de UI ---
    const tableBodyProduto = document.querySelector('#table-consultas tbody');

    // Filtros Produto
    const filtersProduto = {
        codigo: document.getElementById('filter-codigo'),
        descricao: document.getElementById('filter-descricao'),
        cor: document.getElementById('filter-cor'),
        local: document.getElementById('filter-local'),
        locacao: document.getElementById('filter-locacao'),
        comReserva: document.getElementById('filter-com-reserva'),
        mostrarDetalhes: document.getElementById('filter-mostrar-detalhes')
    };

    // Estado Global
    let consolidatedData = [];
    let globalMovementsByProduct = {};
    let configData = {};

    // --- Estado da Ordenação ---
    let sortState = {
        column: null,
        direction: 'asc'
    };

    // --- Elementos do Modal de Histórico ---
    const historyModal = document.getElementById('history-modal');
    const historyModalClose = document.getElementById('history-modal-close');
    const historyTableBody = document.querySelector('#table-history-modal tbody');
    const historyModalTitle = document.getElementById('history-modal-product-title');

    // Elementos da Imagem no Modal de Histórico
    const historyProductImage = document.getElementById('history-product-image');
    const historyProductImagePlaceholder = document.getElementById('history-product-image-placeholder');
    const imageContainer = historyProductImage.parentElement;

    // Elementos do Modal de Zoom
    const imageZoomModal = document.getElementById('image-zoom-modal');
    const imageZoomFull = document.getElementById('image-zoom-full');
    const imageZoomClose = document.getElementById('image-zoom-modal-close');

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
        if (event.target == imageZoomModal) {
            imageZoomModal.style.display = 'none';
        }
    };

    // Zoom da Imagem
    imageContainer.onclick = () => {
        if (historyProductImage.src && historyProductImage.style.display !== 'none') {
            imageZoomFull.src = historyProductImage.src;
            imageZoomModal.style.display = 'flex'; // Use flex to center
        }
    };
    imageZoomClose.onclick = () => {
        imageZoomModal.style.display = 'none';
    }



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
        await loadConfigData();

        const [productsSnapshot, locaisSnapshot, movementsSnapshot, conversoesSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais')),
            getDocs(query(collection(db, 'movimentacoes'))),
            getDocs(collection(db, 'conversoes'))
        ]);

        configData.locais = {};
        filtersProduto.local.innerHTML = '<option value="">Todos os Locais</option>';

        locaisSnapshot.forEach(doc => {
            configData.locais[doc.id] = doc.data();

            const optionProd = document.createElement('option');
            optionProd.value = doc.id;
            optionProd.textContent = doc.data().nome;
            filtersProduto.local.appendChild(optionProd);
        });

        globalMovementsByProduct = {};
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            if (!globalMovementsByProduct[mov.productId]) {
                globalMovementsByProduct[mov.productId] = [];
            }
            globalMovementsByProduct[mov.productId].push(mov);
        });

        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();
            const productId = productDoc.id;
            const productMovements = globalMovementsByProduct[productId] || [];

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
                id: productId,
                ...product,
                estoque: estoqueAtual,
                cor: product.cor || '-',
                quantidadeReservada: reservedQuantity,
                valorMedio: averageCost,
                valorTotalEstoque: estoqueAtual * averageCost,
                localDisplay: locacaoCompleta
            };
        });

        applyFilters();
        handleUrlParams();
    }

    function handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);

        // Product Code or ID search
        const search = urlParams.get('search') || urlParams.get('codigo');
        const id = urlParams.get('id');

        if (id) {
            // If ID is present (direct click), we rely on applyFilters to handle it via URL param reading
            // We do NOT set the code filter, to avoid conflicts.
        } else if (search) {
            filtersProduto.codigo.value = search;
        }

        const locacao = urlParams.get('locacao');
        if (locacao) {
            filtersProduto.locacao.value = locacao;
        }

        if (search || locacao || id) {
            applyFilters();
        }
    }

    // --- Event Listeners para Ordenação ---
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.column;
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }
            document.querySelectorAll('th.sortable').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            th.classList.add(`sort-${sortState.direction}`);
            applyFilters();
        });
    });

    function calculateReservedDetailed(productId) {
        // Find movements for this product that are RESERVATIONS
        const movements = globalMovementsByProduct[productId] || [];
        const reservations = movements.filter(m => m.tipo === 'reserva');

        if (reservations.length === 0) return null;

        const totalReserved = reservations.reduce((acc, m) => acc + m.quantidade, 0);

        // Group by Obra
        const byObra = {};
        reservations.forEach(m => {
            const obraName = configData.obras[m.obraId]?.nome || 'Obra Desconhecida';
            if (!byObra[obraName]) byObra[obraName] = 0;
            byObra[obraName] += m.quantidade;
        });

        const details = Object.entries(byObra).map(([name, qty]) => `${name}: ${qty}`).join(', ');
        return `${totalReserved} (${details})`;
    }

    function renderTableProduto(data) {
        tableBodyProduto.innerHTML = '';
        let totalCustoFiltrado = 0;
        const showDetailed = filtersProduto.mostrarDetalhes.checked;

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

            let reservedDisplay = (item.quantidadeReservada || 0).toString().replace('.', ',');
            if (showDetailed && item.quantidadeReservada > 0) {
                 reservedDisplay = calculateReservedDetailed(item.id) || reservedDisplay;
            }

            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td>${(item.estoque || 0).toString().replace('.', ',')}</td>
                <td>${reservedDisplay}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(3).replace('.', ',')}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2).replace('.', ',')}</td>
                <td>${item.localDisplay}</td>
            `;
            tableBodyProduto.appendChild(row);
        });
        document.getElementById('total-custo-estoque').textContent = totalCustoFiltrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('total-valor-estoque-geral').textContent = consolidatedData.reduce((acc, i) => acc + (i.valorTotalEstoque || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        feather.replace();
    }

    function applyFilters() {
        const urlParams = new URLSearchParams(window.location.search);
        const searchId = urlParams.get('id'); // Special param for direct ID lookup

        const filterValues = {
            codigo: filtersProduto.codigo.value.toLowerCase(),
            descricao: filtersProduto.descricao.value.toLowerCase(),
            cor: filtersProduto.cor.value.toLowerCase(),
            local: filtersProduto.local.value,
            locacao: filtersProduto.locacao.value.toLowerCase(),
            comReserva: filtersProduto.comReserva.checked
        };

        const filteredData = consolidatedData.filter(item => {
            // If filtering by ID (exact match from search click)
            if (searchId && item.id === searchId && !filterValues.codigo) {
                return true;
            }

            const matchesCodigo = (item.codigo || '').toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = (item.descricao || '').toLowerCase().includes(filterValues.descricao);
            const matchesCor = (item.cor || '').toLowerCase().includes(filterValues.cor);
            if (filterValues.comReserva && (item.quantidadeReservada || 0) <= 0) return false;

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
        renderTableProduto(filteredData);
    }

    // Attach listeners
    Object.values(filtersProduto).forEach(input => input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', applyFilters));


    // --- Funções do Modal de Histórico ---
    function openHistoryModal(productItem) {
        currentProductData = productItem;
        historyModalTitle.textContent = `${productItem.codigo} - ${productItem.descricao}`;

        // Atualiza a imagem
        if (productItem.imagem) {
            historyProductImage.src = productItem.imagem;
            historyProductImage.style.display = 'block';
            historyProductImagePlaceholder.style.display = 'none';
        } else {
            historyProductImage.src = '';
            historyProductImage.style.display = 'none';
            historyProductImagePlaceholder.style.display = 'block';
        }

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

    // Modal listeners
    historyFilterLocal.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterLocacao.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterTipo.addEventListener('change', () => renderHistoryTable(currentProductHistory));
    historyFilterSubtipo.addEventListener('change', () => renderHistoryTable(currentProductHistory));

    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBodyProduto.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
