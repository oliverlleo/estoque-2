import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const obraId = params.get('id');

    if (!obraId) {
        document.body.innerHTML = '<h1>ID da Obra não fornecido.</h1>';
        return;
    }

    // 1. Envolvemos toda a lógica em uma função 'async' para usar 'await' corretamente.
    async function carregarDetalhesDaObra() {
        try {
            // 2. Usamos Promise.all para garantir que TODAS as buscas no banco de dados terminem
            // ANTES de prosseguirmos para a etapa de processamento dos dados.
            const [obraSnap, movementsSnap, productsSnap] = await Promise.all([
                getDoc(doc(db, 'obras', obraId)),
                getDocs(query(collection(db, 'movimentacoes'), where('obraId', '==', obraId), where('tipo', '==', 'saida'))),
                getDocs(collection(db, 'produtos'))
            ]);

            // 3. Construímos o mapa de produtos DEPOIS que a busca terminou.
            // Agora temos certeza de que ele estará completo.
            const productsMap = {};
            productsSnap.forEach(prodDoc => {
                productsMap[prodDoc.id] = prodDoc.data();
            });

            let custoTotalDaObra = 0;
            const itensUtilizados = [];

            // 4. Processamos os dados com a garantia de que tudo foi carregado.
            movementsSnap.forEach(movDoc => {
                const movimentacao = movDoc.data();
                const produto = productsMap[movimentacao.produtoId];

                // Verificação de segurança: só processa se o produto for encontrado
                if (produto) {
                    const valorMedio = produto.valorMedio || 0;
                    const valorTotalItem = movimentacao.quantidade * valorMedio;
                    custoTotalDaObra += valorTotalItem;

                    itensUtilizados.push({
                        codigo: produto.codigo,
                        descricao: produto.descricao,
                        un: produto.un,
                        cor: produto.cor || '-',
                        fornecedor: 'N/A', // Nota: O fornecedor precisa ser buscado separadamente se necessário
                        qtde: movimentacao.quantidade,
                        observacao: movimentacao.observacao || '-',
                        valorMedio: valorMedio,
                        valorTotal: valorTotalItem
                    });
                }
            });

            // 5. Renderizamos as informações na tela.
            const obraData = obraSnap.data();
            document.getElementById('obra-titulo').textContent = `${obraData.codigo || ''} - ${obraData.nome}`;
            document.getElementById('obra-custo-total').textContent = `Custo Total: ${custoTotalDaObra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

            renderTabelaItens(itensUtilizados);

        } catch (error) {
            console.error("Erro ao carregar detalhes da obra:", error);
            document.body.innerHTML = `<h1>Erro ao carregar dados. Verifique o console.</h1><p>${error.message}</p>`;
        }
    }

    function renderTabelaItens(itens) {
        const tabelaBody = document.querySelector('#detalhe-obra-table-body'); // Supondo que a tabela tenha um tbody com este ID
        if (!tabelaBody) return;

        tabelaBody.innerHTML = '';
        itens.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.un}</td>
                <td>${item.cor}</td>
                <td>${item.fornecedor}</td>
                <td>${item.qtde}</td>
                <td>${item.observacao}</td>
                <td>${item.valorMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            `;
            tabelaBody.appendChild(row);
        });
        // Adicionar lógica de filtros aqui, se necessário.
    }

    // Chamar a função principal para iniciar o processo.
    carregarDetalhesDaObra();
});
