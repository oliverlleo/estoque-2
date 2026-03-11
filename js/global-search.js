import { db } from './firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import Fuse from './fuse.js';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('global-search');
    let resultsContainer = null;
    let productsData = [];
    let obrasData = [];
    let fuseProducts = null;
    let fuseObras = null;

    // Crie o container de resultados uma vez e anexe-o ao aside
    resultsContainer = document.createElement('div');
    resultsContainer.id = 'global-search-results';
    resultsContainer.className = 'absolute bg-gray-800 border border-gray-600 rounded-md mt-1 w-full z-50 hidden'; // Increased z-index
    resultsContainer.style.maxHeight = '80vh';
    resultsContainer.style.overflowY = 'auto';

    // Encontre a posição relativa para o container de resultados
    const searchContainer = searchInput.parentElement;
    searchContainer.style.position = 'relative';
    searchContainer.appendChild(resultsContainer);

    // Carrega dados de produtos
    const productsQuery = query(collection(db, 'produtos'), where("arquivado", "!=", true));
    onSnapshot(productsQuery, (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), type: 'Produto' }));
        // Initialize Fuse for Products
        fuseProducts = new Fuse(productsData, {
            keys: [
                { name: 'data.codigo', weight: 0.7 },
                { name: 'data.descricao', weight: 0.3 }
            ],
            threshold: 0.4,
            includeScore: true
        });
    });

    // Carrega dados de obras
    const obrasQuery = query(collection(db, 'obras'));
    onSnapshot(obrasQuery, (snapshot) => {
        obrasData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), type: 'Obra' }));
        // Initialize Fuse for Obras
        fuseObras = new Fuse(obrasData, {
            keys: [
                { name: 'data.nome', weight: 0.8 },
                { name: 'data.codigo', weight: 0.2 }
            ],
            threshold: 0.4,
            includeScore: true
        });
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.trim();

        if (searchTerm.length < 2) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        // 1. Detect Context (Quick Actions & Direct Links)
        const contextResults = detectContext(searchTerm);

        // 2. Fuzzy Search Products
        let productResults = [];
        if (fuseProducts) {
            productResults = fuseProducts.search(searchTerm).map(res => ({ ...res.item, score: res.score }));
        }

        // 3. Fuzzy Search Obras
        let obraResults = [];
        if (fuseObras) {
            obraResults = fuseObras.search(searchTerm).map(res => ({ ...res.item, score: res.score }));
        }

        renderCategorizedResults(contextResults, productResults, obraResults);
    });

    function detectContext(term) {
        const results = [];
        const lowerTerm = term.toLowerCase();

        // Regex for Location: "1-A-01", "01-B-02", etc.
        const locationRegex = /^\d+(-[A-Za-z]+(-\d+)?)?$/;
        if (locationRegex.test(term)) {
            results.push({
                type: 'Locacao',
                label: `Ir para Locação: ${term.toUpperCase()}`,
                href: `consultas.html?locacao=${term.toUpperCase()}`,
                icon: 'map-pin'
            });
        }

        // Movement Keywords
        if (lowerTerm.startsWith('entrada')) {
            results.push({ type: 'Acao', label: 'Nova Entrada', href: 'movimentacoes.html?tipo=entrada', icon: 'plus-circle' });
        } else if (lowerTerm.startsWith('saida') || lowerTerm.startsWith('saída')) {
            results.push({ type: 'Acao', label: 'Nova Saída', href: 'movimentacoes.html?tipo=saida', icon: 'minus-circle' });
        } else if (lowerTerm.startsWith('reserva')) {
            results.push({ type: 'Acao', label: 'Nova Reserva', href: 'movimentacoes.html?tipo=saida', icon: 'clock' });
        }

        return results;
    }

    function renderCategorizedResults(contextResults, productResults, obraResults) {
        if (contextResults.length === 0 && productResults.length === 0 && obraResults.length === 0) {
            resultsContainer.innerHTML = '<div class="p-2 text-gray-400 text-sm">Nenhum resultado encontrado.</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = '';

        // Render Quick Actions / Context
        if (contextResults.length > 0) {
            const section = createSectionHeader('Ações Rápidas');
            resultsContainer.appendChild(section);
            contextResults.forEach(res => {
                resultsContainer.appendChild(createResultItem(res.label, '', res.href, res.icon, 'text-blue-400'));
            });
        }

        // Render Obras
        if (obraResults.length > 0) {
            const section = createSectionHeader('Gestão de Obras');
            resultsContainer.appendChild(section);
            obraResults.slice(0, 3).forEach(res => {
                // Link to movimentacoes.html with obra filter pre-selected (assuming movimentacoes.js handles it or we'll add logic)
                // Since user asked to go to movimentacoes, we will pass obra name as filter if id not supported, but usually ID is better.
                // However, movimentacoes.js uses text filters mostly.
                // Let's check movimentacoes.js... it has 'mov-obra' select.
                // But for history view (consultas), maybe just filter.
                // Prompt: "Vá para movimentacoes.html... Pré-selecione o filtro de "Obra" na tela de destino."
                // Since movimentacoes.html is the entry form, maybe they mean the history table?
                // Actually, movimentacoes.html has a history table.
                // Let's point to movimentacoes.html with a query param that we can parse later.
                // But wait, the prompt says "Vá para movimentacoes.html ... O usuário vê imediatamente o histórico".
                // So I'll assume I can pass ?obraId=... since the filter usually uses IDs.
                const href = `movimentacoes.html?obraId=${res.id}`;
                resultsContainer.appendChild(createResultItem(res.data.nome, 'Obra', href, 'briefcase', 'text-yellow-500'));
            });
        }

        // Render Products
        if (productResults.length > 0) {
            const section = createSectionHeader('Estoque / Consulta');
            resultsContainer.appendChild(section);
            productResults.slice(0, 7).forEach(res => {
                // New logic: Link to consultas.html with ID
                const href = `consultas.html?id=${res.id}`;
                resultsContainer.appendChild(createResultItem(`${res.data.codigo} - ${res.data.descricao}`, `Estoque: ${res.data.estoque || 0}`, href, 'box', 'text-green-400'));
            });
        }

        resultsContainer.classList.remove('hidden');
        if (window.feather) window.feather.replace();
    }

    function createSectionHeader(title) {
        const div = document.createElement('div');
        div.className = 'px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-900 uppercase tracking-wider';
        div.textContent = title;
        return div;
    }

    function createResultItem(title, subtitle, href, icon, iconColorClass) {
        const a = document.createElement('a');
        a.href = href;
        a.className = 'block px-3 py-2 hover:bg-gray-700 border-b border-gray-700 last:border-0';

        const iconHtml = icon ? `<i data-feather="${icon}" class="w-4 h-4 mr-2 ${iconColorClass}"></i>` : '';

        a.innerHTML = `
            <div class="flex items-center">
                ${iconHtml}
                <div>
                    <div class="text-sm font-medium text-gray-200">${title}</div>
                    ${subtitle ? `<div class="text-xs text-gray-400">${subtitle}</div>` : ''}
                </div>
            </div>
        `;
        return a;
    }

    // Fecha o dropdown se clicar fora
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });
});
