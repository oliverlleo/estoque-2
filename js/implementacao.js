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
    console.log("Página de Implementação carregada.");

    function formatAddressInput(e) {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        let formattedValue = '';

        if (value.length > 0) {
            // 01
            formattedValue += value.substring(0, 2).replace(/[^0-9]/g, '');
        }
        if (value.length > 2) {
            // 01-A
            formattedValue += '-' + value.substring(2, 3).replace(/[^A-Z]/g, '');
        }
        if (value.length > 3) {
            // 01-A-01
            formattedValue += '-' + value.substring(3, 5).replace(/[^0-9]/g, '');
        }
        if (value.length > 5) {
            // 01-A-01-A
            formattedValue += '-' + value.substring(5, 6).replace(/[^A-Z]/g, '');
        }

        e.target.value = formattedValue;
    }

    // DOM Elements
    const startAddressInput = document.getElementById('start-address');
    const endAddressInput = document.getElementById('end-address');
    const btnListItems = document.getElementById('btn-list-items');
    const tableBody = document.querySelector('#table-implementacao tbody');
    const filterNoQuantity = document.getElementById('filter-no-quantity');
    const filterNoValue = document.getElementById('filter-no-value');
    const btnConfirmMovement = document.getElementById('btn-confirm-movement');

    let allProducts = [];
    let implementationMovements = {};
    let tiposEntradaMap = {};
    let tiposSaidaMap = {}; // Armazena as configurações dos tipos de saída

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


            // Now, find the 'Implementação' type ID to query movements
            const implementacaoEntryType = Object.values(tiposEntradaMap).find(
                type => type.nome.toLowerCase() === 'implementação'
            );

            implementationMovements = {};
            if (implementacaoEntryType) {
                const movQuery = query(collection(db, 'movimentacoes'), where("tipo_entradaId", "==", implementacaoEntryType.id));
                const movementsSnapshot = await getDocs(movQuery);

                movementsSnapshot.docs.forEach(doc => {
                    const mov = doc.data();
                    if (mov.productId && mov.locacao) {
                        const key = `${mov.productId}-${mov.locacao}`;
                        implementationMovements[key] = { id: doc.id, ...mov };
                    }
                });
                console.log(`Carregados ${Object.keys(implementationMovements).length} movimentos de implementação.`);
            } else {
                console.warn('O tipo de entrada "Implementação" não foi encontrado. A tela pode não funcionar como esperado.');
            }

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
            // Updated colspan to 9
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum item encontrado para o range de endereçamento informado.</td></tr>';
            return;
        }

        // Helper to get/set pending values from localStorage
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

            // --- Find suggested values for cost fields (Valor, ICMS, IPI, Frete) ---
            const allMovementsForThisProduct = Object.values(implementationMovements)
                .filter(m => m.productId === product.id && m.data)
                .sort((a, b) => b.data.toMillis() - a.data.toMillis());

            let suggestedData = { valor_unitario: '', icms: '', ipi: '', frete: '' };
            if (allMovementsForThisProduct.length > 0) {
                suggestedData = allMovementsForThisProduct[0];
            }

            // --- Create input fields ---
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
            `;
            tableBody.appendChild(row);

            // Add event listener for the new qtde input to save to localStorage
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

        document.querySelectorAll('#table-implementacao tbody tr').forEach(row => {
            if (!row.dataset.productId) return;

            const quantityInput = row.querySelector('.qtde-input'); // Changed to qtde-input
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
        const addressPattern = /^\d{2}-[A-Z]-\d{2}-[A-Z]$/;

        if (!startAddress || !endAddress) {
            alert("Por favor, preencha os endereçamentos inicial e final.");
            return;
        }

        if (!addressPattern.test(startAddress) || !addressPattern.test(endAddress)) {
            alert("O formato do endereço deve ser DD-L-DD-L (Ex: 01-A-01-A).");
            return;
        }

        let itemsToRender = [];
        allProducts.forEach(product => {
            if (product.locacoes && product.locacoes.length > 0) {
                product.locacoes.forEach(loc => {
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

                        let quantidadeParaEstoque = qtde;
                        let quantidadeCompra = qtde;
                        if (productData.conversaoId && conversoesMap.has(productData.conversaoId)) {
                            const regra = conversoesMap.get(productData.conversaoId);
                            const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                            const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                            if (fator_qtd_compra > 0) {
                                quantidadeParaEstoque = (qtde / fator_qtd_compra) * fator_qtd_padrao;
                            }
                        }

                        const icms = parseFloat(row.querySelector('.icms-input').value) || 0;
                        const ipi = parseFloat(row.querySelector('.ipi-input').value) || 0;
                        const frete = parseFloat(row.querySelector('.frete-input').value) || 0;
                        const custoTotal = (quantidadeCompra * valorUnit) + icms + ipi + frete;

                        // Update stock
                        if (implementacaoEntryType.movimenta_estoque) {
                            productData.locacoes[locacaoIndex].estoque = quantidadeParaEstoque;
                        }

                        // Create movement
                        const newMovementRef = doc(collection(db, 'movimentacoes'));
                        transaction.set(newMovementRef, {
                            productId: productId,
                            tipo: 'entrada',
                            tipo_entradaId: implementacaoEntryType.id,
                            quantidade: quantidadeParaEstoque,
                            quantidade_compra: quantidadeCompra,
                            locacao: locacaoStr,
                            data: serverTimestamp(),
                            observacao: `Implementação inicial de inventário.`,
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

    startAddressInput.addEventListener('input', formatAddressInput);
    endAddressInput.addEventListener('input', formatAddressInput);

    filterNoQuantity.addEventListener('change', applyFilters);
    filterNoValue.addEventListener('change', applyFilters);

    fetchAllData();
});
