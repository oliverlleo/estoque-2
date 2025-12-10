import { db } from './firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import Fuse from './fuse.js';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('global-search');
    // If searchInput doesn't exist (e.g. login page), stop.
    if (!searchInput) return;

    let resultsContainer = null;
    let productsData = [];
    let obrasData = [];
    let fuseProducts = null;
    let fuseObras = null;

    // --- Configuration for Fuse.js ---
    const fuseOptionsProducts = {
        keys: [
            { name: 'data.codigo', weight: 0.7 },
            { name: 'data.descricao', weight: 0.3 }
        ],
        threshold: 0.4, // 0.0 requires perfect match, 1.0 matches anything
        ignoreLocation: true // Search anywhere in the string
    };

    const fuseOptionsObras = {
        keys: [
            { name: 'data.nome', weight: 0.6 },
            { name: 'data.codigo', weight: 0.4 }
        ],
        threshold: 0.4,
        ignoreLocation: true
    };

    // --- Setup UI ---
    resultsContainer = document.createElement('div');
    resultsContainer.id = 'global-search-results';
    resultsContainer.className = 'absolute bg-white text-gray-900 border border-gray-300 rounded-md mt-1 w-full z-50 shadow-lg hidden max-h-96 overflow-y-auto';
    // Ensure parent is relative so absolute positioning works
    const searchContainer = searchInput.parentElement;
    if (getComputedStyle(searchContainer).position === 'static') {
        searchContainer.style.position = 'relative';
    }
    searchContainer.appendChild(resultsContainer);

    // --- Load Data ---
    const productsQuery = query(collection(db, 'produtos'), where("arquivado", "!=", true));
    onSnapshot(productsQuery, (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), type: 'Produto' }));
        fuseProducts = new Fuse(productsData, fuseOptionsProducts);
    });

    const obrasQuery = query(collection(db, 'obras'));
    onSnapshot(obrasQuery, (snapshot) => {
        obrasData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), type: 'Obra' }));
        fuseObras = new Fuse(obrasData, fuseOptionsObras);
    });

    // --- Search Logic ---
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.trim();

        if (searchTerm.length < 2) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        const categorizedResults = {
            actions: [],
            products: [],
            obras: []
        };

        // 1. Context Detection (Quick Actions)
        const lowerTerm = searchTerm.toLowerCase();

        // Movement Detection
        if (/^(nova )?entrada/.test(lowerTerm)) {
            categorizedResults.actions.push({
                label: 'Nova Entrada',
                sub: 'Ir para Movimentações > Entrada',
                href: 'movimentacoes.html?action=entrada',
                icon: 'plus-circle'
            });
        }
        if (/^(nova )?sa[ií]da/.test(lowerTerm)) {
             categorizedResults.actions.push({
                label: 'Nova Saída',
                sub: 'Ir para Movimentações > Saída',
                href: 'movimentacoes.html?action=saida',
                icon: 'minus-circle'
            });
        }
        if (/^(nova )?reserva/.test(lowerTerm)) {
             categorizedResults.actions.push({
                label: 'Nova Reserva',
                sub: 'Ir para Movimentações > Reserva',
                href: 'movimentacoes.html?action=reserva',
                icon: 'lock'
            });
        }

        // Location Pattern Detection (e.g., 1-A-01)
        // Adjust regex based on common patterns. User example: "1-A-01"
        if (/^[0-9]+-[A-Z]+(-[0-9]+)?/.test(searchTerm)) {
            categorizedResults.actions.push({
                label: `Filtrar Locação: ${searchTerm.toUpperCase()}`,
                sub: 'Ver itens neste endereço',
                href: `consultas.html?locacao=${encodeURIComponent(searchTerm)}`,
                icon: 'map-pin'
            });
        }

        // Code Pattern Detection (starts with numbers) - Bias towards exact code search
        // (Handled implicitly by Fuse weights, but we can add a direct "Go to Code" if it looks like a barcode)
        if (/^\d{4,}/.test(searchTerm)) {
             // Maybe add a specific action if needed, but search results usually cover this.
        }

        // 2. Fuzzy Search Products
        if (fuseProducts) {
            const results = fuseProducts.search(searchTerm);
            categorizedResults.products = results.slice(0, 5).map(r => r.item);
        }

        // 3. Fuzzy Search Obras
        if (fuseObras) {
            const results = fuseObras.search(searchTerm);
            categorizedResults.obras = results.slice(0, 3).map(r => r.item);
        }

        renderResults(categorizedResults);
    });

    function renderResults(results) {
        const hasActions = results.actions.length > 0;
        const hasProducts = results.products.length > 0;
        const hasObras = results.obras.length > 0;

        if (!hasActions && !hasProducts && !hasObras) {
            resultsContainer.innerHTML = '<div class="p-3 text-gray-500 text-sm">Nenhum resultado encontrado.</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = '';

        // Render Actions
        if (hasActions) {
            const groupTitle = document.createElement('div');
            groupTitle.className = 'px-3 py-1 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider';
            groupTitle.textContent = 'Ações Rápidas';
            resultsContainer.appendChild(groupTitle);

            results.actions.forEach(action => {
                const a = document.createElement('a');
                a.href = action.href;
                a.className = 'block px-3 py-2 hover:bg-blue-50 transition duration-150 ease-in-out border-b border-gray-100 last:border-0';
                a.innerHTML = `
                    <div class="flex items-center">
                        <div class="flex-shrink-0 mr-3 text-blue-500">
                           <i data-feather="${action.icon || 'arrow-right'}" width="16" height="16"></i>
                        </div>
                        <div>
                            <div class="text-sm font-medium text-gray-900">${action.label}</div>
                            <div class="text-xs text-gray-500">${action.sub}</div>
                        </div>
                    </div>
                `;
                resultsContainer.appendChild(a);
            });
        }

        // Render Products
        if (hasProducts) {
            const groupTitle = document.createElement('div');
            groupTitle.className = 'px-3 py-1 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider';
            groupTitle.textContent = 'Estoque / Consulta';
            resultsContainer.appendChild(groupTitle);

            results.products.forEach(prod => {
                const a = document.createElement('a');
                // Link to Consultas filtered by Code (most reliable) or Desc depending on match?
                // Using code is safer for unique identification.
                // If the user searched by name, we still filter by this product's code to show exactly this one?
                // Or filtered by Description?
                // The user request: "Passe o ID ou Código do produto via URL... consultas.html?search=CODIGO_123"
                // Let's use the product code as the search param.
                const searchParam = prod.data.codigo || prod.data.descricao; // Fallback
                a.href = `consultas.html?search=${encodeURIComponent(searchParam)}`;
                a.className = 'block px-3 py-2 hover:bg-blue-50 transition duration-150 ease-in-out border-b border-gray-100 last:border-0';

                a.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="text-sm font-medium text-gray-900">${prod.data.descricao}</div>
                            <div class="text-xs text-gray-500">Cód: ${prod.data.codigo}</div>
                        </div>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Produto
                        </span>
                    </div>
                `;
                resultsContainer.appendChild(a);
            });
        }

        // Render Obras
        if (hasObras) {
            const groupTitle = document.createElement('div');
            groupTitle.className = 'px-3 py-1 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider';
            groupTitle.textContent = 'Gestão de Obras';
            resultsContainer.appendChild(groupTitle);

            results.obras.forEach(obra => {
                const a = document.createElement('a');
                // User suggestion: "Vá para movimentacoes.html (ou obras.html se preferir o financeiro)..."
                // "Resultado: O usuário vê imediatamente o histórico do que aconteceu naquela obra"
                // Currently detalhe-obra.html has a tab for "Itens" (usage) and "Reservas". This effectively shows history.
                // However, detailed raw movements history is in detalhe-obra.html?
                // Let's stick to detalhe-obra.html as it is the dashboard for the project.
                // If they want raw history, maybe we can add a param to open a specific tab?
                // For now, simple link to detalhe-obra.html.
                a.href = `detalhe-obra.html?id=${obra.id}`;
                a.className = 'block px-3 py-2 hover:bg-blue-50 transition duration-150 ease-in-out border-b border-gray-100 last:border-0';

                a.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="text-sm font-medium text-gray-900">${obra.data.nome}</div>
                            <div class="text-xs text-gray-500">${obra.data.codigo || 'S/C'}</div>
                        </div>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Obra
                        </span>
                    </div>
                `;
                resultsContainer.appendChild(a);
            });
        }

        resultsContainer.classList.remove('hidden');
        if (typeof feather !== 'undefined') feather.replace();
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });

    // Keyboard navigation (optional enhancement)
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            resultsContainer.classList.add('hidden');
            searchInput.blur();
        }
    });
});
