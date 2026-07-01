import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import {
    calcularCustoMedioMovel,
    carregarIdsInventario
} from './custo-medio.js';

const btnSimular = document.getElementById('btn-simular');
const btnBackup = document.getElementById('btn-backup');
const btnAplicar = document.getElementById('btn-aplicar');
const confirmacao = document.getElementById('confirmacao');
const statusEl = document.getElementById('status');
const body = document.getElementById('resultado-body');

let simulacao = null;

function estoqueTotalProduto(produto) {
    if (Array.isArray(produto.locacoes)) {
        return produto.locacoes.reduce((total, local) => total + (Number(local.estoque) || 0), 0);
    }
    return Number(produto.estoque) || 0;
}

function formatarNumero(valor, casas = 3) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function setStatus(mensagem, erro = false) {
    statusEl.textContent = mensagem;
    statusEl.className = `mt-4 text-sm ${erro ? 'text-red-700' : 'text-gray-700'}`;
}

function atualizarBotoes() {
    btnBackup.disabled = !simulacao;
    btnAplicar.disabled = !simulacao || confirmacao.value.trim().toUpperCase() !== 'CORRIGIR';
}

confirmacao.addEventListener('input', atualizarBotoes);

btnSimular.addEventListener('click', async () => {
    btnSimular.disabled = true;
    simulacao = null;
    atualizarBotoes();
    body.innerHTML = '';
    setStatus('Carregando produtos, movimentações e configurações...');

    try {
        const [produtosSnapshot, movimentosSnapshot, idsInventario] = await Promise.all([
            getDocs(collection(db, 'produtos')),
            getDocs(collection(db, 'movimentacoes')),
            carregarIdsInventario(db)
        ]);

        const movimentosPorProduto = new Map();
        movimentosSnapshot.forEach(item => {
            const movimento = { id: item.id, ...item.data() };
            if (!movimentosPorProduto.has(movimento.productId)) {
                movimentosPorProduto.set(movimento.productId, []);
            }
            movimentosPorProduto.get(movimento.productId).push(movimento);
        });

        const resultados = produtosSnapshot.docs.map(item => {
            const produto = { id: item.id, ...item.data() };
            const movimentos = movimentosPorProduto.get(produto.id) || [];
            const calculo = calcularCustoMedioMovel(movimentos, {
                ...idsInventario,
                gerarCorrecoes: true
            });
            const estoqueAtual = estoqueTotalProduto(produto);
            const diferencaSaldo = calculo.quantidade - estoqueAtual;
            const temAlertaCritico = calculo.alertas.length > 0;
            const saldoConfere = Math.abs(diferencaSaldo) <= 0.001;
            const pronto = saldoConfere && !temAlertaCritico;

            return {
                produto,
                estoqueAtual,
                movimentos,
                calculo,
                pronto,
                status: pronto ? 'PRONTO' : 'REVISÃO MANUAL'
            };
        });

        simulacao = {
            geradoEm: new Date().toISOString(),
            resultados,
            movimentosOriginais: movimentosSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
            produtosOriginais: produtosSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        };

        const prontos = resultados.filter(r => r.pronto);
        const revisao = resultados.filter(r => !r.pronto);
        const movimentosACorrigir = prontos.reduce((total, r) => total + r.calculo.correcoesMovimentos.length, 0);

        document.getElementById('kpi-produtos').textContent = resultados.length;
        document.getElementById('kpi-prontos').textContent = prontos.length;
        document.getElementById('kpi-revisao').textContent = revisao.length;
        document.getElementById('kpi-movimentos').textContent = movimentosACorrigir;

        const relevantes = resultados
            .filter(r => r.calculo.correcoesMovimentos.length > 0 || Math.abs((r.produto.valorMedio || 0) - r.calculo.custoMedio) > 0.001 || !r.pronto)
            .sort((a, b) => Number(a.pronto) - Number(b.pronto));

        body.innerHTML = relevantes.map(r => {
            const statusClass = r.pronto ? 'text-green-700 bg-green-50' : 'text-yellow-800 bg-yellow-50';
            return `
                <tr class="border-b">
                    <td class="p-3">${r.produto.codigo || r.produto.id}</td>
                    <td class="p-3">${r.produto.descricao || '-'}</td>
                    <td class="p-3 text-right">${formatarNumero(r.estoqueAtual)}</td>
                    <td class="p-3 text-right">${formatarNumero(r.calculo.quantidade)}</td>
                    <td class="p-3 text-right">R$ ${formatarNumero(r.produto.valorMedio)}</td>
                    <td class="p-3 text-right font-semibold">R$ ${formatarNumero(r.calculo.custoMedio)}</td>
                    <td class="p-3 text-right">${r.calculo.correcoesMovimentos.length}</td>
                    <td class="p-3 ${statusClass}">${r.status}</td>
                </tr>`;
        }).join('');

        setStatus(`Simulação concluída. ${prontos.length} produtos podem ser corrigidos automaticamente; ${revisao.length} precisam de revisão manual.`);
        atualizarBotoes();
    } catch (error) {
        console.error(error);
        setStatus(`Erro na simulação: ${error.message}`, true);
    } finally {
        btnSimular.disabled = false;
    }
});

btnBackup.addEventListener('click', () => {
    if (!simulacao) return;
    const blob = new Blob([JSON.stringify(simulacao, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-custo-medio-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
});

async function executarOperacoesEmLotes(operacoes, tamanho = 400) {
    for (let inicio = 0; inicio < operacoes.length; inicio += tamanho) {
        const lote = writeBatch(db);
        operacoes.slice(inicio, inicio + tamanho).forEach(operacao => operacao(lote));
        await lote.commit();
    }
}

btnAplicar.addEventListener('click', async () => {
    if (!simulacao || confirmacao.value.trim().toUpperCase() !== 'CORRIGIR') return;
    if (!window.confirm('Confirma a correção dos produtos marcados como PRONTO? Faça o backup JSON antes de continuar.')) return;

    btnAplicar.disabled = true;
    btnSimular.disabled = true;
    setStatus('Aplicando correções no Firestore...');

    try {
        const operacoes = [];
        const produtosProntos = simulacao.resultados.filter(r =>
            r.pronto && (
                r.calculo.correcoesMovimentos.length > 0 ||
                Math.abs((Number(r.produto.valorMedio) || 0) - r.calculo.custoMedio) > 0.001
            )
        );

        produtosProntos.forEach(resultado => {
            resultado.calculo.correcoesMovimentos.forEach(correcao => {
                operacoes.push(lote => lote.set(
                    doc(db, 'movimentacoes', correcao.id),
                    { ...correcao.dados, migradoEm: serverTimestamp() },
                    { merge: true }
                ));
            });

            operacoes.push(lote => lote.set(
                doc(db, 'produtos', resultado.produto.id),
                {
                    valorMedio: resultado.calculo.custoMedio,
                    custoMedioMigradoEm: serverTimestamp(),
                    custoMedioMigracaoVersao: 1
                },
                { merge: true }
            ));
        });

        await executarOperacoesEmLotes(operacoes);
        setStatus(`Correção concluída: ${produtosProntos.length} produtos e ${operacoes.length - produtosProntos.length} movimentações atualizados.`);
        confirmacao.value = '';
        simulacao = null;
        atualizarBotoes();
    } catch (error) {
        console.error(error);
        setStatus(`Erro ao aplicar a correção: ${error.message}`, true);
    } finally {
        btnSimular.disabled = false;
    }
});
