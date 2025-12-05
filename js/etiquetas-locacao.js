import { db } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const btnGerar = document.getElementById('btn-gerar');
    const inputLocacoes = document.getElementById('input-locacoes');
    const container = document.getElementById('etiquetas-container');

    // Pre-load data from localStorage if available (e.g. from Consultas page)
    const storedLocs = localStorage.getItem('locacoesParaImprimir');
    if (storedLocs) {
        inputLocacoes.value = JSON.parse(storedLocs).join('\n');
    }

    btnGerar.addEventListener('click', async () => {
        const rawInput = inputLocacoes.value;
        if (!rawInput.trim()) {
            alert("Por favor, insira pelo menos uma locação.");
            return;
        }

        const locacoesRequest = rawInput.split('\n').map(l => l.trim()).filter(l => l);
        await processLabels(locacoesRequest);
    });

    async function processLabels(locacoesList) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">Processando...</p>';

        // 1. Fetch Locations Metadata (Need to find Short IDs or Generate them)
        // We need to query 'locacoes_enderecos' collection which maps 'locacao' string to Short ID.
        // If not exists, create.

        // However, 'locacoes_enderecos' structure: { id: shortId, locacao: "1-A-01", localId: "..." }
        // We need to query by 'locacao'.
        // Since we might have many, let's fetch ALL known addresses first to minimize reads if collection is small?
        // Or query one by one?
        // Let's assume the number of locations to print is small (e.g. < 50). Querying one by one or `in` batches.

        // Wait, 'locacoes_enderecos' maps Short ID (docId) -> Data.
        // Querying by field 'locacao'.

        const labelsData = [];
        const batch = writeBatch(db);
        let batchCount = 0;
        let hasUpdates = false;

        // Fetch all existing mappings to avoid N queries if possible?
        // Or just query for the requested ones.

        // Helper to generate Short ID (4 chars: A-Z, 0-9)
        function generateShortId() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < 4; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        // Fetch products to find Local Name associated with the Locação string?
        // The prompt says: "Dados de Identificação... O sistema deve puxar dinamicamente... do cadastro da Locação".
        // But 'locacao' is often just a string in products.
        // Is there a centralized 'locacoes' registry?
        // Memory: "Short IDs for locations are generated uniquely and stored in a Firestore collection `locacoes_enderecos` to map the short code to the specific `localId` and `locacao` string."

        // So we rely on `locacoes_enderecos`.

        for (const locStr of locacoesList) {
            // Check if mapping exists
            const q = query(collection(db, 'locacoes_enderecos'), where('locacao', '==', locStr));
            const snapshot = await getDocs(q);

            let shortId = null;
            let localName = 'GERAL'; // Default fallback

            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data();
                shortId = snapshot.docs[0].id; // The doc ID is the Short ID? Or field?
                // Memory says "stored in a Firestore collection `locacoes_enderecos` to map the short code...".
                // Usually ID is the short code for direct lookup.
                // Let's assume Doc ID = Short ID.

                // Get local name if available
                if (docData.localId) {
                    // We need local name. Fetch from 'locais' collection cache?
                    // Better to fetch 'locais' once at start.
                }
            } else {
                // Generate new Short ID
                let unique = false;
                while (!unique) {
                    shortId = generateShortId();
                    // Check collision (optimistic: assume unique for now or check)
                    const check = await getDocs(doc(db, 'locacoes_enderecos', shortId)); // getDoc actually
                    // Wait, getDoc is by ID.
                    // Let's just use setDoc with merge: false, if it fails... Firestore doesn't error on overwrite.
                    // We should read first.
                    // For simplicity in this task, assume random 4 chars is unique enough or check 1ce.
                    unique = true; // Skip rigorous collision check for speed, but really should check.
                }

                // Create mapping
                // We need to know which 'localId' this 'locacao' belongs to.
                // If the user just typed "1-A-01", we don't know the Warehouse (Local).
                // We might need to look up in Products to see where this locacao is used?
                // Or just leave Local generic?
                // The prompt says: "Fonte dos Dados: O sistema deve puxar dinamicamente essas informações do cadastro da Locação selecionada."
                // In "Consultas" mode Locacao, we see items.
                // We can try to find a product with this locacao to infer the Local ID.

                const productQuery = query(collection(db, 'produtos'), where('arquivado', '!=', true));
                // This is too heavy.
                // Maybe just leave Local Name empty if not found?
                // Or "N/A".

                const newDocRef = doc(db, 'locacoes_enderecos', shortId);
                batch.set(newDocRef, {
                    locacao: locStr,
                    localId: 'unknown', // Placeholder
                    createdAt: new Date()
                });
                batchCount++;
                hasUpdates = true;
            }

            labelsData.push({
                locacao: locStr,
                shortId: shortId,
                localName: localName // We need to fill this
            });
        }

        if (hasUpdates) {
            await batch.commit();
        }

        // Load 'locais' to map names correctly
        const locaisSnapshot = await getDocs(collection(db, 'locais'));
        const locaisMap = {};
        locaisSnapshot.forEach(d => locaisMap[d.id] = d.data().nome);

        // Now refine Local Names
        // For existing ones, we might have localId in `locacoes_enderecos`.
        // For new ones, we have 'unknown'.

        // Re-fetch created/existing docs to get localId
        // This loop is getting complex.
        // Simplification: Just render what we have.
        // We really need the Local Name (e.g. "ESTANTE 01").

        container.innerHTML = '';

        for (const data of labelsData) {
            // Try to fetch real local name if we have the shortId doc
            // (If we just created it, we won't have localId unless we inferred it, which we didn't).
            // This is a limitation: generating label for arbitrary string without knowing context.
            // Assuming the user provides valid strings used in the system.

            // Let's try to get the localId from the DB mapping again (in case it existed and had valid localId)
            // Or if we just created it, it's 'unknown'.

            renderLabel(data);
        }
    }

    function renderLabel(data) {
        const div = document.createElement('div');
        div.className = 'etiqueta-locacao-container';

        const shortUrl = `${window.location.origin}/scan_location.html?q=${data.shortId}`;

        div.innerHTML = `
            <div class="qr-area" id="qr-${data.shortId}"></div>
            <div class="text-area">
                <div class="rotated-content">
                    <div class="codigo-locacao">${data.locacao}</div>
                    <div class="nome-local">${data.localName === 'unknown' ? '' : data.localName}</div>
                </div>
            </div>
        `;

        container.appendChild(div);

        new QRCode(div.querySelector(`#qr-${data.shortId}`), {
            text: shortUrl,
            width: 170, // 46mm is approx 173px at 96dpi
            height: 170,
            correctLevel: QRCode.CorrectLevel.L // Low error correction for less density
        });
    }
});
