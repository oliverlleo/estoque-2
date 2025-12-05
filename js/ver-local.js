import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const tableBody = document.querySelector('#table-local tbody');
    const pageTitle = document.getElementById('page-title');
    const localSubtitle = document.getElementById('local-subtitle');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');

    const urlParams = new URLSearchParams(window.location.search);
    const localId = urlParams.get('localId');
    const locacao = urlParams.get('locacao');

    if (!localId) {
        showError("Local não especificado na URL.");
        return;
    }

    try {
        // Parallel fetch of necessary data
        const [locaisSnapshot, productsSnapshot, movementsSnapshot, obrasSnapshot] = await Promise.all([
            getDocs(collection(db, 'locais')),
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "in", ["reserva", "reserva_cancelada"]))),
            getDocs(collection(db, 'obras'))
        ]);

        // Process Local Name
        let localName = 'Desconhecido';
        locaisSnapshot.forEach(doc => {
            if (doc.id === localId) localName = doc.data().nome;
        });

        pageTitle.textContent = `Itens em: ${localName}`;
        localSubtitle.textContent = (locacao !== null) ? `Locação: ${locacao || '(Vazio)'}` : 'Locação: (Todas)';

        // Process Obras
        const obras = {};
        obrasSnapshot.forEach(doc => obras[doc.id] = doc.data());

        // Process Movements for Reservations
        const movementsByProduct = {};
        movementsSnapshot.forEach(doc => {
            const mov = doc.data();
            if (!movementsByProduct[mov.productId]) movementsByProduct[mov.productId] = [];
            movementsByProduct[mov.productId].push(mov);
        });

        // Process Products
        const displayData = [];

        productsSnapshot.forEach(doc => {
            const product = doc.data();
            product.id = doc.id;

            if (product.locacoes) {
                // Check if product is in the requested location
                const matchingLocs = product.locacoes.filter(loc => {
                     const matchLocal = loc.localId === localId;
                     if (locacao === null) return matchLocal;
                     return matchLocal && (loc.locacao === locacao);
                });

                if (matchingLocs.length > 0) {
                    // Calculate Reservations
                    const prodMovements = movementsByProduct[product.id] || [];
                    const reservasPorObra = {};

                    prodMovements.forEach(mov => {
                         if (mov.tipo === 'reserva') {
                             const obraId = mov.obraId || 'sem_obra';
                             reservasPorObra[obraId] = (reservasPorObra[obraId] || 0) + mov.quantidade;
                         } else if (mov.tipo === 'reserva_cancelada') {
                             const obraId = mov.obraId || 'sem_obra';
                             reservasPorObra[obraId] = (reservasPorObra[obraId] || 0) - mov.quantidade;
                         }
                    });

                    let reservedString = '';
                     const obrasComReserva = Object.entries(reservasPorObra).filter(([_, qty]) => qty > 0);
                     if (obrasComReserva.length > 0) {
                         reservedString = obrasComReserva.map(([obraId, qty]) => {
                             const obraNome = obras[obraId]?.nome || 'Obra Desconhecida';
                             return `<div>${obraNome}: ${qty}</div>`;
                         }).join('');
                     } else {
                         reservedString = '0';
                     }

                     // Total stock in THIS location (sum matching locs)
                     const stockInLocation = matchingLocs.reduce((sum, l) => sum + (Number(l.estoque) || 0), 0);

                     displayData.push({
                         codigo: product.codigo,
                         descricao: product.descricao,
                         cor: product.cor || '-',
                         estoque: stockInLocation,
                         reservado: reservedString,
                         un: product.un,
                         locacao: matchingLocs.map(l => l.locacao || '(Vazio)').join(', ')
                     });
                }
            }
        });

        renderTable(displayData);
        loadingIndicator.style.display = 'none';

    } catch (e) {
        console.error(e);
        showError("Erro ao carregar dados: " + e.message);
    }

    function showError(msg) {
        loadingIndicator.style.display = 'none';
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Nenhum item encontrado neste local.</td></tr>';
            return;
        }

        data.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.descricao}</td>
                <td>${item.cor}</td>
                <td class="font-bold">${item.estoque}</td>
                <td>${item.reservado}</td>
                <td>${item.un}</td>
                <td>${item.locacao}</td>
            `;
            tableBody.appendChild(row);
        });
    }
});
