import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, setDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Etiquetas de Locação carregada.");

    const selectLocal = document.getElementById('select-local');
    const inputLocacao = document.getElementById('input-locacao');
    const btnGerar = document.getElementById('btn-gerar');
    const container = document.getElementById('etiquetas-container');

    let configData = {
        locais: {}
    };

    // Lista para armazenar dados de produtos/locações carregados
    let allProductLocacoes = [];

    async function loadData() {
        // Carrega Locais (Depósitos)
        const locaisSnapshot = await getDocs(collection(db, 'locais'));
        selectLocal.innerHTML = '<option value="">Selecione um Local...</option>';
        locaisSnapshot.forEach(doc => {
            configData.locais[doc.id] = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().nome;
            selectLocal.appendChild(option);
        });

        // Precisamos coletar todas as "Locações" (Endereços) únicas existentes no sistema.
        // Como o sistema não tem uma coleção central de "Endereços", vamos iterar sobre os produtos.
        const productsSnapshot = await getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true)));

        allProductLocacoes = [];
        const uniqueKeys = new Set();

        productsSnapshot.forEach(doc => {
            const prod = doc.data();
            if(prod.locacoes && Array.isArray(prod.locacoes)) {
                prod.locacoes.forEach(loc => {
                    const localId = loc.localId;
                    const locacaoStr = (loc.locacao || '').trim();

                    if(locacaoStr) { // Só queremos etiquetas para endereços físicos
                         const key = `${localId}::${locacaoStr}`;
                         if(!uniqueKeys.has(key)) {
                             uniqueKeys.add(key);
                             allProductLocacoes.push({
                                 localId: localId,
                                 localNome: configData.locais[localId]?.nome || 'Desconhecido',
                                 locacao: locacaoStr
                             });
                         }
                    }
                });
            }
        });

        // Ordenar
        allProductLocacoes.sort((a, b) => {
            if(a.localNome < b.localNome) return -1;
            if(a.localNome > b.localNome) return 1;
            return a.locacao.localeCompare(b.locacao);
        });

        console.log(`Carregadas ${allProductLocacoes.length} locações únicas.`);
    }

    // --- Short ID Management ---
    // Como não existe coleção de locações, vamos criar/usar uma 'locacoes_enderecos' para persistir os Short IDs.

    async function getOrGenerateShortId(localId, locacaoStr) {
        // Normaliza ID do documento: localId + sanitized locacao
        const docId = `${localId}_${locacaoStr.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const docRef = doc(db, 'locacoes_enderecos', docId);

        // Tenta ler
        // Nota: Como estamos em um script frontend sem 'getDoc' importado explicitamente no topo, vou usar getDocs com query ou adicionar getDoc.
        // Adicionando getDoc na importação dinamicamente se necessário, mas vou usar setDoc com merge se não existir.
        // Melhor: Tentar ler de uma cache local ou consultar.

        // Para simplificar e evitar leitura individual n+1 se for muitos, o ideal seria carregar tudo.
        // Mas vamos fazer sob demanda no "Gerar".

        // Precisamos importar getDoc. Vou usar a importação existente.
        // A importação no topo deve ter getDoc. Vou verificar se inclui.
        // Inclui 'doc' mas não 'getDoc'. Vou usar o modulo global firebase-firestore se possível ou assumir que o usuario vai clicar em gerar e podemos fazer requests.
    }

    // Função auxiliar para gerar string aleatória curta
    function generateRandomShortId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async function processAndRenderEtiquetas() {
        container.innerHTML = 'Gerando etiquetas...';

        const selectedLocalId = selectLocal.value;
        const filterText = inputLocacao.value.toLowerCase().trim();

        // Filtrar a lista em memória
        const filtered = allProductLocacoes.filter(item => {
            if(selectedLocalId && item.localId !== selectedLocalId) return false;
            if(filterText && !item.locacao.toLowerCase().includes(filterText)) return false;
            return true;
        });

        if(filtered.length === 0) {
            container.innerHTML = 'Nenhuma locação encontrada com os filtros selecionados.';
            return;
        }

        container.innerHTML = ''; // Limpa

        // Import dinâmico de getDoc/setDoc se precisar, mas vou confiar que estão disponíveis ou carregar via module
        const { getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");

        for(const item of filtered) {
             const docId = `${item.localId}_${item.locacao.replace(/[^a-zA-Z0-9]/g, '_')}`;
             const docRef = doc(db, 'locacoes_enderecos', docId);

             let shortId = null;

             try {
                 const snap = await getDoc(docRef);
                 if(snap.exists() && snap.data().short_id) {
                     shortId = snap.data().short_id;
                 } else {
                     // Gera novo
                     shortId = generateRandomShortId();
                     // Salva (com merge true para não perder outros dados se houver)
                     await setDoc(docRef, {
                         localId: item.localId,
                         locacao: item.locacao,
                         short_id: shortId,
                         created_at: new Date()
                     }, { merge: true });
                 }
             } catch (e) {
                 console.error("Erro ao gerenciar Short ID", e);
                 shortId = "ERR";
             }

             // Renderizar Etiqueta
             const div = document.createElement('div');
             div.className = 'etiqueta-locacao';

             // Base URL para QR Code
             // Usando path relativo para scan_location.html
             const qrUrl = `${window.location.origin}${window.location.pathname.replace('etiquetas-locacao.html', '')}scan_location.html?q=${shortId}`;

             div.innerHTML = `
                <div class="etiqueta-content">
                    <div class="qr-area" id="qr-${docId}"></div>
                    <div class="text-area">
                        <div class="rotated-text-container">
                            <span class="codigo-locacao-text">${item.locacao}</span>
                            <span class="nome-local-text">${item.localNome}</span>
                        </div>
                    </div>
                </div>
             `;

             container.appendChild(div);

             // Gerar QR Code
             new QRCode(document.getElementById(`qr-${docId}`), {
                text: qrUrl,
                width: 128,
                height: 128,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }
    }

    btnGerar.addEventListener('click', processAndRenderEtiquetas);

    loadData().catch(e => console.error("Erro inicial", e));

});
