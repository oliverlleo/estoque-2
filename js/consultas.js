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

    async function fetchDataAndCalculate() {
        // 1. Busca todas as fontes de dados necessárias em paralelo.
        const [productsSnapshot, locaisSnapshot, movementsSnapshot, conversoesSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais')),
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "==", "reserva"))),
            getDocs(collection(db, 'conversoes'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        const conversoesMap = {};
        conversoesSnapshot.forEach(doc => {
            conversoesMap[doc.id] = doc.data();
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

            let valorMedioAjustado = valorMedio;
            if (product.conversaoId && conversoesMap[product.conversaoId]) {
                const regra = conversoesMap[product.conversaoId];
                const qtdCompra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                const qtdPadrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                if (qtdPadrao > 0) {
                    valorMedioAjustado = valorMedio * (qtdCompra / qtdPadrao);
                }
            }

            return {
                ...product,
                estoque: estoqueAtual,
                cor: product.cor || '-', // Adiciona o campo cor
                quantidadeReservada: quantidadeReservada, // Adiciona o campo de reserva
                valorMedio: valorMedioAjustado, // Usa o valor ajustado para exibição
                valorTotalEstoque: estoqueAtual * valorMedioAjustado,
                local: locacaoCompleta
            };
        });

        // 4. Renderiza a tabela.
        renderTable(consolidatedData);
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

    function applyFilters() {
        const filterValues = {
            codigo: filters.codigo.value.toLowerCase(),
            descricao: filters.descricao.value.toLowerCase(),
            local: filters.local.value.toLowerCase()
        };

        const filteredData = consolidatedData.filter(item => {
            const matchesCodigo = (item.codigo || '').toLowerCase().includes(filterValues.codigo);
            const matchesDescricao = (item.descricao || '').toLowerCase().includes(filterValues.descricao);
            const matchesLocal = (item.local || '').toLowerCase().includes(filterValues.local);
            return matchesCodigo && matchesDescricao && matchesLocal;
        });

        renderTable(filteredData);
    }

    Object.values(filters).forEach(input => input.addEventListener('input', applyFilters));

    fetchDataAndCalculate().catch(error => {
        console.error("Erro ao carregar dados da consulta:", error);
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: red;">Erro ao carregar dados: ${error.message}</td></tr>`;
    });
});
