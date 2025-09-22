import { db } from './firebase-config.js';
import { collection, getDocs, query, where, doc, serverTimestamp, runTransaction, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- Custo Médio ---
// Função copiada de 'movimentacoes.js' para manter a consistência da regra de negócio.
async function atualizarCustoMedioProduto(produtoId) {
    if (!produtoId) return;

    const q = query(
        collection(db, 'movimentacoes'),
        where("productId", "==", produtoId),
        where("tipo", "==", "entrada")
    );
    const movementsSnapshot = await getDocs(q);

    let totalCost = 0;
    let totalQuantityForAvg = 0;

    movementsSnapshot.forEach(doc => {
        const mov = doc.data();
        // Apenas movimentações com custo e quantidade válidos entram no cálculo.
        if (mov.custo_total_entrada && mov.custo_total_entrada > 0 && mov.quantidade > 0) {
            totalCost += mov.custo_total_entrada;
            totalQuantityForAvg += mov.quantidade;
        }
    });

    const novoCustoMedio = totalQuantityForAvg > 0 ? totalCost / totalQuantityForAvg : 0;
    const productRef = doc(db, 'produtos', produtoId);

    // Usando set com merge:true para criar ou atualizar o campo 'valorMedio'.
    await setDoc(productRef, { valorMedio: novoCustoMedio }, { merge: true });

    console.log(`Custo médio do produto ${produtoId} atualizado para ${novoCustoMedio.toFixed(2)}`);
}


document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Inventario carregada.");


    // DOM Elements
    const startAddressInput = document.getElementById('start-address');
    const endAddressInput = document.getElementById('end-address');
    const maskOptions = {
        mask: '0-L-00-L',
        definitions: {
            'L': {
                mask: /[A-Z]/,
            }
        },
        prepare: str => str.toUpperCase(),
    };
    IMask(startAddressInput, maskOptions);
    IMask(endAddressInput, maskOptions);
    const btnListItems = document.getElementById('btn-list-items');
    const tableBody = document.querySelector('#table-implementacao tbody');
    const filterNoQuantity = document.getElementById('filter-no-quantity');
    const filterNoValue = document.getElementById('filter-no-value');
    const filterHideUpdated = document.getElementById('filter-hide-updated');
    const btnConfirmMovement = document.getElementById('btn-confirm-movement');

    let allProducts = [];
    let implementationMovements = {};
    let tiposEntradaMap = {};
    let tiposSaidaMap = {}; // Armazena as configurações dos tipos de saída

    // --- DATA FETCHING ---
    const normalizeStr = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

    async function fetchAllData() {
        btnListItems.disabled = true;
        btnConfirmMovement.disabled = true;
        btnListItems.textContent = 'Carregando...';
        try {
            // Fetch all products
            const productsSnapshot = await getDocs(collection(db, 'produtos'));
            allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Carregados ${allProducts.length} produtos.`);

            // Fetch 'Tipos de Entrada' configuration
            const tiposEntradaSnapshot = await getDocs(collection(db, 'tipos_entrada'));
            tiposEntradaMap = {};
            tiposEntradaSnapshot.forEach(doc => {
                tiposEntradaMap[doc.id] = { id: doc.id, ...doc.data() };
            });
            console.log(`Carregados ${Object.keys(tiposEntradaMap).length} tipos de entrada.`);

            // Fetch 'Tipos de Saída' configuration
            const tiposSaidaSnapshot = await getDocs(collection(db, 'tipos_saida'));
            tiposSaidaMap = {};
            tiposSaidaSnapshot.forEach(doc => {
                tiposSaidaMap[doc.id] = { id: doc.id, ...doc.data() };
            });
            console.log(`Carregados ${Object.keys(tiposSaidaMap).length} tipos de saída.`);

            // Fetch 'Locais' to populate the new filter dropdown
            const locaisSnapshot = await getDocs(collection(db, 'locais'));
            const localSelect = document.getElementById('filter-local');
            // Add a "Todos" option first
            const allOption = document.createElement('option');
            allOption.value = ""; // Empty value for "All"
            allOption.textContent = "Todos";
            localSelect.appendChild(allOption);
            // Populate with other locations
            locaisSnapshot.forEach(doc => {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = doc.data().nome;
                localSelect.appendChild(option);
            });


            // Find necessary movement type IDs using a robust method
            const implementacaoEntryType = Object.values(tiposEntradaMap).find(t => normalizeStr(t.nome) === 'implementacao');
            const inventarioEntryType = Object.values(tiposEntradaMap).find(t => normalizeStr(t.nome) === 'inventario');
            const inventarioExitType = Object.values(tiposSaidaMap).find(t => normalizeStr(t.nome) === 'inventario');

            // Reset and fetch all relevant movements
            implementationMovements = {}; // This will now be a map of keys to arrays of movements

            const queries = [];
            if (implementacaoEntryType) {
                queries.push(getDocs(query(collection(db, 'movimentacoes'), where("tipo_entradaId", "==", implementacaoEntryType.id))));
            } else {
                console.warn("Tipo de entrada 'Implementação' não encontrado.");
            }
            if (inventarioEntryType) {
                queries.push(getDocs(query(collection(db, 'movimentacoes'), where("tipo_entradaId", "==", inventarioEntryType.id))));
            } else {
                console.warn("Tipo de entrada 'Inventário' não encontrado.");
            }
            if (inventarioExitType) {
                queries.push(getDocs(query(collection(db, 'movimentacoes'), where("tipo_saidaId", "==", inventarioExitType.id))));
            } else {
                console.warn("Tipo de saída 'Inventário' não encontrado.");
            }

            const snapshots = await Promise.all(queries);

            const allRelevantMovements = [];
            snapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    allRelevantMovements.push({ id: doc.id, ...doc.data() });
                });
            });

            // Group movements by product-location key for easy lookup in renderTable
            allRelevantMovements.forEach(mov => {
                if (mov.productId && mov.locacao) {
                    const key = `${mov.productId}-${mov.locacao}`;
                    if (!implementationMovements[key]) {
                        implementationMovements[key] = [];
                    }
                    implementationMovements[key].push(mov);
                }
            });

            console.log(`Carregados ${allRelevantMovements.length} movimentos de inventário/implementação.`);

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            alert("Falha ao carregar dados iniciais. Verifique o console.");
        } finally {
            btnListItems.disabled = false;
            btnConfirmMovement.disabled = false;
            btnListItems.textContent = 'Listar Itens';
        }
    }

    // --- RENDERING (REBUILT) ---
    function renderTable(items) {
        tableBody.innerHTML = '';

        if (items.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum item encontrado para o range de endereçamento informado.</td></tr>';
            return;
        }

        const getPendingQtde = (key) => localStorage.getItem(`pending_qtde_${key}`);
        const setPendingQtde = (key, value) => {
            if (value === '' || value === null || value === undefined) {
                localStorage.removeItem(`pending_qtde_${key}`);
            } else {
                localStorage.setItem(`pending_qtde_${key}`, value);
            }
        };

        items.forEach(item => {
            const product = item;
            const loc = item.locacao;
            const key = `${product.id}-${loc.locacao}`;

            const row = document.createElement('tr');
            row.dataset.productId = product.id;
            row.dataset.locacao = loc.locacao;
            row.dataset.localId = loc.localId;

            const saldoAtual = loc.estoque || 0;
            const pendingQtde = getPendingQtde(key);

            // --- Status Column Logic ---
            let statusCellHtml = '';
            const movementsForItem = implementationMovements[key] || [];
            if (movementsForItem.length > 0) {
                movementsForItem.sort((a, b) => b.data.toMillis() - a.data.toMillis());
                const lastMovement = movementsForItem[0];
                if (lastMovement.data) {
                    const lastUpdateDate = lastMovement.data.toDate().toLocaleString('pt-BR');
                    statusCellHtml = `<span style="color: #28a745; font-weight: bold;">Atualizado</span><br><small>${lastUpdateDate}</small>`;
                }
            }

            // --- Find suggested values for cost fields ---
            const allMovementsForThisProduct = Object.values(implementationMovements).flat().filter(m => m.productId === product.id && m.tipo === 'entrada' && m.custo_total_entrada > 0 && m.data).sort((a, b) => b.data.toMillis() - a.data.toMillis());
            let suggestedData = { valor_unitario: '', icms: '', ipi: '', frete: '' };
            if (allMovementsForThisProduct.length > 0) {
                suggestedData = allMovementsForThisProduct[0];
            }

            const qtdeInputHtml = `<input type="number" class="form-control qtde-input" value="${pendingQtde || ''}" min="0" step="any" placeholder="Nova Qtde">`;
            const valueInputHtml = `<input type="number" class="form-control value-input" value="${suggestedData.valor_unitario || ''}" min="0" step="0.01" title="Valor sugerido da última implementação deste produto">`;
            const icmsInputHtml = `<input type="number" class="form-control icms-input" value="${suggestedData.icms || ''}" min="0" step="0.01" title="ICMS sugerido da última implementação deste produto">`;
            const ipiInputHtml = `<input type="number" class="form-control ipi-input" value="${suggestedData.ipi || ''}" min="0" step="0.01" title="IPI sugerido da última implementação deste produto">`;
            const freteInputHtml = `<input type="number" class="form-control frete-input" value="${suggestedData.frete || ''}" min="0" step="0.01" title="Frete sugerido da última implementação deste produto">`;

            row.innerHTML = `
                <td>${product.codigo}</td>
                <td>${product.descricao}</td>
                <td>${loc.locacao}</td>
                <td class="saldo-atual">${saldoAtual}</td>
                <td>${qtdeInputHtml}</td>
                <td>${valueInputHtml}</td>
                <td>${icmsInputHtml}</td>
                <td>${ipiInputHtml}</td>
                <td>${freteInputHtml}</td>
                <td>${statusCellHtml}</td>
            `;
            tableBody.appendChild(row);

            const qtdeInput = row.querySelector('.qtde-input');
            qtdeInput.addEventListener('input', (e) => {
                setPendingQtde(key, e.target.value);
            });
        });
    }


    // --- EVENT LISTENERS & FILTERS (REBUILT) ---
    function applyFilters() {
        const noQuantityChecked = filterNoQuantity.checked;
        const noValueChecked = filterNoValue.checked;
        const hideUpdatedChecked = filterHideUpdated.checked;

        document.querySelectorAll('#table-implementacao tbody tr').forEach(row => {
            if (!row.dataset.productId) return;

            const quantityInput = row.querySelector('.qtde-input');
            const valueInput = row.querySelector('.value-input');
            const statusCell = row.cells[9]; // 10th column

            const hasQuantity = quantityInput && quantityInput.value && parseFloat(quantityInput.value) > 0;
            const hasValue = valueInput && valueInput.value && parseFloat(valueInput.value) > 0;
            const isUpdated = statusCell && statusCell.innerHTML.includes('Atualizado');

            let shouldShow = true;
            if (noQuantityChecked && hasQuantity) shouldShow = false;
            if (noValueChecked && hasValue) shouldShow = false;
            if (hideUpdatedChecked && isUpdated) shouldShow = false;

            row.style.display = shouldShow ? '' : 'none';
        });
    }

    btnListItems.addEventListener('click', () => {
        const startAddress = startAddressInput.value.toUpperCase().trim();
        const endAddress = endAddressInput.value.toUpperCase().trim();
        const selectedLocalId = document.getElementById('filter-local').value;
        const addressPattern = /^\d{1}-[A-Z]-\d{2}-[A-Z]$/;

        if (!startAddress || !endAddress) {
            alert("Por favor, preencha os endereçamentos inicial e final.");
            return;
        }

        if (!addressPattern.test(startAddress) || !addressPattern.test(endAddress)) {
            alert("O formato do endereço deve ser N-L-NN-L (Ex: 1-A-01-A).");
            return;
        }

        let itemsToRender = [];
        allProducts.forEach(product => {
            if (product.locacoes && product.locacoes.length > 0) {
                product.locacoes.forEach(loc => {
                    // Filter by selected local if one is chosen
                    if (selectedLocalId && loc.localId !== selectedLocalId) {
                        return; // Skip this location if it doesn't match the selected local
                    }

                    const currentLoc = loc.locacao.toUpperCase();
                    if (currentLoc >= startAddress && currentLoc <= endAddress) {
                        itemsToRender.push({ ...product, locacao: loc }); // Flatten
                    }
                });
            }
        });

        // 2. Sort the flattened list
        itemsToRender.sort((a, b) => {
            // Primary sort by address (locacao)
            const locacaoA = a.locacao.locacao.toUpperCase();
            const locacaoB = b.locacao.locacao.toUpperCase();
            if (locacaoA < locacaoB) return -1;
            if (locacaoA > locacaoB) return 1;

            // Secondary sort by product code
            const codigoA = a.codigo.toUpperCase();
            const codigoB = b.codigo.toUpperCase();
            if (codigoA < codigoB) return -1;
            if (codigoA > codigoB) return 1;

            return 0;
        });

        renderTable(itemsToRender);
        applyFilters();
    });

    // --- CONFIRM MOVEMENT LOGIC (REBUILT) ---
    btnConfirmMovement.addEventListener('click', async () => {
        const rowsToProcess = Array.from(tableBody.querySelectorAll('tr:not([style*="display: none"])'));

        if (rowsToProcess.length === 0 || !rowsToProcess[0].dataset.productId) {
            alert("Nenhum item visível para processar.");
            return;
        }

        // --- Find necessary movement types ---
        const implementacaoEntryType = Object.values(tiposEntradaMap).find(
            type => type.nome.toLowerCase() === 'implementação'
        );
        const inventarioEntryType = Object.values(tiposEntradaMap).find(
            type => type.nome.toLowerCase() === 'inventário'
        );
        const inventarioExitType = Object.values(tiposSaidaMap).find(
            type => type.nome.toLowerCase() === 'inventário'
        );

        if (!implementacaoEntryType) {
            alert('Erro Crítico: O tipo de entrada "Implementação" não foi encontrado. Crie-o em "Configurações -> Tipos de Entrada".');
            return;
        }
        if (!inventarioEntryType || !inventarioExitType) {
            alert('Erro Crítico: O tipo de movimento "Inventário" não foi encontrado. Crie-o em "Configurações -> Tipos de Entrada" e "Tipos de Saída".');
            return;
        }

        if (!confirm(`Confirmar as alterações para os ${rowsToProcess.length} itens visíveis?`)) {
            return;
        }

        btnConfirmMovement.disabled = true;
        btnConfirmMovement.textContent = 'Processando...';

        const productsToUpdateCost = new Set();
        const keysToClearFromStorage = [];

        try {
            const conversoesSnapshot = await getDocs(collection(db, 'conversoes'));
            const conversoesMap = new Map();
            conversoesSnapshot.forEach(doc => conversoesMap.set(doc.id, doc.data()));

            await runTransaction(db, async (transaction) => {
                const productsToUpdate = new Map();

                // Pre-fetch all product data needed for the transaction
                for (const row of rowsToProcess) {
                    const productId = row.dataset.productId;
                    if (productId && !productsToUpdate.has(productId)) {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error(`Produto com ID ${productId} não encontrado.`);
                        // Deep copy locacoes to avoid mutation issues
                        const productData = { ...productDoc.data(), locacoes: JSON.parse(JSON.stringify(productDoc.data().locacoes)) };
                        productsToUpdate.set(productId, productData);
                    }
                }

                for (const row of rowsToProcess) {
                    const qtdeInput = row.querySelector('.qtde-input');
                    if (!qtdeInput || !qtdeInput.value) {
                        continue; // Skip if no quantity is entered
                    }

                    const productId = row.dataset.productId;
                    const locacaoStr = row.dataset.locacao;
                    const saldoAtual = parseFloat(row.querySelector('.saldo-atual').textContent) || 0;
                    const qtde = parseFloat(qtdeInput.value);
                    const valorUnit = parseFloat(row.querySelector('.value-input').value) || 0;

                    const productData = productsToUpdate.get(productId);
                    if (!productData) continue;

                    const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === locacaoStr);
                    if (locacaoIndex === -1) throw new Error(`Locação ${locacaoStr} não encontrada no produto ${productData.codigo}.`);

                    const key = `${productId}-${locacaoStr}`;

                    // --- LOGIC IMPLEMENTATION ---

                    if (saldoAtual === 0) {
                        // Scenario 1: Initial Implementation
                        if (valorUnit <= 0) {
                            // Don't process, but keep qtde in localStorage
                            continue;
                        }

                        // BUG FIX: The conversion logic was incorrectly applied during initial implementation.
                        // The user enters the quantity and value in the standard unit on this screen,
                        // so no conversion should take place.
                        const quantidade = qtde; // Use qtde directly from the input

                        const icms = parseFloat(row.querySelector('.icms-input').value) || 0;
                        const ipi = parseFloat(row.querySelector('.ipi-input').value) || 0;
                        const frete = parseFloat(row.querySelector('.frete-input').value) || 0;
                        const custoTotal = (quantidade * valorUnit) + icms + ipi + frete;

                        // Update stock
                        if (implementacaoEntryType.movimenta_estoque) {
                            productData.locacoes[locacaoIndex].estoque = quantidade;
                        }

                        // Create movement
                        const newMovementRef = doc(collection(db, 'movimentacoes'));
                        transaction.set(newMovementRef, {
                            productId: productId,
                            tipo: 'entrada',
                            tipo_entradaId: implementacaoEntryType.id,
                            quantidade: quantidade, // This is the quantity in the standard unit
                            quantidade_compra: quantidade, // For consistency, as no conversion happened
                            locacao: locacaoStr,
                            data: serverTimestamp(),
                            observacao: `Inventário inicial.`,
                            valor_unitario: valorUnit,
                            icms, ipi, frete,
                            custo_total_entrada: custoTotal
                        });

                        productsToUpdateCost.add(productId);
                        keysToClearFromStorage.push(key);

                    } else {
                        // Scenario 2: Inventory Adjustment
                        const diff = qtde - saldoAtual;
                        if (diff === 0) {
                            keysToClearFromStorage.push(key); // Clear storage if user sets qtde to current saldo
                            continue;
                        }

                        // Update stock
                        productData.locacoes[locacaoIndex].estoque = qtde;

                        // Create adjustment movement (no cost)
                        const newMovementRef = doc(collection(db, 'movimentacoes'));
                        if (diff > 0) {
                            // Positive adjustment -> ENTRADA
                            transaction.set(newMovementRef, {
                                productId,
                                tipo: 'entrada',
                                tipo_entradaId: inventarioEntryType.id,
                                quantidade: diff,
                                locacao: locacaoStr,
                                data: serverTimestamp(),
                                observacao: `Ajuste de inventário (Entrada). Saldo anterior: ${saldoAtual}.`
                            });
                        } else {
                            // Negative adjustment -> SAIDA
                            transaction.set(newMovementRef, {
                                productId,
                                tipo: 'saida',
                                tipo_saidaId: inventarioExitType.id,
                                quantidade: Math.abs(diff),
                                locacao: locacaoStr,
                                data: serverTimestamp(),
                                observacao: `Ajuste de inventário (Saída). Saldo anterior: ${saldoAtual}.`
                            });
                        }
                        keysToClearFromStorage.push(key);
                    }
                } // End of row loop

                // Commit all product updates
                for (const [productId, productData] of productsToUpdate.entries()) {
                    const productRef = doc(db, 'produtos', productId);
                    transaction.update(productRef, { locacoes: productData.locacoes });
                }
            }); // End of transaction

            // --- Post-Transaction Operations ---

            // Recalculate average cost only for affected products
            if (productsToUpdateCost.size > 0 && implementacaoEntryType.recalcula_custo_medio) {
                console.log("Recalculando custo médio para produtos de implementação...");
                const costUpdatePromises = Array.from(productsToUpdateCost).map(id => atualizarCustoMedioProduto(id));
                await Promise.all(costUpdatePromises);
            }

            // Clear localStorage for processed items
            keysToClearFromStorage.forEach(key => localStorage.removeItem(`pending_qtde_${key}`));

            alert("Operação concluída com sucesso! Os dados serão atualizados.");
            await fetchAllData();
            btnListItems.click();

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
    filterHideUpdated.addEventListener('change', applyFilters);

    fetchAllData();
});
