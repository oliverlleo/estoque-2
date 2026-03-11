import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const obrasContainer = document.getElementById('obras-container');
    const modal = document.getElementById('valor-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    const modalForm = document.getElementById('modal-form');
    const closeButton = document.querySelector('.close-button');

    let currentObraId = null;
    let currentField = '';
    let grupos = [];

    async function carregarGrupos() {
        const gruposSnap = await getDocs(collection(db, 'grupos'));
        grupos = gruposSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    function openModal(obraId, field, title, valores) {
        currentObraId = obraId;
        currentField = field;
        modalTitle.textContent = title;
        modalFields.innerHTML = '';

        grupos.forEach(grupo => {
            const valor = valores[grupo.id] || '';
            modalFields.innerHTML += `
                <div>
                    <label>${grupo.nome}</label>
                    <input type="text" data-grupo-id="${grupo.id}" value="${String(valor).replace('.', ',')}" class="form-control">
                </div>
            `;
        });

        modal.style.display = 'block';
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    closeButton.onclick = closeModal;
    window.onclick = function(event) {
        if (event.target == modal) {
            closeModal();
        }
    }

    modalForm.onsubmit = async function(event) {
        event.preventDefault();
        const inputs = modalFields.querySelectorAll('input[type="text"]');
        const valores = {};
        let total = 0;
        inputs.forEach(input => {
            const valor = parseFloat(input.value.replace(',', '.')) || 0;
            valores[input.dataset.grupoId] = valor;
            total += valor;
        });

        const obraRef = doc(db, 'obras', currentObraId);
        await updateDoc(obraRef, {
            [currentField]: valores
        });

        closeModal();
        carregarDadosObras();
    }

    async function carregarDadosObras() {
        if (!obrasContainer) return;

        obrasContainer.innerHTML = '<p>Calculando custos, por favor aguarde...</p>';

        try {
            await carregarGrupos();
            const [obrasSnap, movementsSnap] = await Promise.all([
                getDocs(collection(db, 'obras')),
                getDocs(collection(db, 'movimentacoes'))
            ]);

            const custosPorObra = new Map();
            movementsSnap.forEach(movDoc => {
                const mov = movDoc.data();
                if (mov.tipo === 'saida' && mov.obraId) {
                    const custoMovimentacao = (mov.quantidade || 0) * (mov.valorMedioHistorico || 0);
                    const custoAtual = custosPorObra.get(mov.obraId) || 0;
                    custosPorObra.set(mov.obraId, custoAtual + custoMovimentacao);
                }
            });

            obrasContainer.innerHTML = '';
            obrasSnap.forEach(obraDoc => {
                const obra = obraDoc.data();
                const obraId = obraDoc.id;
                const custoTotal = custosPorObra.get(obraId) || 0;

                const orcadoTotal = obra.orcado ? Object.values(obra.orcado).reduce((a, b) => a + b, 0) : 0;
                const negociadoTotal = obra.negociado ? Object.values(obra.negociado).reduce((a, b) => a + b, 0) : 0;
                const vendidoTotal = obra.vendido ? Object.values(obra.vendido).reduce((a, b) => a + b, 0) : 0;

                const card = document.createElement('div');
                card.className = 'obra-card';

                card.innerHTML = `
                    <h4>${obra.nome}</h4>
                    <p><strong>Código:</strong> ${obra.codigo || 'N/A'}</p>
                    <div class="obra-custo">
                        ${custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <div class="valor-coluna" data-field="orcado">
                        <strong>Orçado:</strong> ${orcadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <div class="valor-coluna" data-field="negociado">
                        <strong>Negociado:</strong> ${negociadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <div class="valor-coluna" data-field="vendido">
                        <strong>Vendido:</strong> ${vendidoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <a href="detalhe-obra.html?id=${obraId}" class="btn-ver-mais">Ver mais</a>
                `;

                card.querySelector('[data-field="orcado"]').onclick = () => openModal(obraId, 'orcado', 'Orçado', obra.orcado || {});
                card.querySelector('[data-field="negociado"]').onclick = () => openModal(obraId, 'negociado', 'Negociado', obra.negociado || {});
                card.querySelector('[data-field="vendido"]').onclick = () => openModal(obraId, 'vendido', 'Vendido', obra.vendido || {});

                obrasContainer.appendChild(card);
            });

            if (obrasSnap.empty) {
                obrasContainer.innerHTML = '<p>Nenhuma obra cadastrada.</p>';
            }

        } catch (error) {
            console.error("Erro ao carregar e calcular custos das obras:", error);
            obrasContainer.innerHTML = '<p style="color: red;">Erro ao carregar os dados. Verifique o console.</p>';
        }
    }

    carregarDadosObras();
});
