import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const obrasContainer = document.getElementById('obras-container');
    const filterCodigo = document.getElementById('filter-codigo');
    const filterObra = document.getElementById('filter-obra');
    let allObrasData = [];

    async function fetchData() {
        try {
            const [obrasSnapshot, produtosSnapshot, movimentacoesSnapshot] = await Promise.all([
                getDocs(collection(db, 'obras')),
                getDocs(collection(db, 'produtos')),
                getDocs(collection(db, 'movimentacoes'))
            ]);

            const productsMap = new Map(produtosSnapshot.docs.map(doc => [doc.id, doc.data()]));
            const custosObras = {};

            movimentacoesSnapshot.docs.forEach(doc => {
                const mov = doc.data();
                if (mov.tipo === 'saida' && mov.obraId) {
                    if (!custosObras[mov.obraId]) {
                        custosObras[mov.obraId] = 0;
                    }
                    const product = productsMap.get(mov.produtoId);
                    if (product && product.valorMedio) {
                        const custoMovimentacao = Number(mov.quantidade) * Number(product.valorMedio);
                        custosObras[mov.obraId] += custoMovimentacao;
                    }
                }
            });

            allObrasData = obrasSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                custoTotal: custosObras[doc.id] || 0
            }));

            renderObras(allObrasData);

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            obrasContainer.innerHTML = '<p>Erro ao carregar os dados. Tente novamente mais tarde.</p>';
        }
    }

    function renderObras(obras) {
        obrasContainer.innerHTML = '';
        if (obras.length === 0) {
            obrasContainer.innerHTML = '<p>Nenhuma obra encontrada.</p>';
            return;
        }

        obras.forEach(obra => {
            const obraCard = document.createElement('div');
            obraCard.className = 'obra-card';

            const custoFormatado = obra.custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            obraCard.innerHTML = `
                <h4>${obra.nome}</h4>
                <p><strong>Código:</strong> ${obra.codigo || 'N/A'}</p>
                <p class="custo">${custoFormatado}</p>
                <a href="detalhe-obra.html?id=${obra.id}" class="ver-mais">Ver mais</a>
            `;
            obrasContainer.appendChild(obraCard);
        });
    }

    function filterData() {
        const codigo = filterCodigo.value.toLowerCase();
        const obraNome = filterObra.value.toLowerCase();

        const filteredObras = allObrasData.filter(obra => {
            const matchCodigo = obra.codigo ? obra.codigo.toLowerCase().includes(codigo) : true;
            const matchNome = obra.nome.toLowerCase().includes(obraNome);
            return matchCodigo && matchNome;
        });

        renderObras(filteredObras);
    }

    filterCodigo.addEventListener('input', filterData);
    filterObra.addEventListener('input', filterData);

    fetchData();
});
