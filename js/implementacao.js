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
    let tiposEntradaMap = {}; // Armazena as configurações dos tipos de entrada

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

            // Fetch 'Tipos de Entrada' configuration first
            const tiposEntradaSnapshot = await getDocs(collection(db, 'tipos_entrada'));
            tiposEntradaMap = {};
            tiposEntradaSnapshot.forEach(doc => {
                tiposEntradaMap[doc.id] = { id: doc.id, ...doc.data() };
            });
            console.log(`Carregados ${Object.keys(tiposEntradaMap).length} tipos de entrada.`);

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

    // --- RENDERING (sem alterações) ---
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
                        row.dataset.movementId = existingMovement.id;
                        row.classList.add('implemented');
                        quantityInputHtml = `<input type="number" class="form-control quantity-input" value="${existingMovement.quantidade}" disabled title="Quantidade já implementada.">`;
                        valueInputHtml = `<input type="number" class="form-control value-input" value="${existingMovement.valor_unitario || ''}" min="0" step="0.01">`;
                        icmsInputHtml = `<input type="number" class="form-control icms-input" value="${existingMovement.icms || ''}" min="0" step="0.01">`;
                        ipiInputHtml = `<input type="number" class="form-control ipi-input" value="${existingMovement.ipi || ''}" min="0" step="0.01">`;
                        freteInputHtml = `<input type="number" class="form-control frete-input" value="${existingMovement.frete || ''}" min="0" step="0.01">`;
                    } else {
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


    // --- EVENT LISTENERS & FILTERS (sem alterações) ---
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

    // --- CONFIRM MOVEMENT LOGIC (REBUILT) ---
    btnConfirmMovement.addEventListener('click', async () => {
        const rowsToProcess = Array.from(tableBody.querySelectorAll('tr:not([style*="display: none"])'));

        if (rowsToProcess.length === 0 || !rowsToProcess[0].dataset.productId) {
            alert("Nenhum item visível para processar.");
            return;
        }

        // 1. Encontrar o tipo de entrada "Implementação"
        const implementacaoEntryType = Object.values(tiposEntradaMap).find(
            type => type.nome.toLowerCase() === 'implementação'
        );

        if (!implementacaoEntryType) {
            alert('Erro Crítico: O tipo de entrada "Implementação" não foi encontrado nas configurações. Por favor, vá em "Configurações -> Tipos de Entrada" e crie um com o nome exato "Implementação".');
            return;
        }

        if (!confirm(`Confirmar as alterações para os itens visíveis?`)) {
            return;
        }

        btnConfirmMovement.disabled = true;
        btnConfirmMovement.textContent = 'Processando...';

        const productsToUpdateCost = new Set();

        try {
            // Pré-busca de todas as regras de conversão para evitar leituras dentro do loop da transação
            const conversoesSnapshot = await getDocs(collection(db, 'conversoes'));
            const conversoesMap = new Map();
            conversoesSnapshot.forEach(doc => conversoesMap.set(doc.id, doc.data()));

            await runTransaction(db, async (transaction) => {
                const productsToUpdateStock = new Map();

                for (const row of rowsToProcess) {
                    const quantityInput = row.querySelector('.quantity-input');
                    const isNewImplementation = !quantityInput.disabled && parseFloat(quantityInput.value) > 0;

                    if (isNewImplementation) {
                        const productId = row.dataset.productId;
                        if (!productsToUpdateStock.has(productId)) {
                            const productRef = doc(db, 'produtos', productId);
                            const productDoc = await transaction.get(productRef);
                            if (!productDoc.exists()) throw new Error(`Produto com ID ${productId} não encontrado.`);
                            productsToUpdateStock.set(productId, { ...productDoc.data(), locacoes: JSON.parse(JSON.stringify(productDoc.data().locacoes)) });
                        }
                    }
                }

                for (const row of rowsToProcess) {
                    const quantityInput = row.querySelector('.quantity-input');
                    const quantity = parseFloat(quantityInput.value) || 0;
                    const isAlreadyImplemented = quantityInput.disabled;
                    const productId = row.dataset.productId;

                    const value = parseFloat(row.querySelector('.value-input').value) || 0;
                    const icms = parseFloat(row.querySelector('.icms-input').value) || 0;
                    const ipi = parseFloat(row.querySelector('.ipi-input').value) || 0;
                    const frete = parseFloat(row.querySelector('.frete-input').value) || 0;

                    if (isAlreadyImplemented) {
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
                            productsToUpdateCost.add(productId);
                        }
                    } else if (quantity > 0) {
                        const locacaoStr = row.dataset.locacao;
                        const productData = productsToUpdateStock.get(productId);

                        let quantidadeParaEstoque = quantity;
                        let quantidadeCompra = quantity;

                        if (productData.conversaoId && conversoesMap.has(productData.conversaoId)) {
                            const regra = conversoesMap.get(productData.conversaoId);
                            const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                            const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                            if (fator_qtd_compra > 0) {
                                quantidadeParaEstoque = (quantity / fator_qtd_compra) * fator_qtd_padrao;
                            }
                        }

                        const custoTotal = (quantidadeCompra * value) + icms + ipi + frete;

                        const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === locacaoStr);
                        if (locacaoIndex === -1) throw new Error(`Locação ${locacaoStr} não encontrada no produto ${productData.codigo}.`);

                        if (implementacaoEntryType.movimenta_estoque) {
                            productData.locacoes[locacaoIndex].estoque = (productData.locacoes[locacaoIndex].estoque || 0) + quantidadeParaEstoque;
                        }

                        const newMovementRef = doc(collection(db, 'movimentacoes'));
                        const movementData = {
                            productId: productId,
                            tipo: 'entrada',
                            tipo_entradaId: implementacaoEntryType.id,
                            quantidade: quantidadeParaEstoque,
                            quantidade_compra: quantidadeCompra,
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
                        productsToUpdateCost.add(productId);
                    }
                }

                for (const [productId, productData] of productsToUpdateStock.entries()) {
                    const productRef = doc(db, 'produtos', productId);
                    transaction.update(productRef, { locacoes: productData.locacoes });
                }
            });

            if (implementacaoEntryType.recalcula_custo_medio) {
                console.log("Recalculando custo médio para produtos afetados...");
                const costUpdatePromises = Array.from(productsToUpdateCost).map(id => atualizarCustoMedioProduto(id));
                await Promise.all(costUpdatePromises);
            }

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

    fetchAllData();
});
