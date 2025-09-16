import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // Envolvemos a lógica principal em uma função async auto-executável
    (async function carregarDadosObras() {
        const obrasContainer = document.getElementById('obras-container');
        if (!obrasContainer) return;

        obrasContainer.innerHTML = '<p>Calculando custos, por favor aguarde...</p>';

        try {
            // 1. Usamos Promise.all para buscar todas as coleções em paralelo.
            // A execução só continua quando TODAS as buscas terminarem.
            const [obrasSnap, movementsSnap] = await Promise.all([
                getDocs(collection(db, 'obras')),
                getDocs(collection(db, 'movimentacoes'))
            ]);

            // 2. Calculamos o custo total para cada obra usando o valor histórico.
            const custosPorObra = new Map();
            movementsSnap.forEach(movDoc => {
                const mov = movDoc.data();
                if (mov.tipo === 'saida' && mov.obraId) {
                    const custoMovimentacao = (mov.quantidade || 0) * (mov.valorMedioHistorico || 0);
                    const custoAtual = custosPorObra.get(mov.obraId) || 0;
                    custosPorObra.set(mov.obraId, custoAtual + custoMovimentacao);
                }
            });

            // 4. Renderizamos os cards com os dados calculados.
            obrasContainer.innerHTML = ''; // Limpa a mensagem de "carregando"
            obrasSnap.forEach(obraDoc => {
                const obra = obraDoc.data();
                const obraId = obraDoc.id;
                const custoTotal = custosPorObra.get(obraId) || 0;

                const card = document.createElement('div');
                card.className = 'obra-card'; // Adicione estilos para esta classe em style.css

                card.innerHTML = `
                    <h4>${obra.nome}</h4>
                    <p><strong>Código:</strong> ${obra.codigo || 'N/A'}</p>
                    <div class="obra-custo">
                        ${custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <a href="detalhe-obra.html?id=${obraId}" class="btn-ver-mais">Ver mais</a>
                `;
                obrasContainer.appendChild(card);
            });

            if (obrasSnap.empty) {
                obrasContainer.innerHTML = '<p>Nenhuma obra cadastrada.</p>';
            }

        } catch (error) {
            console.error("Erro ao carregar e calcular custos das obras:", error);
            obrasContainer.innerHTML = '<p style="color: red;">Erro ao carregar os dados. Verifique o console.</p>';
        }
    })();
});
