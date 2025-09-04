import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', function() {
    console.log("Sistema de Controle de Estoque iniciado.");

    // A lógica a seguir só deve ser executada na página do dashboard (index.html)
    if (document.querySelector('#alertas-container')) {
        verificarEstoqueBaixo();
    }
});

async function verificarEstoqueBaixo() {
    const alertasContainer = document.getElementById('alertas-container');
    if (!alertasContainer) return;

    try {
        const q = query(collection(db, 'produtos'), where("arquivado", "!=", true));
        const querySnapshot = await getDocs(q);

        let alertasHtml = '';
        let temAlerta = false;

        querySnapshot.forEach(doc => {
            const produto = doc.data();
            const id = doc.id;

            // Pula produtos que não têm uma quantidade mínima definida ou que seja zero
            if (!produto.quantidadeMinima || produto.quantidadeMinima <= 0) {
                return;
            }

            // Calcula o estoque total somando o estoque de todas as locações
            const estoqueTotal = (produto.locacoes || []).reduce((acc, loc) => acc + (loc.estoque || 0), 0);

            if (estoqueTotal <= produto.quantidadeMinima) {
                temAlerta = true;
                alertasHtml += `
                    <div class="alerta-estoque">
                        <i data-feather="alert-triangle" class="alerta-icone"></i>
                        <div class="alerta-texto">
                            <strong>Estoque Baixo:</strong> O produto
                            <a href="detalhe-produto.html?id=${id}" target="_blank">
                                ${produto.codigo} - ${produto.descricao}
                            </a>
                            está com apenas ${estoqueTotal} unidade(s) em estoque (mínimo: ${produto.quantidadeMinima}).
                        </div>
                    </div>
                `;
            }
        });

        if (temAlerta) {
            alertasContainer.innerHTML = `<h3><i data-feather="bell"></i> Alertas do Sistema</h3>` + alertasHtml;
            // O Feather Icons precisa ser reiniciado para renderizar os novos ícones
            feather.replace();
        } else {
            alertasContainer.innerHTML = ''; // Limpa o container se não houver alertas
        }

    } catch (error) {
        console.error("Erro ao verificar estoque baixo:", error);
        alertasContainer.innerHTML = '<div class="alerta-estoque erro">Erro ao carregar alertas de estoque.</div>';
    }
}
