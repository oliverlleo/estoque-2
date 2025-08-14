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
        const [productsSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais'))
        ]);

        const locais = {};
        locaisSnapshot.forEach(doc => {
            locais[doc.id] = doc.data();
        });

        consolidatedData = await Promise.all(productsSnapshot.docs.map(async (productDoc) => {
            const product = productDoc.data();
            product.id = productDoc.id; // Garante que o ID está no objeto

            const estoqueAtual = product.estoque || 0;
            const valorMedio = product.valorMedio || 0;
            const valorTotalEstoque = estoqueAtual * valorMedio;

            let locacaoCompleta = 'N/A';
            try {
                const locacoesRef = collection(db, 'produtos', product.id, 'locacoes');
                const locacoesSnapshot = await getDocs(locacoesRef);

                if (!locacoesSnapshot.empty) {
                    const locacoesStrings = locacoesSnapshot.docs.map(doc => {
                        const loc = doc.data();
                        const localNome = locais[loc.localId]?.nome || 'Desconhecido';
                        return `${localNome} - ${loc.descricao} (Estoque: ${loc.estoque})`;
                    });
                    locacaoCompleta = locacoesStrings.join('<br>');
                } else {
                    locacaoCompleta = 'Nenhuma locação';
                }
            } catch (e) {
                console.error(`Erro ao buscar locações para o produto ${product.codigo}:`, e);
                locacaoCompleta = 'Erro ao carregar';
            }

            return {
                ...product,
                estoque: estoqueAtual,
                valorMedio,
                valorTotalEstoque,
                local: locacaoCompleta
            };
        }));

        renderTable(consolidatedData);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'main-row';
            // Dentro da função renderTable em js/consultas.js
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.estoque || 0}</td>
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
