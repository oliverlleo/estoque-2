import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    runTransaction,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import {
    normalizarTexto,
    obterDataEfetivaMovimento,
    obterTimestampMillis
} from './custo-medio.js';

const EDITOR_ID = 'movimentacao-editor-integrado';
const EPSILON = 1e-9;

let cache = {
    produtos: {},
    obras: {},
    tiposEntrada: {},
    tiposSaida: {},
    locais: {}
};
let cacheCarregadoEm = 0;
let movimentoAtual = null;
let produtoAtual = null;
let modal = null;
let style = null;

function numero(valor) {
    const n = Number(String(valor ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

function numeroPositivo(valor) {
    const n = numero(valor);
    return n > 0 ? n : 0;
}

function quaseIgual(a, b, tolerancia = 1e-6) {
    return Math.abs(numero(a) - numero(b)) <= tolerancia;
}

function texto(valor) {
    return String(valor ?? '').trim();
}

function escapeHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatarDataMovimento(mov) {
    const millis = obterTimestampMillis(obterDataEfetivaMovimento(mov));
    return millis ? new Date(millis).toLocaleString('pt-BR') : '';
}

function tipoVisual(tipo) {
    if (tipo === 'reserva_cancelada') return 'RESERVA CANCELADA';
    return String(tipo || '').toUpperCase();
}

async function carregarCache(forcar = false) {
    if (!forcar && Date.now() - cacheCarregadoEm < 30000 && Object.keys(cache.produtos).length) return;

    const [produtosSnap, obrasSnap, entradasSnap, saidasSnap, locaisSnap] = await Promise.all([
        getDocs(collection(db, 'produtos')),
        getDocs(collection(db, 'obras')),
        getDocs(collection(db, 'tipos_entrada')),
        getDocs(collection(db, 'tipos_saida')),
        getDocs(collection(db, 'locais'))
    ]);

    cache = { produtos: {}, obras: {}, tiposEntrada: {}, tiposSaida: {}, locais: {} };
    produtosSnap.forEach(item => { cache.produtos[item.id] = { id: item.id, ...item.data() }; });
    obrasSnap.forEach(item => { cache.obras[item.id] = { id: item.id, ...item.data() }; });
    entradasSnap.forEach(item => { cache.tiposEntrada[item.id] = { id: item.id, ...item.data() }; });
    saidasSnap.forEach(item => { cache.tiposSaida[item.id] = { id: item.id, ...item.data() }; });
    locaisSnap.forEach(item => { cache.locais[item.id] = { id: item.id, ...item.data() }; });
    cacheCarregadoEm = Date.now();
}

function instalarEstilo() {
    if (style) return;
    style = document.createElement('style');
    style.id = `${EDITOR_ID}-style`;
    style.textContent = `
        #table-movimentacoes tbody tr[data-editavel-mov="1"] { cursor: pointer; }
        #table-movimentacoes tbody tr[data-editavel-mov="1"]:hover { background: #eef6ff !important; }
        #${EDITOR_ID} .editor-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
        #${EDITOR_ID} .editor-full { grid-column:1/-1; }
        #${EDITOR_ID} label { display:block; font-size:.82rem; font-weight:700; color:#4b5563; margin-bottom:5px; }
        #${EDITOR_ID} .editor-input { width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:7px; background:#fff; color:#111827; font-size:16px; }
        #${EDITOR_ID} .editor-input:disabled { background:#f1f5f9; color:#64748b; }
        #${EDITOR_ID} .editor-resumo { padding:12px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:14px; }
        #${EDITOR_ID} .editor-aviso { padding:10px 12px; border-radius:8px; background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; margin-bottom:14px; }
        #${EDITOR_ID} .editor-ok { padding:10px 12px; border-radius:8px; background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; margin-bottom:14px; }
        #${EDITOR_ID} .editor-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
        #${EDITOR_ID} .editor-btn { border:0; border-radius:7px; padding:10px 16px; font-weight:700; cursor:pointer; }
        #${EDITOR_ID} .editor-cancelar { background:#e5e7eb; color:#111827; }
        #${EDITOR_ID} .editor-salvar { background:#2563eb; color:#fff; }
        #${EDITOR_ID} .editor-salvar:disabled { opacity:.6; cursor:not-allowed; }
        #${EDITOR_ID} .editor-modal-content { max-width:850px; width:94%; max-height:92%; overflow:auto; }
        #${EDITOR_ID} .editor-subtitle { font-size:.78rem; color:#64748b; margin-top:3px; }
        @media (max-width:700px) {
            #${EDITOR_ID} .editor-grid { grid-template-columns:1fr; }
            #${EDITOR_ID} .editor-full { grid-column:1; }
            #${EDITOR_ID} .editor-modal-content { width:96%; }
        }
    `;
    document.head.appendChild(style);
}

function garantirModal() {
    if (modal) return modal;
    instalarEstilo();
    modal = document.createElement('div');
    modal.id = EDITOR_ID;
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content editor-modal-content">
            <div class="modal-header">
                <div>
                    <h3>Editar movimentação</h3>
                    <div class="editor-subtitle">A alteração recalcula estoque, custo médio e custos históricos dependentes.</div>
                </div>
                <span class="close-button" data-editor-fechar>&times;</span>
            </div>
            <div class="modal-body">
                <div id="editor-mov-resumo" class="editor-resumo"></div>
                <div id="editor-mov-mensagem"></div>
                <form id="editor-mov-form">
                    <div class="editor-grid">
                        <div>
                            <label>Produto</label>
                            <input class="editor-input" id="editor-produto" disabled>
                        </div>
                        <div>
                            <label>Tipo principal</label>
                            <input class="editor-input" id="editor-tipo" disabled>
                        </div>
                        <div>
                            <label>Subtipo</label>
                            <select class="editor-input" id="editor-subtipo"></select>
                        </div>
                        <div>
                            <label>Local / locação</label>
                            <select class="editor-input" id="editor-locacao"></select>
                        </div>
                        <div>
                            <label>Quantidade no estoque</label>
                            <input class="editor-input" id="editor-quantidade" type="number" min="0.0000001" step="any" required>
                        </div>
                        <div id="editor-qtd-compra-wrap">
                            <label>Quantidade de compra</label>
                            <input class="editor-input" id="editor-quantidade-compra" type="number" min="0.0000001" step="any">
                        </div>
                        <div id="editor-total-wrap">
                            <label>Custo total da entrada</label>
                            <input class="editor-input" id="editor-custo-total" type="number" min="0" step="0.01">
                        </div>
                        <div id="editor-unitario-wrap">
                            <label>Valor unitário da entrada</label>
                            <input class="editor-input" id="editor-valor-unitario" type="number" min="0" step="0.000001">
                        </div>
                        <div id="editor-icms-wrap">
                            <label>ICMS total</label>
                            <input class="editor-input" id="editor-icms" type="number" min="0" step="0.01">
                        </div>
                        <div id="editor-ipi-wrap">
                            <label>IPI total</label>
                            <input class="editor-input" id="editor-ipi" type="number" min="0" step="0.01">
                        </div>
                        <div id="editor-frete-wrap">
                            <label>Frete total</label>
                            <input class="editor-input" id="editor-frete" type="number" min="0" step="0.01">
                        </div>
                        <div id="editor-nf-wrap">
                            <label>Nº NF</label>
                            <input class="editor-input" id="editor-nf" type="text">
                        </div>
                        <div id="editor-requisitante-wrap">
                            <label>Requisitante</label>
                            <input class="editor-input" id="editor-requisitante" type="text">
                        </div>
                        <div id="editor-obra-wrap">
                            <label>Obra</label>
                            <select class="editor-input" id="editor-obra"></select>
                        </div>
                        <div class="editor-full">
                            <label>Observação</label>
                            <input class="editor-input" id="editor-observacao" type="text">
                        </div>
                    </div>
                    <div class="editor-actions">
                        <button type="button" class="editor-btn editor-cancelar" data-editor-fechar>Cancelar</button>
                        <button type="submit" class="editor-btn editor-salvar" id="editor-mov-salvar">Salvar e recalcular tudo</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-editor-fechar]').forEach(el => el.addEventListener('click', fecharModal));
    modal.addEventListener('click', event => {
        if (event.target === modal) fecharModal();
    });
    modal.querySelector('#editor-mov-form').addEventListener('submit', salvarEdicao);

    const total = modal.querySelector('#editor-custo-total');
    const unitario = modal.querySelector('#editor-valor-unitario');
    const qtdCompra = modal.querySelector('#editor-quantidade-compra');
    const icms = modal.querySelector('#editor-icms');
    const ipi = modal.querySelector('#editor-ipi');
    const frete = modal.querySelector('#editor-frete');

    const recalcularTotal = () => {
        if (!movimentoAtual || movimentoAtual.tipo !== 'entrada') return;
        const qtd = numeroPositivo(qtdCompra.value);
        const valor = numero(unitario.value);
        const adicionais = numero(icms.value) + numero(ipi.value) + numero(frete.value);
        total.value = Math.max(0, qtd * valor + adicionais).toFixed(2);
    };
    const recalcularUnitario = () => {
        if (!movimentoAtual || movimentoAtual.tipo !== 'entrada') return;
        const qtd = numeroPositivo(qtdCompra.value);
        if (qtd <= 0) return;
        const adicionais = numero(icms.value) + numero(ipi.value) + numero(frete.value);
        unitario.value = Math.max(0, (numero(total.value) - adicionais) / qtd).toFixed(6);
    };

    [unitario, qtdCompra, icms, ipi, frete].forEach(el => el.addEventListener('input', recalcularTotal));
    total.addEventListener('input', recalcularUnitario);

    return modal;
}

function fecharModal() {
    if (modal) modal.style.display = 'none';
    movimentoAtual = null;
    produtoAtual = null;
}

function mostrarMensagem(msg, tipo = 'aviso') {
    const box = garantirModal().querySelector('#editor-mov-mensagem');
    box.innerHTML = msg ? `<div class="${tipo === 'ok' ? 'editor-ok' : 'editor-aviso'}">${escapeHtml(msg)}</div>` : '';
}

function preencherSubtipos(mov) {
    const select = modal.querySelector('#editor-subtipo');
    select.innerHTML = '';
    const mapa = mov.tipo === 'entrada' ? cache.tiposEntrada : cache.tiposSaida;

    if (mov.tipo === 'reserva' || mov.tipo === 'reserva_cancelada') {
        const atual = cache.tiposSaida[mov.tipo_saidaId];
        const option = document.createElement('option');
        option.value = mov.tipo_saidaId || '';
        option.textContent = atual?.nome || 'Reserva';
        select.appendChild(option);
        select.disabled = true;
        return;
    }

    Object.values(mapa)
        .sort((a, b) => texto(a.nome).localeCompare(texto(b.nome), 'pt-BR'))
        .forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.nome || item.id;
            select.appendChild(option);
        });
    select.value = mov.tipo === 'entrada' ? (mov.tipo_entradaId || '') : (mov.tipo_saidaId || '');
    select.disabled = false;
}

function localKey(localId, locacao) {
    return `${localId || ''}|||${locacao ?? ''}`;
}

function parseLocalKey(valor) {
    if (valor === '__GERAL__') return { tipo: 'geral', localId: '', locacao: '' };
    const [localId = '', locacao = ''] = String(valor || '').split('|||');
    return { tipo: 'locacao', localId, locacao };
}

function resolverLocalMovimento(produto, mov) {
    const locacoes = Array.isArray(produto?.locacoes) ? produto.locacoes : [];
    const locacaoMov = mov?.locacao ?? '';
    const localIdMov = mov?.localId || '';

    if (localIdMov) {
        const exato = locacoes.find(l => l.localId === localIdMov && (l.locacao ?? '') === locacaoMov);
        if (exato) return { tipo: 'locacao', localId: exato.localId || '', locacao: exato.locacao ?? '', ambiguo: false };
    }

    const candidatos = locacoes.filter(l => (l.locacao ?? '') === locacaoMov);
    if (candidatos.length === 1) {
        return { tipo: 'locacao', localId: candidatos[0].localId || '', locacao: candidatos[0].locacao ?? '', ambiguo: false };
    }
    if (candidatos.length > 1) {
        return { tipo: 'locacao', localId: '', locacao: locacaoMov, ambiguo: true };
    }
    if (!locacoes.length || mov?.locacao === undefined || mov?.locacao === null) {
        return { tipo: 'geral', localId: '', locacao: '', ambiguo: false };
    }
    return { tipo: 'locacao', localId: '', locacao: locacaoMov, ambiguo: true };
}

function preencherLocacoes(produto, mov) {
    const select = modal.querySelector('#editor-locacao');
    select.innerHTML = '';
    const locacoes = Array.isArray(produto?.locacoes) ? produto.locacoes : [];
    const atual = resolverLocalMovimento(produto, mov);

    if (!locacoes.length) {
        const opt = document.createElement('option');
        opt.value = '__GERAL__';
        opt.textContent = 'Estoque geral (sem locação)';
        select.appendChild(opt);
        select.value = '__GERAL__';
        return atual;
    }

    locacoes.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = localKey(loc.localId || '', loc.locacao ?? '');
        const nomeLocal = cache.locais[loc.localId]?.nome || loc.localId || 'Local';
        const endereco = loc.locacao ? loc.locacao : '(sem endereçamento)';
        opt.textContent = `${nomeLocal} — ${endereco} — estoque atual: ${numero(loc.estoque).toLocaleString('pt-BR')}`;
        select.appendChild(opt);
    });

    if (!atual.ambiguo) {
        select.value = localKey(atual.localId, atual.locacao);
    } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Selecione a locação correta para este histórico';
        opt.selected = true;
        opt.disabled = true;
        select.prepend(opt);
    }
    return atual;
}

function preencherObras(mov) {
    const select = modal.querySelector('#editor-obra');
    select.innerHTML = '<option value="">Sem obra</option>';
    Object.values(cache.obras)
        .sort((a, b) => texto(a.nome).localeCompare(texto(b.nome), 'pt-BR'))
        .forEach(obra => {
            const opt = document.createElement('option');
            opt.value = obra.id;
            opt.textContent = obra.nome || obra.id;
            select.appendChild(opt);
        });
    select.value = mov.obraId || '';
}

function entradaEhInventario(movOuDados) {
    const id = movOuDados?.tipo_entradaId;
    const tipo = cache.tiposEntrada[id];
    return movOuDados?.ajuste_inventario === true ||
        movOuDados?.preserva_custo_medio === true ||
        normalizarTexto(tipo?.nome) === 'inventario';
}

function efeitoEstoque(mov) {
    if (!mov) return 0;
    if (mov.tipo === 'entrada') {
        return cache.tiposEntrada[mov.tipo_entradaId]?.movimenta_estoque === true ? 1 : 0;
    }
    if (mov.tipo === 'saida') {
        if (mov.reserva_confirmada === true) return -1;
        return cache.tiposSaida[mov.tipo_saidaId]?.movimenta_estoque === true ? -1 : 0;
    }
    return 0;
}

function configurarCamposPorTipo(mov) {
    const entrada = mov.tipo === 'entrada';
    const saidaOuReserva = ['saida', 'reserva', 'reserva_cancelada'].includes(mov.tipo);
    const inventario = entrada && entradaEhInventario(mov);

    ['editor-qtd-compra-wrap','editor-total-wrap','editor-unitario-wrap','editor-icms-wrap','editor-ipi-wrap','editor-frete-wrap','editor-nf-wrap']
        .forEach(id => modal.querySelector(`#${id}`).style.display = entrada ? '' : 'none');
    ['editor-requisitante-wrap','editor-obra-wrap']
        .forEach(id => modal.querySelector(`#${id}`).style.display = saidaOuReserva ? '' : 'none');

    const total = modal.querySelector('#editor-custo-total');
    const unit = modal.querySelector('#editor-valor-unitario');
    const icms = modal.querySelector('#editor-icms');
    const ipi = modal.querySelector('#editor-ipi');
    const frete = modal.querySelector('#editor-frete');
    [total, unit, icms, ipi, frete].forEach(el => el.disabled = inventario);

    if (inventario) {
        mostrarMensagem('Esta é uma entrada de Inventário. O custo é derivado do custo médio vigente e será recalculado automaticamente; os campos financeiros ficam bloqueados para não quebrar a cadeia de custos.');
    } else {
        mostrarMensagem('O tipo principal e o produto não podem ser trocados por segurança. Quantidade, valores, subtipo, locação, NF, obra e observações são reconciliados com as telas dependentes.');
    }
}

async function abrirEditor(mov) {
    await carregarCache(true);
    garantirModal();

    const movSnap = await getDoc(doc(db, 'movimentacoes', mov.id));
    if (!movSnap.exists()) throw new Error('A movimentação não existe mais.');
    movimentoAtual = { id: movSnap.id, ...movSnap.data() };

    if (movimentoAtual.tipo === 'transferencia') {
        throw new Error('Transferências agrupadas não são editadas por este modal, porque possuem origem/destinos encadeados. Corrigir uma transferência isoladamente poderia desbalancear o estoque.');
    }

    produtoAtual = cache.produtos[movimentoAtual.productId];
    if (!produtoAtual) throw new Error('Produto da movimentação não encontrado.');

    modal.querySelector('#editor-produto').value = `${produtoAtual.codigo || ''} - ${produtoAtual.descricao || ''}`;
    modal.querySelector('#editor-tipo').value = tipoVisual(movimentoAtual.tipo);
    modal.querySelector('#editor-quantidade').value = numeroPositivo(movimentoAtual.quantidade) || '';
    modal.querySelector('#editor-quantidade-compra').value = numeroPositivo(movimentoAtual.quantidade_compra) || numeroPositivo(movimentoAtual.quantidade) || '';
    modal.querySelector('#editor-valor-unitario').value = numero(movimentoAtual.valor_unitario) || 0;
    modal.querySelector('#editor-icms').value = numero(movimentoAtual.icms) || 0;
    modal.querySelector('#editor-ipi').value = numero(movimentoAtual.ipi) || 0;
    modal.querySelector('#editor-frete').value = numero(movimentoAtual.frete) || 0;
    const qtdCompra = numeroPositivo(movimentoAtual.quantidade_compra) || numeroPositivo(movimentoAtual.quantidade);
    const custoTotalSalvo = numeroPositivo(movimentoAtual.custo_total_entrada);
    const custoCalculado = qtdCompra * numero(movimentoAtual.valor_unitario) + numero(movimentoAtual.icms) + numero(movimentoAtual.ipi) + numero(movimentoAtual.frete);
    modal.querySelector('#editor-custo-total').value = (custoTotalSalvo || custoCalculado || 0).toFixed(2);
    modal.querySelector('#editor-nf').value = movimentoAtual.nf || '';
    modal.querySelector('#editor-requisitante').value = movimentoAtual.requisitante || '';
    modal.querySelector('#editor-observacao').value = movimentoAtual.observacao || '';

    preencherSubtipos(movimentoAtual);
    const localAtual = preencherLocacoes(produtoAtual, movimentoAtual);
    preencherObras(movimentoAtual);
    configurarCamposPorTipo(movimentoAtual);

    const resumo = modal.querySelector('#editor-mov-resumo');
    resumo.innerHTML = `<strong>${escapeHtml(formatarDataMovimento(movimentoAtual))}</strong><br>${escapeHtml(tipoVisual(movimentoAtual.tipo))} · ID ${escapeHtml(movimentoAtual.id)}${localAtual.ambiguo ? '<br><span style="color:#b45309">A locação histórica é ambígua; selecione a correta antes de alterar quantidade ou locação.</span>' : ''}`;

    modal.style.display = 'block';
}

function localizarProdutoPorCodigo(codigo) {
    const alvo = texto(codigo).toLowerCase();
    return Object.values(cache.produtos).find(p => texto(p.codigo).toLowerCase() === alvo) || null;
}

function campoTexto(row, indice) {
    return texto(row.cells?.[indice]?.textContent);
}

async function identificarMovimentoDaLinha(row) {
    await carregarCache();
    const codigo = campoTexto(row, 3);
    const produto = localizarProdutoPorCodigo(codigo);
    if (!produto) throw new Error(`Produto ${codigo || '(sem código)'} não encontrado.`);

    const snap = await getDocs(query(collection(db, 'movimentacoes'), where('productId', '==', produto.id)));
    const movimentos = snap.docs.map(item => ({ id: item.id, ...item.data() }));
    const tipoLinha = campoTexto(row, 1).toUpperCase();
    const dataLinha = campoTexto(row, 0);
    const nfLinha = campoTexto(row, 7);
    const reqLinha = campoTexto(row, 15);
    const obraLinha = campoTexto(row, 16);
    const obsLinha = campoTexto(row, 17);

    let candidatos = movimentos.filter(m => tipoVisual(m.tipo) === tipoLinha && formatarDataMovimento(m) === dataLinha);
    if (!candidatos.length) {
        candidatos = movimentos.filter(m => tipoVisual(m.tipo) === tipoLinha);
    }

    const refinar = (lista, predicado) => {
        const filtrados = lista.filter(predicado);
        return filtrados.length ? filtrados : lista;
    };

    if (nfLinha && nfLinha !== '-') candidatos = refinar(candidatos, m => texto(m.nf) === nfLinha);
    if (reqLinha && reqLinha !== '-') candidatos = refinar(candidatos, m => texto(m.requisitante) === reqLinha);
    if (obraLinha && obraLinha !== '-') candidatos = refinar(candidatos, m => texto(cache.obras[m.obraId]?.nome) === obraLinha);
    if (obsLinha && obsLinha !== '-') candidatos = refinar(candidatos, m => texto(m.observacao) === obsLinha);

    if (candidatos.length === 1) return candidatos[0];
    if (!candidatos.length) throw new Error('Não foi possível localizar a movimentação correspondente a esta linha.');

    const qtdTexto = campoTexto(row, 6);
    const qtdNumeros = qtdTexto.match(/[\d.,]+/g) || [];
    const qtdPrimeira = numero(qtdNumeros[0]);
    if (qtdPrimeira > 0) {
        const porQtd = candidatos.filter(m => quaseIgual(m.quantidade_compra || m.quantidade, qtdPrimeira, 1e-3));
        if (porQtd.length === 1) return porQtd[0];
    }

    throw new Error(`Foram encontradas ${candidatos.length} movimentações muito parecidas. Refine os filtros (por NF, data ou observação) e clique novamente.`);
}

function aplicarDeltaEstoque(produtoData, local, delta) {
    if (Math.abs(delta) <= EPSILON) return;

    if (local.tipo === 'geral') {
        const atual = numero(produtoData.estoque);
        const novo = atual + delta;
        if (novo < -EPSILON) throw new Error(`A correção deixaria o estoque geral negativo (${novo.toFixed(3)}). Ajuste a quantidade/locação antes de salvar.`);
        produtoData.estoque = Math.max(0, novo);
        return;
    }

    const locacoes = Array.isArray(produtoData.locacoes) ? produtoData.locacoes : [];
    let indice = -1;
    if (local.localId) {
        indice = locacoes.findIndex(l => l.localId === local.localId && (l.locacao ?? '') === (local.locacao ?? ''));
    }
    if (indice === -1) {
        const candidatos = locacoes
            .map((l, i) => ({ l, i }))
            .filter(item => (item.l.locacao ?? '') === (local.locacao ?? ''));
        if (candidatos.length === 1) indice = candidatos[0].i;
    }
    if (indice === -1) throw new Error(`Não foi possível reconciliar a locação "${local.locacao || '(vazia)'}" no cadastro atual do produto.`);

    const atual = numero(locacoes[indice].estoque);
    const novo = atual + delta;
    if (novo < -EPSILON) throw new Error(`A correção deixaria a locação ${local.locacao || '(sem endereçamento)'} com estoque negativo (${novo.toFixed(3)}).`);
    locacoes[indice].estoque = Math.max(0, novo);
    produtoData.locacoes = locacoes;
}

function snapshotEdicao(mov) {
    return {
        tipo: mov.tipo || '',
        tipo_entradaId: mov.tipo_entradaId || '',
        tipo_saidaId: mov.tipo_saidaId || '',
        productId: mov.productId || '',
        locacao: mov.locacao ?? '',
        localId: mov.localId || '',
        quantidade: numero(mov.quantidade),
        quantidade_compra: numero(mov.quantidade_compra),
        valor_unitario: numero(mov.valor_unitario),
        icms: numero(mov.icms),
        ipi: numero(mov.ipi),
        frete: numero(mov.frete),
        custo_total_entrada: numero(mov.custo_total_entrada),
        valorMedioHistorico: numero(mov.valorMedioHistorico),
        custoTotal: numero(mov.custoTotal),
        nf: mov.nf || '',
        requisitante: mov.requisitante || '',
        obraId: mov.obraId || '',
        observacao: mov.observacao || ''
    };
}

function camposDoFormulario(mov) {
    const quantidade = numeroPositivo(modal.querySelector('#editor-quantidade').value);
    if (quantidade <= 0) throw new Error('A quantidade precisa ser maior que zero.');

    const selecionado = parseLocalKey(modal.querySelector('#editor-locacao').value);
    if (!modal.querySelector('#editor-locacao').value) throw new Error('Selecione a locação correta.');

    if (mov.tipo === 'entrada') {
        const quantidadeCompra = numeroPositivo(modal.querySelector('#editor-quantidade-compra').value) || quantidade;
        const icms = numero(modal.querySelector('#editor-icms').value);
        const ipi = numero(modal.querySelector('#editor-ipi').value);
        const frete = numero(modal.querySelector('#editor-frete').value);
        const custoTotal = numero(modal.querySelector('#editor-custo-total').value);
        const valorUnitario = entradaEhInventario({ ...mov, tipo_entradaId: modal.querySelector('#editor-subtipo').value })
            ? numero(mov.valor_unitario)
            : numero(modal.querySelector('#editor-valor-unitario').value);
        if (!entradaEhInventario({ ...mov, tipo_entradaId: modal.querySelector('#editor-subtipo').value }) && custoTotal < 0) {
            throw new Error('O custo total não pode ser negativo.');
        }
        return {
            quantidade,
            quantidade_compra: quantidadeCompra,
            tipo_entradaId: modal.querySelector('#editor-subtipo').value,
            locacao: selecionado.locacao,
            localId: selecionado.localId,
            valor_unitario: valorUnitario,
            icms,
            ipi,
            frete,
            custo_total_entrada: entradaEhInventario({ ...mov, tipo_entradaId: modal.querySelector('#editor-subtipo').value })
                ? numero(mov.custo_total_entrada)
                : custoTotal,
            nf: modal.querySelector('#editor-nf').value.trim(),
            observacao: modal.querySelector('#editor-observacao').value.trim()
        };
    }

    return {
        quantidade,
        tipo_saidaId: modal.querySelector('#editor-subtipo').value || mov.tipo_saidaId || '',
        locacao: selecionado.locacao,
        localId: selecionado.localId,
        requisitante: modal.querySelector('#editor-requisitante').value.trim(),
        obraId: modal.querySelector('#editor-obra').value,
        observacao: modal.querySelector('#editor-observacao').value.trim()
    };
}

async function reconciliarEdicao(movId, novosDados) {
    const movRef = doc(db, 'movimentacoes', movId);
    let productId = null;

    await runTransaction(db, async transaction => {
        const movSnap = await transaction.get(movRef);
        if (!movSnap.exists()) throw new Error('A movimentação foi removida por outro usuário.');
        const atual = { id: movSnap.id, ...movSnap.data() };
        if (atual.tipo === 'transferencia') throw new Error('Transferências não podem ser editadas por este modal.');
        if (atual.productId !== movimentoAtual.productId || atual.tipo !== movimentoAtual.tipo) {
            throw new Error('A movimentação foi alterada por outro usuário. Reabra o editor e tente novamente.');
        }

        productId = atual.productId;
        const productRef = doc(db, 'produtos', productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error('Produto não encontrado.');
        const productData = { ...productSnap.data() };
        if (Array.isArray(productData.locacoes)) {
            productData.locacoes = productData.locacoes.map(l => ({ ...l }));
        }

        const antigoLocal = resolverLocalMovimento(productData, atual);
        const novoLocal = novosDados.localId || novosDados.locacao !== undefined
            ? { tipo: Array.isArray(productData.locacoes) && productData.locacoes.length ? 'locacao' : 'geral', localId: novosDados.localId || '', locacao: novosDados.locacao ?? '' }
            : antigoLocal;

        const movNovo = { ...atual, ...novosDados };
        const efeitoAntigo = efeitoEstoque(atual);
        const efeitoNovo = efeitoEstoque(movNovo);
        const qtdAntiga = numeroPositivo(atual.quantidade);
        const qtdNova = numeroPositivo(novosDados.quantidade);
        const mexeEstoque = efeitoAntigo !== 0 || efeitoNovo !== 0;
        const localMudou = antigoLocal.tipo !== novoLocal.tipo || antigoLocal.localId !== novoLocal.localId || antigoLocal.locacao !== novoLocal.locacao;
        const qtdMudou = !quaseIgual(qtdAntiga, qtdNova);
        const efeitoMudou = efeitoAntigo !== efeitoNovo;

        if (mexeEstoque && (qtdMudou || localMudou || efeitoMudou) && antigoLocal.ambiguo) {
            throw new Error('A locação original desta movimentação é ambígua no cadastro atual. Não é seguro alterar quantidade, subtipo ou locação sem identificar a origem exata.');
        }

        if (mexeEstoque && (qtdMudou || localMudou || efeitoMudou)) {
            aplicarDeltaEstoque(productData, antigoLocal, -efeitoAntigo * qtdAntiga);
            aplicarDeltaEstoque(productData, novoLocal, efeitoNovo * qtdNova);
            const updateProduto = {};
            if (Array.isArray(productData.locacoes)) updateProduto.locacoes = productData.locacoes;
            if (productData.estoque !== undefined) updateProduto.estoque = productData.estoque;
            transaction.update(productRef, updateProduto);
        }

        const antes = snapshotEdicao(atual);
        const depoisPrevisto = snapshotEdicao({ ...atual, ...novosDados });
        transaction.update(movRef, {
            ...novosDados,
            editadoEm: serverTimestamp(),
            editadoPorEditorIntegrado: true
        });

        const auditoriaRef = doc(collection(db, 'movimentacoes_edicoes'));
        transaction.set(auditoriaRef, {
            movimentacaoId: movId,
            productId,
            data: serverTimestamp(),
            antes,
            depois: depoisPrevisto
        });
    });

    return productId;
}

async function recalcularCadeiaProduto(productId) {
    await carregarCache(true);
    const [produtoSnap, movimentosSnap] = await Promise.all([
        getDoc(doc(db, 'produtos', productId)),
        getDocs(query(collection(db, 'movimentacoes'), where('productId', '==', productId)))
    ]);
    if (!produtoSnap.exists()) throw new Error('Produto não encontrado durante o recálculo.');

    const produto = produtoSnap.data();
    const movimentos = movimentosSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    movimentos.sort((a, b) => obterTimestampMillis(obterDataEfetivaMovimento(a)) - obterTimestampMillis(obterDataEfetivaMovimento(b)));

    let quantidade = 0;
    let valorEstoque = 0;
    let custoMedio = 0;
    let ultimoCustoValido = numeroPositivo(produto.valorMedio);
    const correcoes = [];

    for (const mov of movimentos) {
        const qtd = numeroPositivo(mov.quantidade);
        if (qtd <= 0) continue;

        if (mov.tipo === 'entrada') {
            let custoEntrada = 0;
            if (entradaEhInventario(mov)) {
                const herdado = custoMedio || ultimoCustoValido || numeroPositivo(mov.valorMedioHistorico) || numeroPositivo(mov.valor_unitario);
                custoEntrada = qtd * herdado;
                if (herdado > 0) {
                    correcoes.push({
                        id: mov.id,
                        dados: {
                            quantidade_compra: qtd,
                            valor_unitario: herdado,
                            valorMedioHistorico: herdado,
                            custo_total_entrada: custoEntrada,
                            custoRecalculadoPorEdicao: true
                        }
                    });
                }
            } else {
                const salvo = numeroPositivo(mov.custo_total_entrada);
                const qtdCompra = numeroPositivo(mov.quantidade_compra) || qtd;
                const calculado = qtdCompra * numero(mov.valor_unitario) + numero(mov.icms) + numero(mov.ipi) + numero(mov.frete);
                custoEntrada = salvo || Math.max(0, calculado);
            }

            quantidade += qtd;
            valorEstoque += custoEntrada;
            if (quantidade > EPSILON) {
                custoMedio = Math.max(0, valorEstoque / quantidade);
                if (custoMedio > 0) ultimoCustoValido = custoMedio;
            }
        } else if (mov.tipo === 'saida') {
            const custoAntes = quantidade > EPSILON ? Math.max(0, valorEstoque / quantidade) : (custoMedio || ultimoCustoValido || numeroPositivo(mov.valorMedioHistorico));
            const custoTotal = qtd * custoAntes;
            correcoes.push({
                id: mov.id,
                dados: {
                    valorMedioHistorico: custoAntes,
                    custoTotal,
                    custoRecalculadoPorEdicao: true
                }
            });
            if (quantidade > EPSILON) {
                valorEstoque -= custoTotal;
                quantidade -= qtd;
            } else {
                quantidade -= qtd;
            }
            if (quantidade > EPSILON) {
                valorEstoque = Math.max(0, valorEstoque);
                custoMedio = valorEstoque / quantidade;
                if (custoMedio > 0) ultimoCustoValido = custoMedio;
            } else if (Math.abs(quantidade) <= EPSILON) {
                quantidade = 0;
                valorEstoque = 0;
                custoMedio = ultimoCustoValido;
            }
        } else if (mov.tipo === 'reserva') {
            const custoReserva = quantidade > EPSILON ? Math.max(0, valorEstoque / quantidade) : (custoMedio || ultimoCustoValido || numeroPositivo(mov.valorMedioHistorico));
            if (custoReserva > 0) {
                correcoes.push({
                    id: mov.id,
                    dados: {
                        valorMedioHistorico: custoReserva,
                        custoTotal: qtd * custoReserva,
                        custoRecalculadoPorEdicao: true
                    }
                });
            }
        }
    }

    const custoFinal = quantidade > EPSILON
        ? Math.max(0, valorEstoque / quantidade)
        : (ultimoCustoValido || numeroPositivo(produto.valorMedio));

    for (let i = 0; i < correcoes.length; i += 400) {
        const lote = writeBatch(db);
        correcoes.slice(i, i + 400).forEach(item => {
            lote.update(doc(db, 'movimentacoes', item.id), item.dados);
        });
        await lote.commit();
    }

    const produtoBatch = writeBatch(db);
    produtoBatch.update(doc(db, 'produtos', productId), {
        valorMedio: custoFinal,
        custoMedioRecalculadoEm: new Date().toISOString(),
        custoMedioRecalculadoPorEdicao: true
    });
    await produtoBatch.commit();

    return { custoFinal, movimentosRecalculados: correcoes.length };
}

async function salvarEdicao(event) {
    event.preventDefault();
    if (!movimentoAtual) return;
    const botao = modal.querySelector('#editor-mov-salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando e recalculando...';
    mostrarMensagem('Aplicando alteração e recalculando a cadeia de custos. Não feche esta janela.');

    try {
        await carregarCache(true);
        const dados = camposDoFormulario(movimentoAtual);
        const productId = await reconciliarEdicao(movimentoAtual.id, dados);
        const resultado = await recalcularCadeiaProduto(productId);
        await carregarCache(true);
        mostrarMensagem(`Correção concluída. Custo médio atual: ${resultado.custoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}. ${resultado.movimentosRecalculados} movimentação(ões) dependente(s) foi/foram reconciliada(s).`, 'ok');
        botao.textContent = 'Concluído';
        setTimeout(fecharModal, 1400);
    } catch (error) {
        console.error('[Editor de movimentação] Falha:', error);
        mostrarMensagem(`Não foi possível concluir a edição: ${error.message}`);
        botao.disabled = false;
        botao.textContent = 'Salvar e recalcular tudo';
    }
}

function prepararTabela() {
    const tabela = document.getElementById('table-movimentacoes');
    if (!tabela) return false;
    const tbody = tabela.querySelector('tbody');
    if (!tbody || tbody.dataset.editorMovimentacaoLigado === '1') return true;

    tbody.dataset.editorMovimentacaoLigado = '1';
    tbody.addEventListener('click', async event => {
        const row = event.target.closest('tr');
        if (!row || !tbody.contains(row)) return;
        if (event.target.closest('button, a, input, select, textarea')) return;
        try {
            const mov = await identificarMovimentoDaLinha(row);
            await abrirEditor(mov);
        } catch (error) {
            console.error('[Editor de movimentação] Identificação:', error);
            alert(error.message);
        }
    });

    const marcar = () => {
        tbody.querySelectorAll('tr').forEach(row => {
            if (row.cells.length >= 10) {
                row.dataset.editavelMov = '1';
                row.title = 'Clique para editar esta movimentação';
            }
        });
    };
    marcar();
    new MutationObserver(marcar).observe(tbody, { childList: true });
    return true;
}

function iniciar() {
    instalarEstilo();
    if (prepararTabela()) return;
    const observer = new MutationObserver(() => {
        if (prepararTabela()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
}

iniciar();
