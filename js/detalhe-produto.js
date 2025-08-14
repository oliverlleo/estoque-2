import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const detailsContainer = document.getElementById('details-container');
    const locacoesLista = document.getElementById('locacoes-lista');
    const productNameHeader = document.getElementById('product-name-header');

    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        detailsContainer.innerHTML = '<p style="color: red;">ID do produto não fornecido.</p>';
        locacoesLista.innerHTML = '<tr><td colspan="3">Erro.</td></tr>';
        return;
    }

    async function loadProductDetails() {
        try {
            // Fetch product, its locations, and the main 'locais' config simultaneously
            const productRef = doc(db, 'produtos', productId);
            const locacoesRef = collection(db, 'produtos', productId, 'localizacoes');
            const locaisConfigRef = collection(db, 'locais');

            const [productSnap, locacoesSnap, locaisConfigSnap] = await Promise.all([
                getDoc(productRef),
                getDocs(locacoesRef),
                getDocs(locaisConfigRef)
            ]);

            // Process main 'locais' config into a map
            const locaisMap = {};
            locaisConfigSnap.forEach(doc => {
                locaisMap[doc.id] = doc.data();
            });

            // Render Product Details
            if (productSnap.exists()) {
                const product = productSnap.data();
                productNameHeader.textContent = `Detalhes: ${product.descricao}`;
                detailsContainer.innerHTML = `
                    <p><strong>Código:</strong> ${product.codigo}</p>
                    <p><strong>Código Global:</strong> ${product.codigo_global || 'N/A'}</p>
                    <p><strong>Descrição:</strong> ${product.descricao}</p>
                    <p><strong>UN Estoque:</strong> ${product.un}</p>
                    <p><strong>UN Compra:</strong> ${product.un_compra || 'N/A'}</p>
                    <p><strong>Cor:</strong> ${product.cor || 'N/A'}</p>
                    <p><strong>Estoque Total:</strong> ${product.estoque || 0}</p>
                `;
            } else {
                throw new Error("Produto não encontrado.");
            }

            // Render Locations Table
            locacoesLista.innerHTML = '';
            if (locacoesSnap.empty) {
                locacoesLista.innerHTML = '<tr><td colspan="3">Nenhuma locação cadastrada para este produto.</td></tr>';
            } else {
                locacoesSnap.forEach(doc => {
                    const loc = doc.data();
                    const localNome = locaisMap[loc.localId]?.nome || 'Local Desconhecido';
                    const row = `
                        <tr>
                            <td>${localNome}</td>
                            <td>${loc.locacao}</td>
                            <td>${loc.estoque || 0}</td>
                        </tr>`;
                    locacoesLista.innerHTML += row;
                });
            }

        } catch (error) {
            console.error("Erro ao carregar detalhes do produto:", error);
            detailsContainer.innerHTML = `<p style="color: red;">Erro ao carregar detalhes: ${error.message}</p>`;
            locacoesLista.innerHTML = `<tr><td colspan="3">Erro ao carregar.</td></tr>`;
        }
    }

    loadProductDetails();
});
