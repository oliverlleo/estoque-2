import { db } from './firebase-config.js';
import { collection, getDocs, doc, runTransaction, query, where, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Relações de Produtos carregada.");

    // --- State ---
    let productsData = [];
    let productsMap = new Map(); // id -> product data
    let baseProduct = null;
    let similarIds = []; // Current state
    let substitutoIds = []; // Current state

    // Original states for comparison
    let originalSimilarIds = [];
    let originalSubstitutoIds = [];

    // --- DOM Elements ---
    const loadingOverlay = document.getElementById('loading-overlay');
    const searchBaseInput = document.getElementById('search-base');
    const baseResults = document.getElementById('base-results');
    const baseProductCard = document.getElementById('base-product-card');
    const baseProductDisplay = document.getElementById('base-product-display');
    const btnClearBase = document.getElementById('btn-clear-base');

    const relationshipsWrapper = document.getElementById('relationships-wrapper');
    const btnSaveRelations = document.getElementById('btn-save-relations');

    const searchSimilarInput = document.getElementById('search-similar');
    const similarResults = document.getElementById('similar-results');
    const similarChipsContainer = document.getElementById('similar-chips-container');

    const searchSubstitutoInput = document.getElementById('search-substituto');
    const substitutoResults = document.getElementById('substituto-results');
    const substitutoChipsContainer = document.getElementById('substituto-chips-container');

    // --- Initial Data Load ---
    async function loadProducts() {
        loadingOverlay.style.display = 'flex';
        try {
            const q = query(collection(db, 'produtos'), where("arquivado", "!=", true));
            const snapshot = await getDocs(q);

            productsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            productsData.forEach(p => {
                productsMap.set(p.id, p);
            });

        } catch (error) {
            console.error("Erro ao carregar produtos:", error);
            alert("Erro ao carregar os produtos. Tente novamente mais tarde.");
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    await loadProducts();

    // --- Search & Autocomplete Logic ---
    function setupSearch(inputElement, resultsElement, onSelectCallback, filterCallback = null) {
        inputElement.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            resultsElement.innerHTML = '';

            if (term.length < 2) {
                resultsElement.style.display = 'none';
                return;
            }

            let matches = productsData.filter(p => {
                const searchString = `${p.codigo} ${p.descricao}`.toLowerCase();
                return searchString.includes(term);
            });

            if (filterCallback) {
                matches = matches.filter(filterCallback);
            }

            // Limit results
            matches = matches.slice(0, 15);

            if (matches.length > 0) {
                matches.forEach(match => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.innerHTML = `<span class="item-codigo">${match.codigo}</span><span class="item-descricao">${match.descricao}</span>`;
                    div.addEventListener('click', () => {
                        inputElement.value = '';
                        resultsElement.style.display = 'none';
                        onSelectCallback(match);
                    });
                    resultsElement.appendChild(div);
                });
                resultsElement.style.display = 'block';
            } else {
                resultsElement.innerHTML = '<div class="search-result-item" style="color: #6c757d; cursor: default;">Nenhum produto encontrado</div>';
                resultsElement.style.display = 'block';
            }
        });

        // Hide results when clicking outside
        document.addEventListener('click', (e) => {
            if (!inputElement.contains(e.target) && !resultsElement.contains(e.target)) {
                resultsElement.style.display = 'none';
            }
        });
    }

    // --- Filtering conditions for search ---
    const filterBase = (p) => true; // Any active product

    const filterSimilar = (p) => {
        if (!baseProduct) return false;
        if (p.id === baseProduct.id) return false; // Can't be itself
        if (similarIds.includes(p.id)) return false; // Not already in similars
        if (substitutoIds.includes(p.id)) return false; // Not already in substitutes
        return true;
    };

    const filterSubstituto = (p) => {
        if (!baseProduct) return false;
        if (p.id === baseProduct.id) return false; // Can't be itself
        if (similarIds.includes(p.id)) return false; // Not already in similars
        if (substitutoIds.includes(p.id)) return false; // Not already in substitutes
        return true;
    };

    // --- Normalization ---
    function normalizeIds(idArray) {
        if (!idArray || !Array.isArray(idArray)) return [];
        return [...new Set(idArray)].filter(id => id && productsMap.has(id));
    }

    // --- Render Logic ---
    function renderChips(container, idsArray, isSimilar) {
        container.innerHTML = '';

        idsArray.forEach(id => {
            const product = productsMap.get(id);
            if (!product) return; // Ignore if somehow not in map anymore

            const chip = document.createElement('div');
            chip.className = `chip ${isSimilar ? 'similar-chip' : 'substituto-chip'}`;

            const textSpan = document.createElement('span');
            textSpan.textContent = `${product.codigo} - ${product.descricao}`;

            const removeBtn = document.createElement('span');
            removeBtn.className = 'chip-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remover';

            removeBtn.addEventListener('click', () => {
                if (isSimilar) {
                    similarIds = similarIds.filter(sId => sId !== id);
                    renderChips(similarChipsContainer, similarIds, true);
                } else {
                    substitutoIds = substitutoIds.filter(sId => sId !== id);
                    renderChips(substitutoChipsContainer, substitutoIds, false);
                }
                checkDirtyState();
            });

            chip.appendChild(textSpan);
            chip.appendChild(removeBtn);
            container.appendChild(chip);
        });
    }

    function checkDirtyState() {
        // Compare current arrays with original arrays
        const similarChanged = JSON.stringify([...similarIds].sort()) !== JSON.stringify([...originalSimilarIds].sort());
        const substitutosChanged = JSON.stringify([...substitutoIds].sort()) !== JSON.stringify([...originalSubstitutoIds].sort());

        btnSaveRelations.disabled = !(similarChanged || substitutosChanged);
    }

    // --- Callbacks ---
    function onSelectBaseProduct(product) {
        baseProduct = product;

        // Hide search, show card
        searchBaseInput.parentElement.style.display = 'none';
        baseProductDisplay.textContent = `${product.codigo} - ${product.descricao}`;
        baseProductCard.style.display = 'flex';

        // Load relationships
        // Remove self from lists just in case
        const rawSimilars = (product.similarIds || []).filter(id => id !== product.id);
        const rawSubstitutos = (product.substitutoIds || []).filter(id => id !== product.id);

        originalSimilarIds = normalizeIds(rawSimilars);
        originalSubstitutoIds = normalizeIds(rawSubstitutos);

        similarIds = [...originalSimilarIds];
        substitutoIds = [...originalSubstitutoIds];

        // Render chips
        renderChips(similarChipsContainer, similarIds, true);
        renderChips(substitutoChipsContainer, substitutoIds, false);

        // Enable relationship section
        relationshipsWrapper.style.opacity = '1';
        relationshipsWrapper.style.pointerEvents = 'auto';
        searchSimilarInput.disabled = false;
        searchSubstitutoInput.disabled = false;

        checkDirtyState();
    }

    function onSelectSimilar(product) {
        if (!similarIds.includes(product.id)) {
            similarIds.push(product.id);
            renderChips(similarChipsContainer, similarIds, true);
            checkDirtyState();
        }
    }

    function onSelectSubstituto(product) {
        if (!substitutoIds.includes(product.id)) {
            substitutoIds.push(product.id);
            renderChips(substitutoChipsContainer, substitutoIds, false);
            checkDirtyState();
        }
    }

    btnClearBase.addEventListener('click', () => {
        baseProduct = null;
        similarIds = [];
        substitutoIds = [];
        originalSimilarIds = [];
        originalSubstitutoIds = [];

        searchBaseInput.parentElement.style.display = 'block';
        searchBaseInput.value = '';
        baseProductCard.style.display = 'none';

        relationshipsWrapper.style.opacity = '0.5';
        relationshipsWrapper.style.pointerEvents = 'none';
        searchSimilarInput.disabled = true;
        searchSubstitutoInput.disabled = true;

        similarChipsContainer.innerHTML = '';
        substitutoChipsContainer.innerHTML = '';

        btnSaveRelations.disabled = true;
    });

    // --- Init Search ---
    setupSearch(searchBaseInput, baseResults, onSelectBaseProduct, filterBase);
    setupSearch(searchSimilarInput, similarResults, onSelectSimilar, filterSimilar);
    setupSearch(searchSubstitutoInput, substitutoResults, onSelectSubstituto, filterSubstituto);

    // --- Save Logic ---
    btnSaveRelations.addEventListener('click', async () => {
        if (!baseProduct) return;

        btnSaveRelations.disabled = true;
        btnSaveRelations.innerHTML = '<span class="material-icons">hourglass_empty</span> Salvando...';
        loadingOverlay.style.display = 'flex';

        try {
            await runTransaction(db, async (transaction) => {
                // --- FASE 1: TODAS AS LEITURAS (READS) ---

                // Read base product state to ensure consistency
                const baseRef = doc(db, 'produtos', baseProduct.id);
                const baseDocSnap = await transaction.get(baseRef);
                if (!baseDocSnap.exists()) {
                    throw new Error("O produto base não existe mais no banco de dados.");
                }

                // Calculate added and removed similars based on original loaded state
                const similarsAdded = similarIds.filter(id => !originalSimilarIds.includes(id));
                const similarsRemoved = originalSimilarIds.filter(id => !similarIds.includes(id));

                // Arrays to hold fetched target data for later writes
                const addedTargetsData = [];
                const removedTargetsData = [];

                // Read added targets
                for (const targetId of similarsAdded) {
                    const targetRef = doc(db, 'produtos', targetId);
                    const targetSnap = await transaction.get(targetRef);
                    if (targetSnap.exists()) {
                        addedTargetsData.push({ ref: targetRef, data: targetSnap.data() });
                    }
                }

                // Read removed targets
                for (const targetId of similarsRemoved) {
                    const targetRef = doc(db, 'produtos', targetId);
                    const targetSnap = await transaction.get(targetRef);
                    if (targetSnap.exists()) {
                        removedTargetsData.push({ ref: targetRef, data: targetSnap.data() });
                    }
                }

                // --- FASE 2: TODAS AS GRAVAÇÕES (WRITES) ---

                // 1. Update Base Product
                transaction.update(baseRef, {
                    similarIds: similarIds,
                    substitutoIds: substitutoIds
                });

                // 2. Update Bidirectional Similars
                for (const target of addedTargetsData) {
                    let targetSimilars = target.data.similarIds || [];
                    if (!targetSimilars.includes(baseProduct.id)) {
                        targetSimilars.push(baseProduct.id);
                        transaction.update(target.ref, { similarIds: targetSimilars });
                    }
                }

                for (const target of removedTargetsData) {
                    let targetSimilars = target.data.similarIds || [];
                    targetSimilars = targetSimilars.filter(id => id !== baseProduct.id);
                    transaction.update(target.ref, { similarIds: targetSimilars });
                }
            });

            alert('Relações salvas com sucesso!');

            // Update local memory representations to reflect new state
            const updatedBaseProduct = { ...baseProduct, similarIds: similarIds, substitutoIds: substitutoIds };
            productsMap.set(baseProduct.id, updatedBaseProduct);

            // Note: In a full rigorous reload, we might need to reload all `productsData`
            // because `similarsAdded` changed their internal state in DB.
            // But we can manually patch the local productsMap here for smooth UX:
            const similarsAdded = similarIds.filter(id => !originalSimilarIds.includes(id));
            const similarsRemoved = originalSimilarIds.filter(id => !similarIds.includes(id));

            for(let tid of similarsAdded) {
               if(productsMap.has(tid)) {
                   let tp = productsMap.get(tid);
                   let tSim = tp.similarIds || [];
                   if(!tSim.includes(baseProduct.id)) tSim.push(baseProduct.id);
                   tp.similarIds = tSim;
               }
            }
            for(let tid of similarsRemoved) {
                if(productsMap.has(tid)) {
                    let tp = productsMap.get(tid);
                    let tSim = tp.similarIds || [];
                    tp.similarIds = tSim.filter(id => id !== baseProduct.id);
                }
            }

            // Update original trackers
            originalSimilarIds = [...similarIds];
            originalSubstitutoIds = [...substitutoIds];

            checkDirtyState();

        } catch (error) {
            console.error("Erro ao salvar relações:", error);
            alert(`Erro ao salvar relações: ${error.message}`);
        } finally {
            btnSaveRelations.innerHTML = '<span class="material-icons">save</span> Salvar Relações';
            loadingOverlay.style.display = 'none';
        }
    });

});
