import { db } from './firebase-config.js';
import { collection, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('global-search');
    const aside = document.querySelector('aside');
    let resultsContainer = null;
    let productsData = [];
    let obrasData = [];

    // Crie o container de resultados uma vez e anexe-o ao aside
    resultsContainer = document.createElement('div');
    resultsContainer.id = 'global-search-results';
    resultsContainer.className = 'absolute bg-gray-800 border border-gray-600 rounded-md mt-1 w-full z-20 hidden';

    // Encontre a posição relativa para o container de resultados
    const searchContainer = searchInput.parentElement;
    searchContainer.style.position = 'relative';
    searchContainer.appendChild(resultsContainer);

    // Carrega dados de produtos
    const productsQuery = query(collection(db, 'produtos'), where("arquivado", "!=", true));
    onSnapshot(productsQuery, (snapshot) => {
        productsData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), type: 'Produto' }));
    });

    // Carrega dados de obras
    const obrasQuery = query(collection(db, 'obras'));
    onSnapshot(obrasQuery, (snapshot) => {
        obrasData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), type: 'Obra' }));
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();

        if (searchTerm.length < 3) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        const filteredProducts = productsData.filter(product => {
            const pData = product.data;
            const code = pData.codigo ? pData.codigo.toLowerCase() : '';
            const description = pData.descricao ? pData.descricao.toLowerCase() : '';
            return code.includes(searchTerm) || description.includes(searchTerm);
        });

        const filteredObras = obrasData.filter(obra => {
            const oData = obra.data;
            const name = oData.nome ? oData.nome.toLowerCase() : '';
            const code = oData.codigo ? oData.codigo.toLowerCase() : '';
            return name.includes(searchTerm) || code.includes(searchTerm);
        });

        const combinedResults = [...filteredProducts, ...filteredObras];

        renderResults(combinedResults);
    });

    function renderResults(results) {
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="p-2 text-gray-400">Nenhum resultado encontrado.</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'max-h-60 overflow-y-auto';

        results.slice(0, 10).forEach(result => {
            const li = document.createElement('li');
            const a = document.createElement('a');

            let href = '';
            let title = '';
            let subtitle = '';
            let typeLabel = '';

            if (result.type === 'Produto') {
                href = `detalhe-produto.html?id=${result.id}`;
                title = result.data.codigo;
                subtitle = result.data.descricao;
                typeLabel = 'Produto';
            } else if (result.type === 'Obra') {
                href = `detalhe-obra.html?id=${result.id}`;
                title = result.data.codigo;
                subtitle = result.data.nome;
                typeLabel = 'Obra';
            }

            a.href = href;
            a.className = 'block p-2 hover:bg-gray-700 rounded-md';
            a.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="font-bold">${title}</div>
                    <span class="text-xs px-2 py-1 bg-blue-500 text-white rounded-full">${typeLabel}</span>
                </div>
                <div class="text-sm text-gray-300">${subtitle}</div>
            `;
            li.appendChild(a);
            ul.appendChild(li);
        });

        resultsContainer.appendChild(ul);
        resultsContainer.classList.remove('hidden');
    }

    // Fecha o dropdown se clicar fora
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });
});
