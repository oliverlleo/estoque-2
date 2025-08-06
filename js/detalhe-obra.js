import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const obraId = params.get('id');

    if (!obraId) {
        document.body.innerHTML = '<h1>ID da Obra não fornecido.</h1>';
        return;
    }

    async function carregarDetalhesDaObra() {
        try {
            const [obraSnap, movementsSnap, productsSnap, fornecedoresSnap, gruposSnap, aplicacoesSnap] = await Promise.all([
                getDoc(doc(db, 'obras', obraId)),
                getDocs(query(collection(db, 'movimentacoes'), where('obraId', '==', obraId), where('tipo', '==', 'saida'))),
                getDocs(collection(db, 'produtos')),
                getDocs(collection(db, 'fornecedores')),
                getDocs(collection(db, 'grupos')),      // Adicionado
                getDocs(collection(db, 'aplicacoes'))   // Adicionado
            ]);

            const productsMap = {};
            productsSnap.forEach(prodDoc => {
                productsMap[prodDoc.id] = prodDoc.data();
            });

            const fornecedoresMap = {};
            fornecedoresSnap.forEach(fornDoc => {
                fornecedoresMap[fornDoc.id] = fornDoc.data();
            });

            const gruposMap = {};
            gruposSnap.forEach(grupoDoc => {
                gruposMap[grupoDoc.id] = grupoDoc.data();
            });

            const aplicacoesMap = {};
            aplicacoesSnap.forEach(appDoc => {
                aplicacoesMap[appDoc.id] = appDoc.data();
            });

            let custoTotalDaObra = 0;
            const itensUtilizados = [];

            movementsSnap.forEach(movDoc => {
                const movimentacao = movDoc.data();
                const produto = productsMap[movimentacao.productId];

                if (produto) {
                    const valorMedio = movimentacao.valorMedioHistorico || 0;
                    const valorTotalItem = movimentacao.quantidade * valorMedio;
                    custoTotalDaObra += valorTotalItem;

                    const fornecedor = produto.fornecedorId ? (fornecedoresMap[produto.fornecedorId]?.nome || 'N/A') : 'N/A';
                    const grupo = produto.grupoId ? (gruposMap[produto.grupoId]?.nome || 'N/A') : 'N/A';
                    const aplicacoes = (produto.aplicacaoIds || [])
                        .map(id => aplicacoesMap[id]?.nome || '')
                        .filter(Boolean)
                        .join(', ') || 'N/A';

                    itensUtilizados.push({
                        codigo: produto.codigo,
                        descricao: produto.descricao,
                        un: produto.un,
                        cor: produto.cor || '-',
                        fornecedor: fornecedor,
                        grupo: grupo,
                        aplicacoes: aplicacoes,
                        qtde: movimentacao.quantidade,
                        observacao: movimentacao.observacao || '-',
                        valorMedio: valorMedio,
                        valorTotal: valorTotalItem
                    });
                }
            });

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
        const tabelaBody = document.getElementById('detalhe-obra-table-body');
        if (!tabelaBody) {
            console.error('Elemento #detalhe-obra-table-body não encontrado no HTML. Verifique o ID da sua <tbody>.');
            return;
        }

        tabelaBody.innerHTML = '';
        itens.forEach(item => {
            const row = document.createElement('tr');
            const valorMedioFmt = (item.valorMedio || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const valorTotalFmt = (item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.un}</td>
                <td>${item.cor}</td>
                <td>${item.fornecedor}</td>
                <td>${item.grupo}</td>
                <td>${item.aplicacoes}</td>
                <td>${item.qtde}</td>
                <td>${item.observacao}</td>
                <td>${valorMedioFmt}</td>
                <td>${valorTotalFmt}</td>
            `;
            tabelaBody.appendChild(row);
        });
    }

    carregarDetalhesDaObra();
});
