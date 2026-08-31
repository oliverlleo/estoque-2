import { db } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Sistema de Controle de Estoque iniciado.");

    // O editor integrado só é carregado na tela de Movimentações.
    // Ele trabalha sobre os mesmos documentos do Firestore e reconcilia
    // estoque/custos derivados sem duplicar a lógica nas demais páginas.
    if (document.getElementById('table-movimentacoes')) {
        try {
            await import('./editar-movimentacao.js');
        } catch (error) {
            console.error('Falha ao carregar o editor integrado de movimentações:', error);
        }
    }
});
