import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const EPSILON = 1e-9;

export function normalizarTexto(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function obterIdsInventario(mapaTipos = {}) {
    const ids = new Set();
    Object.entries(mapaTipos || {}).forEach(([id, tipo]) => {
        if (normalizarTexto(tipo?.nome) === 'inventario') {
            ids.add(id);
        }
    });
    return ids;
}

export function obterTimestampMillis(data) {
    if (!data) return 0;
    if (typeof data.toMillis === 'function') return data.toMillis();
    if (typeof data.seconds === 'number') return data.seconds * 1000;
    if (data instanceof Date) return data.getTime();
    const parsed = new Date(data).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Retorna a data contábil efetiva da movimentação.
 * Reservas confirmadas devem ser processadas na data da baixa real,
 * preservando `data`/`dataReserva` apenas como data de criação da reserva.
 */
export function obterDataEfetivaMovimento(movimento = {}) {
    return movimento.confirmadaEm || movimento.dataSaida || movimento.data;
}

function numeroPositivo(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/**
 * Define o custo exibido/persistido sem apagar a última referência válida.
 *
 * - Com estoque positivo, prioriza o custo reconstruído do histórico.
 * - Com estoque zerado, prioriza o último custo salvo no produto.
 * - Se uma das fontes estiver vazia, utiliza a outra.
 *
 * O custo unitário pode permanecer conhecido com saldo zero; o valor total do
 * estoque continua sendo zero porque depende da quantidade atual.
 */
export function resolverCustoMedioProduto({
    estoqueAtual = 0,
    custoCadastrado = 0,
    calculo = null
} = {}) {
    const estoque = Number(estoqueAtual) || 0;
    const cadastrado = numeroPositivo(custoCadastrado);
    const calculado =
        numeroPositivo(calculo?.custoMedio) ||
        numeroPositivo(calculo?.ultimoCustoMedioValido);

    if (estoque <= EPSILON) {
        return cadastrado || calculado || 0;
    }

    return calculado || cadastrado || 0;
}


export function calcularCustoMedioAposEntrada({
    estoqueAtual = 0,
    custoMedioAtual = 0,
    quantidadeEntrada = 0,
    custoTotalEntrada = 0
} = {}) {
    const estoque = Number(estoqueAtual) || 0;
    const custoAtual = Number(custoMedioAtual) || 0;
    const quantidade = Number(quantidadeEntrada) || 0;
    const custoEntrada = Number(custoTotalEntrada) || 0;
    const novoEstoque = estoque + quantidade;

    if (novoEstoque <= EPSILON) return custoAtual;
    return ((estoque * custoAtual) + custoEntrada) / novoEstoque;
}

export function calcularCustoTotalEntrada(movimento) {
    const custoSalvo = numeroPositivo(movimento?.custo_total_entrada);
    if (custoSalvo > 0) return custoSalvo;

    const quantidadeCompra = numeroPositivo(movimento?.quantidade_compra);
    const valorUnitario = numeroPositivo(movimento?.valor_unitario);
    const impostosEFrete =
        (Number(movimento?.icms) || 0) +
        (Number(movimento?.ipi) || 0) +
        (Number(movimento?.frete) || 0);

    const calculado = (quantidadeCompra * valorUnitario) + impostosEFrete;
    return Number.isFinite(calculado) && calculado > 0 ? calculado : 0;
}

function movimentoEhInventarioEntrada(movimento, idsInventarioEntrada) {
    return Boolean(
        movimento?.ajuste_inventario === true ||
        movimento?.preserva_custo_medio === true ||
        idsInventarioEntrada.has(movimento?.tipo_entradaId)
    );
}

function movimentoEhInventarioSaida(movimento, idsInventarioSaida) {
    return Boolean(
        movimento?.ajuste_inventario === true ||
        idsInventarioSaida.has(movimento?.tipo_saidaId)
    );
}

/**
 * Reconstrói o custo médio móvel em ordem cronológica.
 *
 * Regras:
 * - Compra/entrada valorizada: soma quantidade e custo da entrada.
 * - Inventário positivo sem valor: herda o custo médio imediatamente anterior.
 * - Saída: baixa quantidade e valor pelo custo médio vigente.
 * - Inventário negativo: segue a mesma regra da saída e registra o custo vigente.
 * - Reserva e transferência: não alteram quantidade ou valor consolidados.
 */
export function calcularCustoMedioMovel(movimentacoes = [], opcoes = {}) {
    const idsInventarioEntrada = opcoes.idsInventarioEntrada || new Set();
    const idsInventarioSaida = opcoes.idsInventarioSaida || new Set();
    const gerarCorrecoes = opcoes.gerarCorrecoes === true;

    const ordenadas = [...movimentacoes].sort(
        (a, b) => obterTimestampMillis(obterDataEfetivaMovimento(a)) - obterTimestampMillis(obterDataEfetivaMovimento(b))
    );

    let quantidade = 0;
    let valorEstoque = 0;
    let custoMedio = 0;
    let ultimoCustoMedioValido = 0;
    const correcoesMovimentos = [];
    const alertas = [];
    const linhas = [];

    for (const movimento of ordenadas) {
        const qtd = numeroPositivo(movimento?.quantidade);
        if (qtd <= 0) continue;

        let custoUnitarioMovimento = 0;
        let custoTotalMovimento = 0;

        if (movimento.tipo === 'entrada') {
            const ehInventario = movimentoEhInventarioEntrada(movimento, idsInventarioEntrada);
            let custoEntrada = calcularCustoTotalEntrada(movimento);

            if (ehInventario && custoEntrada <= 0) {
                const custoHerdado =
                    numeroPositivo(movimento?.valorMedioHistorico) ||
                    numeroPositivo(movimento?.valor_unitario) ||
                    custoMedio;

                if (custoHerdado > 0) {
                    custoEntrada = qtd * custoHerdado;
                    if (gerarCorrecoes && movimento.id) {
                        correcoesMovimentos.push({
                            id: movimento.id,
                            dados: {
                                quantidade_compra: qtd,
                                valor_unitario: custoHerdado,
                                valorMedioHistorico: custoHerdado,
                                custo_total_entrada: custoEntrada,
                                ajuste_inventario: true,
                                preserva_custo_medio: true,
                                custo_medio_corrigido_em_migracao: true
                            }
                        });
                    }
                } else {
                    alertas.push({
                        tipo: 'INVENTARIO_SEM_CUSTO_BASE',
                        movimentoId: movimento.id || null,
                        mensagem: 'Inventário positivo sem custo médio anterior válido.'
                    });
                }
            }

            quantidade += qtd;
            valorEstoque += custoEntrada;
            custoTotalMovimento = custoEntrada;
            custoUnitarioMovimento = qtd > 0 ? custoEntrada / qtd : 0;
        } else if (movimento.tipo === 'saida') {
            const ehInventario = movimentoEhInventarioSaida(movimento, idsInventarioSaida);
            const custoAntesDaSaida = quantidade > EPSILON ? valorEstoque / quantidade : custoMedio;

            if (gerarCorrecoes && ehInventario && movimento.id && custoAntesDaSaida > 0) {
                const custoHistorico = numeroPositivo(movimento?.valorMedioHistorico);
                const custoTotalSalvo = numeroPositivo(movimento?.custoTotal);
                if (custoHistorico <= 0 || custoTotalSalvo <= 0) {
                    correcoesMovimentos.push({
                        id: movimento.id,
                        dados: {
                            valorMedioHistorico: custoAntesDaSaida,
                            custoTotal: qtd * custoAntesDaSaida,
                            ajuste_inventario: true,
                            preserva_custo_medio: true,
                            custo_medio_corrigido_em_migracao: true
                        }
                    });
                }
            }

            custoUnitarioMovimento = custoAntesDaSaida;
            custoTotalMovimento = qtd * custoAntesDaSaida;

            if (quantidade <= EPSILON || qtd > quantidade + EPSILON) {
                alertas.push({
                    tipo: 'SAIDA_SEM_SALDO_HISTORICO',
                    movimentoId: movimento.id || null,
                    mensagem: 'Saída encontrada sem saldo histórico suficiente.'
                });
            }

            if (quantidade <= EPSILON) {
                quantidade -= qtd;
            } else {
                valorEstoque -= qtd * custoAntesDaSaida;
                quantidade -= qtd;
            }
        }

        if (quantidade > EPSILON) {
            custoMedio = Math.max(0, valorEstoque / quantidade);
            if (custoMedio > 0) ultimoCustoMedioValido = custoMedio;
        } else if (Math.abs(quantidade) <= EPSILON) {
            quantidade = 0;
            valorEstoque = 0;
            // Mantém a última referência de custo para um inventário futuro após saldo zero.
            custoMedio = ultimoCustoMedioValido;
        }

        linhas.push({
            movimentoId: movimento.id || null,
            movimento,
            custoUnitarioMovimento,
            custoTotalMovimento,
            quantidadeSaldo: quantidade,
            valorSaldo: quantidade > EPSILON ? Math.max(0, valorEstoque) : 0,
            custoMedioApos: quantidade > EPSILON ? Math.max(0, valorEstoque / quantidade) : custoMedio
        });
    }

    const custoFinal = quantidade > EPSILON
        ? Math.max(0, valorEstoque / quantidade)
        : ultimoCustoMedioValido;

    return {
        quantidade,
        valorEstoque: quantidade > EPSILON ? Math.max(0, valorEstoque) : 0,
        custoMedio: custoFinal,
        ultimoCustoMedioValido,
        linhas,
        correcoesMovimentos,
        alertas
    };
}

export async function carregarIdsInventario(db) {
    const [entradasSnapshot, saidasSnapshot] = await Promise.all([
        getDocs(collection(db, 'tipos_entrada')),
        getDocs(collection(db, 'tipos_saida'))
    ]);

    const entradas = {};
    const saidas = {};
    entradasSnapshot.forEach(item => { entradas[item.id] = item.data(); });
    saidasSnapshot.forEach(item => { saidas[item.id] = item.data(); });

    return {
        idsInventarioEntrada: obterIdsInventario(entradas),
        idsInventarioSaida: obterIdsInventario(saidas)
    };
}

export async function recalcularCustoMedioProduto(db, produtoId, idsInventario = null) {
    if (!produtoId) return { custoMedio: 0, quantidade: 0, valorEstoque: 0 };

    const ids = idsInventario || await carregarIdsInventario(db);
    const produtoRef = doc(db, 'produtos', produtoId);
    const [produtoSnapshot, movimentosSnapshot] = await Promise.all([
        getDoc(produtoRef),
        getDocs(query(collection(db, 'movimentacoes'), where('productId', '==', produtoId)))
    ]);

    const produto = produtoSnapshot.exists() ? produtoSnapshot.data() : {};
    const estoqueAtual = Array.isArray(produto.locacoes)
        ? produto.locacoes.reduce((total, local) => total + (Number(local.estoque) || 0), 0)
        : (Number(produto.estoque) || 0);
    const movimentos = movimentosSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const resultado = calcularCustoMedioMovel(movimentos, ids);
    const custoResolvido = resolverCustoMedioProduto({
        estoqueAtual,
        custoCadastrado: produto.valorMedio,
        calculo: resultado
    });

    await setDoc(produtoRef, {
        valorMedio: custoResolvido,
        custoMedioRecalculadoEm: new Date().toISOString()
    }, { merge: true });

    return {
        ...resultado,
        custoMedio: custoResolvido,
        custoMedioCalculado: resultado.custoMedio
    };
}
