import { db } from './firebase-config.js';
import { instalarProtecaoImportacaoNFe } from './nfe-import-guard.js';

document.addEventListener('DOMContentLoaded', function() {
    console.log("Sistema de Controle de Estoque iniciado.");
    instalarProtecaoImportacaoNFe();
    // Lógica comum a todas as páginas, como manipulação do menu, pode ser adicionada aqui.
});
