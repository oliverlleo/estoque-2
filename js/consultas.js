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
    let sortColumn = 'estoque';
    let sortDirection = 'desc';
    let currentPage = 1;
    const rowsPerPage = 15;
    let filteredAndSortedData = [];

    const paginationControls = document.getElementById('pagination-controls');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    async function fetchDataAndCalculate() {
        // 1. Busca todas as fontes de dados necessárias em paralelo.
        const [productsSnapshot, locaisSnapshot, movementsSnapshot, fornecedoresSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais')),
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "==", "reserva"))),
            getDocs(collection(db, 'fornecedores'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        const fornecedores = {};
        fornecedoresSnapshot.forEach(doc => {
            fornecedores[doc.id] = doc.data();
        });

        // 2. Calcula a quantidade total reservada para cada produto.
        const reservasMap = {};
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            reservasMap[mov.productId] = (reservasMap[mov.productId] || 0) + mov.quantidade;
        });

        // 3. Mapeia os dados do produto e calcula os valores derivados.
        consolidatedData = productsSnapshot.docs.map(productDoc => {
            const product = productDoc.data();
            const productId = productDoc.id;

            let estoqueAtual = 0;
            let locacaoCompleta = 'N/A';

            if (product.locacoes && Array.isArray(product.locacoes)) {
                estoqueAtual = product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0);
                if (product.locacoes.length > 0) {
                    locacaoCompleta = product.locacoes.map(loc => {
                        const localNome = locais[loc.localId]?.nome || 'Desconhecido';
                        return `${loc.locacao} (${localNome}) - <b>Estoque: ${loc.estoque || 0}</b>`;
                    }).join('<br>');
                }
            }

            const quantidadeReservada = reservasMap[productId] || 0;
            const valorMedio = product.valorMedio || 0;
            const valorTotalEstoque = estoqueAtual * valorMedio;
            const fornecedorNome = product.fornecedorId ? (fornecedores[product.fornecedorId]?.nome || 'N/A') : 'N/A';

            return {
                ...product,
                estoque: estoqueAtual,
                cor: product.cor || '-', // Adiciona o campo cor
                fornecedorNome: fornecedorNome,
                quantidadeReservada: quantidadeReservada, // Adiciona o campo de reserva
                valorMedio,
                valorTotalEstoque,
                local: locacaoCompleta
            };
        });

        // 4. Renderiza a tabela.
        applyFilters();
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'main-row';
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td>${item.fornecedorNome}</td>
                <td>${item.estoque || 0}</td>
                <td>${item.quantidadeReservada || 0}</td>
                <td>${item.un}</td>
                <td>${(item.valorMedio || 0).toFixed(2)}</td>
                <td>${(item.valorTotalEstoque || 0).toFixed(2)}</td>
                <td>${item.local}</td>
            `;
            tableBody.appendChild(row);
        });
        feather.replace();
    }

    function getFilteredData() {
        const filterValues = {
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            local: filters.local.value.toLowerCase()
        };

        return consolidatedData.filter(item => {
            const matchesCodigo = (item.codigo || '').toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = (item.descricao || '').toLowerCase().includes(filterValues.descricao);
            const matchesLocal = (item.local || '').toLowerCase().replace(/<[^>]*>/g, "").includes(filterValues.local);
            return matchesCodigo && matchesDescricao && matchesLocal;
        });
    }

    function applyFilters(resetPage = true) {
        if (resetPage) {
            currentPage = 1;
        }
        let filteredData = getFilteredData();

        if (sortColumn) {
            filteredData.sort((a, b) => {
                const aValue = a[sortColumn];
                const bValue = b[sortColumn];

                if (sortColumn === 'local') {
                    const cleanA = (aValue || '').replace(/<[^>]*>/g, "");
                    const cleanB = (bValue || '').replace(/<[^>]*>/g, "");
                    return sortDirection === 'asc' ? cleanA.localeCompare(cleanB) : cleanB.localeCompare(cleanA);
                }

                if (typeof aValue === 'string') {
                    return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
                } else {
                    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                    return 0;
                }
            });
        }

        filteredAndSortedData = filteredData;
        displayPage();
    }

    function displayPage() {
        const totalItems = filteredAndSortedData.length;
        const totalPages = Math.ceil(totalItems / rowsPerPage);

        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const paginatedItems = filteredAndSortedData.slice(start, end);

        renderTable(paginatedItems);
        updatePaginationControls(totalPages);
        updateSortIndicators();
    }

    function updatePaginationControls(totalPages) {
        if (totalPages > 1) {
            paginationControls.style.display = 'flex';
            pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
            prevPageButton.disabled = currentPage === 1;
            nextPageButton.disabled = currentPage === totalPages;
        } else {
            paginationControls.style.display = 'none';
        }
    }

    function updateSortIndicators() {
        const headers = document.querySelectorAll('#table-consultas th[data-column]');
        headers.forEach(header => {
            header.classList.remove('sorted', 'asc', 'desc');
            if (header.dataset.column === sortColumn) {
                header.classList.add('sorted', sortDirection);
            }
        });
    }

    document.querySelectorAll('#table-consultas th[data-column]').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            applyFilters(); // Reset to page 1 on new sort
        });
    });

    Object.values(filters).forEach(input => input.addEventListener('input', () => applyFilters()));

    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayPage();
        }
    });

    nextPageButton.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredAndSortedData.length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            displayPage();
        }
    });

    function exportToExcel() {
        const filteredData = getFilteredData();

        const dataForExport = filteredData.map(item => ({
            'Código': item.codigo,
            'Descrição': item.descricao,
            'Cor': item.cor,
            'Fornecedor': item.fornecedorNome,
            'Estoque Atual': item.estoque,
            'Reservado': item.quantidadeReservada,
            'UN': item.un,
            'Custo Un. Médio': item.valorMedio.toFixed(2),
            'Custo Total Estoque': item.valorTotalEstoque.toFixed(2),
            'Locação': (item.local || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?b>/gi, '')
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Consulta de Estoque');
        XLSX.writeFile(workbook, 'consulta_estoque.xlsx');
    }

    document.getElementById('export-button').addEventListener('click', exportToExcel);

    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
