import { db } from './firebase-config.js';
import { collection, getDocs, query, where, writeBatch, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Implementação carregada.");

    // DOM Elements
    const startAddressInput = document.getElementById('start-address');
    const endAddressInput = document.getElementById('end-address');
    const btnListItems = document.getElementById('btn-list-items');
    const tableBody = document.querySelector('#table-implementacao tbody');
    const filterNoQuantity = document.getElementById('filter-no-quantity');
    const filterNoValue = document.getElementById('filter-no-value');
    const btnConfirmMovement = document.getElementById('btn-confirm-movement');

    let allProducts = [];
    let implementationMovements = {}; // Map to store existing implementation data

    // --- DATA FETCHING ---

    async function fetchAllData() {
        btnListItems.disabled = true;
        btnListItems.textContent = 'Carregando...';
        try {
            // Fetch all products
            const productsSnapshot = await getDocs(collection(db, 'produtos'));
            allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Carregados ${allProducts.length} produtos.`);

            // Fetch all existing 'implementacao' movements
            const q = query(collection(db, 'movimentacoes'), where("tipo", "==", "implementacao"));
            const movementsSnapshot = await getDocs(q);
            movementsSnapshot.docs.forEach(doc => {
                const mov = doc.data();
                // Create a unique key for each product-location pair
                const key = `${mov.productId}-${mov.locacao}`;
                implementationMovements[key] = { id: doc.id, ...mov };
            });
            console.log(`Carregados ${Object.keys(implementationMovements).length} movimentos de implementação.`);

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            alert("Falha ao carregar dados iniciais. Verifique o console.");
        } finally {
            btnListItems.disabled = false;
            btnListItems.textContent = 'Listar Itens';
        }
    }

    // --- RENDERING ---

    function renderTable(products) {
        tableBody.innerHTML = '';

        if (products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum item encontrado para o range de endereçamento informado.</td></tr>';
            return;
        }

        products.forEach(product => {
            if (product.locacoes && product.locacoes.length > 0) {
                product.locacoes.forEach(loc => {
                    const key = `${product.id}-${loc.locacao}`;
                    const existingMovement = implementationMovements[key];

                    const row = document.createElement('tr');
                    row.dataset.productId = product.id;
                    row.dataset.locacao = loc.locacao;
                    row.dataset.localId = loc.localId;

                    let quantityInputHtml, valueInputHtml, icmsInputHtml, ipiInputHtml, freteInputHtml;

                    if (existingMovement) {
                        // Item JÁ IMPLEMENTADO
                        row.dataset.movementId = existingMovement.id; // Store existing movement ID
                        row.classList.add('implemented'); // Add a class for styling

                        quantityInputHtml = `<input type="number" class="form-control-sm quantity-input" value="${existingMovement.quantidade}" disabled title="Quantidade já implementada.">`;
                        valueInputHtml = `<input type="number" class="form-control-sm value-input" value="${existingMovement.valor_unitario || ''}" min="0" step="0.01">`;
                        icmsInputHtml = `<input type="number" class="form-control-sm icms-input" value="${existingMovement.icms || ''}" min="0" step="0.01">`;
                        ipiInputHtml = `<input type="number" class="form-control-sm ipi-input" value="${existingMovement.ipi || ''}" min="0" step="0.01">`;
                        freteInputHtml = `<input type="number" class="form-control-sm frete-input" value="${existingMovement.frete || ''}" min="0" step="0.01">`;
                    } else {
                        // Item NÃO IMPLEMENTADO
                        quantityInputHtml = `<input type="number" class="form-control-sm quantity-input" min="0" step="any">`;
                        valueInputHtml = `<input type="number" class="form-control-sm value-input" min="0" step="0.01">`;
                        icmsInputHtml = `<input type="number" class="form-control-sm icms-input" min="0" step="0.01">`;
                        ipiInputHtml = `<input type="number" class="form-control-sm ipi-input" min="0" step="0.01">`;
                        freteInputHtml = `<input type="number" class="form-control-sm frete-input" min="0" step="0.01">`;
                    }

                    row.innerHTML = `
                        <td>${product.codigo}</td>
                        <td>${product.descricao}</td>
                        <td>${loc.locacao}</td>
                        <td>${quantityInputHtml}</td>
                        <td>${valueInputHtml}</td>
                        <td>${icmsInputHtml}</td>
                        <td>${ipiInputHtml}</td>
                        <td>${freteInputHtml}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        });
    }

    // --- EVENT LISTENERS & FILTERS ---

    function applyFilters() {
        const noQuantityChecked = filterNoQuantity.checked;
        const noValueChecked = filterNoValue.checked;

        document.querySelectorAll('#table-implementacao tbody tr').forEach(row => {
            if (!row.dataset.productId) return; // Ignore empty rows

            const quantityInput = row.querySelector('.quantity-input');
            const valueInput = row.querySelector('.value-input');

            // Check if quantity exists (for new items) or is pre-filled (for implemented items)
            const hasQuantity = quantityInput.value && parseFloat(quantityInput.value) > 0;
            const hasValue = valueInput.value && parseFloat(valueInput.value) > 0;

            let shouldShow = true;
            if (noQuantityChecked && hasQuantity) shouldShow = false;
            if (noValueChecked && hasValue) shouldShow = false;

            row.style.display = shouldShow ? '' : 'none';
        });
    }

    btnListItems.addEventListener('click', () => {
        const startAddress = startAddressInput.value.toUpperCase().trim();
        const endAddress = endAddressInput.value.toUpperCase().trim();

        if (!startAddress || !endAddress) {
            alert("Por favor, preencha os endereçamentos inicial e final.");
            return;
        }

        const filteredProducts = allProducts.map(p => {
            if (!p.locacoes || p.locacoes.length === 0) return null;

            const validLocacoes = p.locacoes.filter(loc => {
                const currentLoc = loc.locacao.toUpperCase();
                return currentLoc >= startAddress && currentLoc <= endAddress;
            });

            if (validLocacoes.length > 0) {
                return { ...p, locacoes: validLocacoes };
            }
            return null;
        }).filter(p => p !== null); // Remove nulls

        renderTable(filteredProducts);
        applyFilters();
    });

    btnConfirmMovement.addEventListener('click', async () => {
        const rowsToProcess = Array.from(tableBody.querySelectorAll('tr:not([style*="display: none"])'));

        if (rowsToProcess.length === 0 || !rowsToProcess[0].dataset.productId) {
            alert("Nenhum item visível para processar.");
            return;
        }

        if (!confirm(`Confirmar as alterações para os itens visíveis?`)) {
            return;
        }

        const batch = writeBatch(db);
        let newMovementsCount = 0;
        let updatedMovementsCount = 0;

        rowsToProcess.forEach(row => {
            const quantityInput = row.querySelector('.quantity-input');
            const quantity = parseFloat(quantityInput.value);
            const isAlreadyImplemented = quantityInput.disabled;

            const value = parseFloat(row.querySelector('.value-input').value) || 0;
            const icms = parseFloat(row.querySelector('.icms-input').value) || 0;
            const ipi = parseFloat(row.querySelector('.ipi-input').value) || 0;
            const frete = parseFloat(row.querySelector('.frete-input').value) || 0;

            if (isAlreadyImplemented) {
                // UPDATE existing movement with new financial data
                const movementId = row.dataset.movementId;
                if (movementId) {
                    const movementRef = doc(db, 'movimentacoes', movementId);
                    const custoTotal = (quantity * value) + icms + ipi + frete;
                    batch.update(movementRef, {
                        valor_unitario: value,
                        icms: icms,
                        ipi: ipi,
                        frete: frete,
                        custo_total_entrada: custoTotal,
                        data_atualizacao: serverTimestamp() // Add update timestamp
                    });
                    updatedMovementsCount++;
                }
            } else if (quantity && quantity > 0) {
                // CREATE new 'implementacao' movement
                const productId = row.dataset.productId;
                const custoTotal = (quantity * value) + icms + ipi + frete;

                const movementData = {
                    productId: productId,
                    tipo: 'implementacao',
                    quantidade: quantity,
                    locacao: row.dataset.locacao, // Storing locacao on the movement
                    data: serverTimestamp(),
                    observacao: `Implementação via tela de implementação.`,
                    valor_unitario: value,
                    icms: icms,
                    ipi: ipi,
                    frete: frete,
                    custo_total_entrada: custoTotal
                };
                const newMovementRef = doc(collection(db, 'movimentacoes'));
                batch.set(newMovementRef, movementData);
                newMovementsCount++;
            }
        });

        if (newMovementsCount === 0 && updatedMovementsCount === 0) {
            alert("Nenhuma alteração ou nova quantidade foi preenchida para salvar.");
            return;
        }

        try {
            await batch.commit();
            alert(`${newMovementsCount} nova(s) movimentação(ões) criada(s) e ${updatedMovementsCount} movimentação(ões) atualizada(s) com sucesso!`);
            // Refetch all data to get the latest state and re-render
            await fetchAllData();
            btnListItems.click(); // Re-list the items to show the updated state
        } catch (error) {
            console.error("Erro ao confirmar movimentações:", error);
            alert("Ocorreu um erro ao salvar as alterações. Verifique o console.");
        }
    });

    filterNoQuantity.addEventListener('change', applyFilters);
    filterNoValue.addEventListener('change', applyFilters);

    // Initial fetch of all data
    fetchAllData();
});
