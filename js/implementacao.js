import { db } from './firebase-config.js';
import { collection, getDocs, query, where, doc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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
        btnConfirmMovement.disabled = true;
        btnListItems.textContent = 'Carregando...';
        try {
            // Fetch all products
            const productsSnapshot = await getDocs(collection(db, 'produtos'));
            allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Carregados ${allProducts.length} produtos.`);

            // Fetch all existing 'implementacao' movements
            const q = query(collection(db, 'movimentacoes'), where("tipo", "==", "implementacao"));
            const movementsSnapshot = await getDocs(q);
            implementationMovements = {}; // Reset map before fetching
            movementsSnapshot.docs.forEach(doc => {
                const mov = doc.data();
                if (mov.productId && mov.locacao) {
                    const key = `${mov.productId}-${mov.locacao}`;
                    implementationMovements[key] = { id: doc.id, ...mov };
                }
            });
            console.log(`Carregados ${Object.keys(implementationMovements).length} movimentos de implementação.`);

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            alert("Falha ao carregar dados iniciais. Verifique o console.");
        } finally {
            btnListItems.disabled = false;
            btnConfirmMovement.disabled = false;
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
                        row.dataset.movementId = existingMovement.id;
                        row.classList.add('implemented');

                        quantityInputHtml = `<input type="number" class="form-control quantity-input" value="${existingMovement.quantidade}" disabled title="Quantidade já implementada.">`;
                        valueInputHtml = `<input type="number" class="form-control value-input" value="${existingMovement.valor_unitario || ''}" min="0" step="0.01">`;
                        icmsInputHtml = `<input type="number" class="form-control icms-input" value="${existingMovement.icms || ''}" min="0" step="0.01">`;
                        ipiInputHtml = `<input type="number" class="form-control ipi-input" value="${existingMovement.ipi || ''}" min="0" step="0.01">`;
                        freteInputHtml = `<input type="number" class="form-control frete-input" value="${existingMovement.frete || ''}" min="0" step="0.01">`;
                    } else {
                        // Item NÃO IMPLEMENTADO
                        quantityInputHtml = `<input type="number" class="form-control quantity-input" min="0" step="any">`;
                        valueInputHtml = `<input type="number" class="form-control value-input" min="0" step="0.01">`;
                        icmsInputHtml = `<input type="number" class="form-control icms-input" min="0" step="0.01">`;
                        ipiInputHtml = `<input type="number" class="form-control ipi-input" min="0" step="0.01">`;
                        freteInputHtml = `<input type="number" class="form-control frete-input" min="0" step="0.01">`;
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
            if (!row.dataset.productId) return;

            const quantityInput = row.querySelector('.quantity-input');
            const valueInput = row.querySelector('.value-input');

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
        }).filter(p => p !== null);

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

        btnConfirmMovement.disabled = true;
        btnConfirmMovement.textContent = 'Processando...';

        try {
            await runTransaction(db, async (transaction) => {
                const productsToUpdate = new Map();

                // First pass: Read all necessary product documents for stock updates
                for (const row of rowsToProcess) {
                    const quantityInput = row.querySelector('.quantity-input');
                    const isNewImplementation = !quantityInput.disabled && parseFloat(quantityInput.value) > 0;

                    if (isNewImplementation) {
                        const productId = row.dataset.productId;
                        if (!productsToUpdate.has(productId)) {
                            const productRef = doc(db, 'produtos', productId);
                            const productDoc = await transaction.get(productRef);
                            if (!productDoc.exists()) throw new Error(`Produto com ID ${productId} não encontrado.`);
                            // Deep copy of locacoes to avoid mutation issues
                            productsToUpdate.set(productId, { ...productDoc.data(), locacoes: JSON.parse(JSON.stringify(productDoc.data().locacoes)) });
                        }
                    }
                }

                // Second pass: Perform all writes (updates and creations)
                for (const row of rowsToProcess) {
                    const quantityInput = row.querySelector('.quantity-input');
                    const quantity = parseFloat(quantityInput.value) || 0;
                    const isAlreadyImplemented = quantityInput.disabled;

                    const value = parseFloat(row.querySelector('.value-input').value) || 0;
                    const icms = parseFloat(row.querySelector('.icms-input').value) || 0;
                    const ipi = parseFloat(row.querySelector('.ipi-input').value) || 0;
                    const frete = parseFloat(row.querySelector('.frete-input').value) || 0;

                    if (isAlreadyImplemented) {
                        // UPDATE existing movement
                        const movementId = row.dataset.movementId;
                        if (movementId) {
                            const movementRef = doc(db, 'movimentacoes', movementId);
                            const custoTotal = (quantity * value) + icms + ipi + frete;
                            transaction.update(movementRef, {
                                valor_unitario: value,
                                icms: icms,
                                ipi: ipi,
                                frete: frete,
                                custo_total_entrada: custoTotal,
                                data_atualizacao: serverTimestamp()
                            });
                        }
                    } else if (quantity > 0) {
                        // CREATE new movement AND UPDATE product stock
                        const productId = row.dataset.productId;
                        const locacaoStr = row.dataset.locacao;

                        // Update product stock in our temporary map
                        const productData = productsToUpdate.get(productId);
                        const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === locacaoStr);
                        if (locacaoIndex === -1) throw new Error(`Locação ${locacaoStr} não encontrada no produto ${productData.codigo}.`);

                        productData.locacoes[locacaoIndex].estoque = (productData.locacoes[locacaoIndex].estoque || 0) + quantity;

                        // Create movement document
                        const newMovementRef = doc(collection(db, 'movimentacoes'));
                        const custoTotal = (quantity * value) + icms + ipi + frete;
                        const movementData = {
                            productId: productId,
                            tipo: 'implementacao',
                            quantidade: quantity,
                            locacao: locacaoStr,
                            data: serverTimestamp(),
                            observacao: `Implementação via tela de implementação.`,
                            valor_unitario: value,
                            icms: icms,
                            ipi: ipi,
                            frete: frete,
                            custo_total_entrada: custoTotal
                        };
                        transaction.set(newMovementRef, movementData);
                    }
                }

                // Final writes for all updated product documents
                for (const [productId, productData] of productsToUpdate.entries()) {
                    const productRef = doc(db, 'produtos', productId);
                    transaction.update(productRef, { locacoes: productData.locacoes });
                }
            });

            alert("Operação concluída com sucesso! Os dados serão atualizados.");
            await fetchAllData(); // Refetch all data to get the latest state
            btnListItems.click(); // Re-list the items to show the updated state

        } catch (error) {
            console.error("Erro ao confirmar movimentações:", error);
            alert("Ocorreu um erro ao salvar as alterações: " + error.message);
        } finally {
            btnConfirmMovement.disabled = false;
            btnConfirmMovement.textContent = 'Confirmar Movimentação';
        }
    });

    filterNoQuantity.addEventListener('change', applyFilters);
    filterNoValue.addEventListener('change', applyFilters);

    // Initial fetch of all data
    fetchAllData();
});
