import { db } from './firebase-config.js';
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const obraTitulo = document.getElementById('obra-titulo');
    const obraCustoTotal = document.getElementById('obra-custo-total');
    const tableBody = document.getElementById('table-itens-obra').querySelector('tbody');
    const filterCodigo = document.getElementById('filter-codigo-produto');
    const filterDescricao = document.getElementById('filter-descricao-produto');

    let allItems = [];

    const urlParams = new URLSearchParams(window.location.search);
    const obraId = urlParams.get('id');

    if (!obraId) {
        obraTitulo.textContent = "ID da Obra não fornecido";
        return;
    }

    async function fetchData() {
        try {
            // Buscar dados da obra
            const obraRef = doc(db, "obras", obraId);
            const obraSnap = await getDoc(obraRef);

            if (!obraSnap.exists()) {
                obraTitulo.textContent = "Obra não encontrada";
                return;
            }
            const obraData = obraSnap.data();
            obraTitulo.textContent = `Detalhes da Obra: ${obraData.nome} (Cód: ${obraData.codigo || 'N/A'})`;

            // Buscar todos os produtos e mapeá-los
            const produtosSnapshot = await getDocs(collection(db, 'produtos'));
            const productsMap = new Map(produtosSnapshot.docs.map(doc => [doc.id, doc.data()]));

            // Buscar fornecedores e mapeá-los
            const fornecedoresSnapshot = await getDocs(collection(db, 'fornecedores'));
            const fornecedoresMap = new Map(fornecedoresSnapshot.docs.map(doc => [doc.id, doc.data().nome]));

            // Buscar movimentações de saída para esta obra
            const q = query(collection(db, "movimentacoes"), where("obraId", "==", obraId), where("tipo", "==", "saida"));
            const movimentacoesSnapshot = await getDocs(q);

            let custoTotalCalculado = 0;
            allItems = movimentacoesSnapshot.docs.map(doc => {
                const mov = doc.data();
                const produto = productsMap.get(mov.produtoId) || {};
                const fornecedorNome = fornecedoresMap.get(produto.fornecedorId) || 'N/A';
                const valorMedio = Number(produto.valorMedio) || 0;
                const valorTotal = Number(mov.quantidade) * valorMedio;

                custoTotalCalculado += valorTotal;

                return {
                    ...mov,
                    produtoCodigo: produto.codigo,
                    produtoDescricao: produto.descricao,
                    produtoUnidade: produto.unidade,
                    produtoCor: produto.cor,
                    fornecedorNome,
                    valorMedio,
                    valorTotal
                };
            });

            obraCustoTotal.textContent = `Custo Total: ${custoTotalCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
            renderTabelaItens(allItems);

        } catch (error) {
            console.error("Erro ao buscar detalhes da obra:", error);
            tableBody.innerHTML = `<tr><td colspan="9">Erro ao carregar os dados.</td></tr>`;
        }
    }

    function renderTabelaItens(items) {
        tableBody.innerHTML = '';
        if (items.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="9">Nenhum item utilizado nesta obra.</td></tr>`;
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.produtoCodigo || ''}</td>
                <td>${item.produtoDescricao || ''}</td>
                <td>${item.produtoUnidade || ''}</td>
                <td>${item.produtoCor || ''}</td>
                <td>${item.fornecedorNome}</td>
                <td>${item.quantidade}</td>
                <td>${item.observacao || ''}</td>
                <td>${item.valorMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function filterTable() {
        const codigo = filterCodigo.value.toLowerCase();
        const descricao = filterDescricao.value.toLowerCase();

        const filteredItems = allItems.filter(item => {
            const matchCodigo = item.produtoCodigo ? item.produtoCodigo.toLowerCase().includes(codigo) : true;
            const matchDescricao = item.produtoDescricao ? item.produtoDescricao.toLowerCase().includes(descricao) : true;
            return matchCodigo && matchDescricao;
        });

        renderTabelaItens(filteredItems);
    }

    filterCodigo.addEventListener('input', filterTable);
    filterDescricao.addEventListener('input', filterTable);

    fetchData();
});
