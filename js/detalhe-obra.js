import { db } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const obraId = params.get('id');
    const btnExportExcel = document.getElementById('btn-export-excel');

    let currentItens = [];
    let obraInfo = {};

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
                getDocs(collection(db, 'grupos')),
                getDocs(collection(db, 'aplicacoes'))
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

            currentItens = itensUtilizados;
            const obraData = obraSnap.data();
            obraInfo = {
                codigo: obraData.codigo || 'S/C',
                nome: obraData.nome
            };

            document.getElementById('obra-titulo').textContent = `${obraInfo.codigo} - ${obraInfo.nome}`;
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

    function exportToExcel() {
        if (currentItens.length === 0) {
            alert("Não há itens para exportar.");
            return;
        }

        // Mapeia os dados para um formato simples, com os cabeçalhos desejados
        const dataForExport = currentItens.map(item => ({
            'Código': item.codigo,
            'Descrição': item.descricao,
            'UN': item.un,
            'Cor': item.cor,
            'Fornecedor': item.fornecedor,
            'Grupo': item.grupo,
            'Aplicações': item.aplicacoes,
            'Qtde': item.qtde,
            'Observação': item.observacao,
            'Custo Un. Médio': item.valorMedio,
            'Custo Total': item.valorTotal
        }));

        const worksheet = XLSX.utils.json_to_sheet([]);
        const workbook = XLSX.utils.book_new();

        // Adiciona o cabeçalho com código e nome da obra
        XLSX.utils.sheet_add_aoa(worksheet, [[`Código da Obra: ${obraInfo.codigo}`]], { origin: 'A1' });
        XLSX.utils.sheet_add_aoa(worksheet, [[`Nome da Obra: ${obraInfo.nome}`]], { origin: 'A2' });

        // Adiciona a tabela de dados a partir da linha 4
        XLSX.utils.sheet_add_json(worksheet, dataForExport, { origin: 'A4', skipHeader: false });

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Itens da Obra');

        // Define a largura das colunas
        worksheet['!cols'] = [
            { wch: 15 }, // Código
            { wch: 40 }, // Descrição
            { wch: 8 },  // UN
            { wch: 15 }, // Cor
            { wch: 25 }, // Fornecedor
            { wch: 25 }, // Grupo
            { wch: 30 }, // Aplicações
            { wch: 10 }, // Qtde
            { wch: 40 }, // Observação
            { wch: 15 }, // Custo Un. Médio
            { wch: 15 }  // Custo Total
        ];

        // Gera e baixa o arquivo
        XLSX.writeFile(workbook, `Itens_Obra_${obraInfo.codigo}_${obraInfo.nome}.xlsx`);
    }

    btnExportExcel.addEventListener('click', exportToExcel);

    carregarDetalhesDaObra();
});
