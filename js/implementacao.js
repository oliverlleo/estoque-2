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

    // --- RENDERING (MODIFICADO) ---
    function renderTable(items) {
        tableBody.innerHTML = '';

        if (items.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum item encontrado para o range de endereçamento informado.</td></tr>';
            return;
        }

        items.forEach(item => {
            const product = item;
            const loc = item.locacao;
            const key = `${product.id}-${loc.locacao}`;
            const existingMovement = implementationMovements[key];

            const row = document.createElement('tr');
            row.dataset.productId = product.id;
            row.dataset.locacao = loc.locacao;
            row.dataset.localId = loc.localId;

            // Guarda os valores originais para comparação no momento de salvar
            const originalQty = loc.estoque || 0;
            // O valor unitário agora vem do custo médio do produto ou da movimentação existente.
            const originalValue = existingMovement ? (existingMovement.valor_unitario || 0) : (product.valorMedio || 0);

            row.dataset.originalQuantity = originalQty;
            row.dataset.originalValue = originalValue;
            if (existingMovement) {
                row.dataset.movementId = existingMovement.id;
                row.classList.add('implemented');
            }

            // Todos os campos são editáveis por padrão agora.
            const quantityInputHtml = `<input type="number" class="form-control quantity-input" value="${originalQty}" min="0" step="any">`;
            const valueInputHtml = `<input type="number" class="form-control value-input" value="${originalValue.toFixed(2)}" min="0" step="0.01">`;
            const icmsInputHtml = `<input type="number" class="form-control icms-input" value="${existingMovement?.icms || ''}" min="0" step="0.01">`;
            const ipiInputHtml = `<input type="number" class="form-control ipi-input" value="${existingMovement?.ipi || ''}" min="0" step="0.01">`;
            const freteInputHtml = `<input type="number" class="form-control frete-input" value="${existingMovement?.frete || ''}" min="0" step="0.01">`;

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

        itemsToRender.sort((a, b) => {
            const locA = a.locacao.locacao.toUpperCase();
            const locB = b.locacao.locacao.toUpperCase();
            if (locA < locB) return -1;
            if (locA > locB) return 1;
            const codA = a.codigo.toUpperCase();
            const codB = b.codigo.toUpperCase();
            if (codA < codB) return -1;
            if (codA > codB) return 1;
            return 0;
        });

        renderTable(itemsToRender);
        applyFilters();
    });

    // --- CONFIRM MOVEMENT LOGIC (RECONSTRUÍDO E CORRIGIDO) ---
    btnConfirmMovement.addEventListener('click', async () => {
        const rowsToProcess = Array.from(tableBody.querySelectorAll('tr:not([style*="display: none"])'));
        if (rowsToProcess.length === 0 || !rowsToProcess[0].dataset.productId) {
            alert("Nenhum item visível para processar.");
            return;
        }

        const implementacaoEntryType = Object.values(tiposEntradaMap).find(t => t.nome.toLowerCase() === 'implementação');
        if (!implementacaoEntryType) {
            alert('Erro Crítico: O tipo de entrada "Implementação" não foi encontrado.');
            return;
        }

        if (!confirm(`Confirmar as alterações para os itens visíveis?`)) return;

        btnConfirmMovement.disabled = true;
        btnConfirmMovement.textContent = 'Processando...';

        const productsToUpdateCost = new Set();
        const productsDataCache = new Map();

        try {
            await runTransaction(db, async (transaction) => {
                // Pré-carregar dados dos produtos para evitar leituras repetidas
                for (const row of rowsToProcess) {
                    const productId = row.dataset.productId;
                    if (!productsDataCache.has(productId)) {
                        const productRef = doc(db, 'produtos', productId);
                        const productDoc = await transaction.get(productRef);
                        if (!productDoc.exists()) throw new Error(`Produto ${productId} não encontrado.`);
                        productsDataCache.set(productId, productDoc.data());
                    }
                }

                for (const row of rowsToProcess) {
                    const productId = row.dataset.productId;
                    const locacao = row.dataset.locacao;
                    const movementId = row.dataset.movementId;
                    const originalQty = parseFloat(row.dataset.originalQuantity);
                    const originalVal = parseFloat(row.dataset.originalValue);

                    const newQty = parseFloat(row.querySelector('.quantity-input').value) || 0;
                    const newVal = parseFloat(row.querySelector('.value-input').value) || 0;
                    const icms = parseFloat(row.querySelector('.icms-input').value) || 0;
                    const ipi = parseFloat(row.querySelector('.ipi-input').value) || 0;
                    const frete = parseFloat(row.querySelector('.frete-input').value) || 0;

                    const qtyChanged = newQty !== originalQty;
                    const valChanged = newVal.toFixed(2) !== originalVal.toFixed(2);

                    // **A CORREÇÃO PRINCIPAL ESTÁ AQUI**
                    // Pula a linha se NADA foi alterado pelo usuário.
                    if (!qtyChanged && !valChanged) {
                        continue;
                    }

                    const isNewImplementation = !movementId;
                    const productData = productsDataCache.get(productId);
                    const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === locacao);
                    if (locacaoIndex === -1) throw new Error(`Locação ${locacao} não encontrada para o produto ${productData.codigo}`);

                    // Cenário 1: Nova Implementação (item sem movimentação prévia)
                    if (isNewImplementation) {
                        // Só cria a movimentação se tiver quantidade E valor.
                        if (newQty > 0 && newVal > 0) {
                            productData.locacoes[locacaoIndex].estoque = newQty;
                            const custoTotal = (newQty * newVal) + icms + ipi + frete;
                            const newMovementRef = doc(collection(db, 'movimentacoes'));
                            transaction.set(newMovementRef, {
                                productId, locacao,
                                tipo: 'entrada',
                                tipo_entradaId: implementacaoEntryType.id,
                                quantidade: newQty,
                                valor_unitario: newVal,
                                icms, ipi, frete,
                                custo_total_entrada: custoTotal,
                                data: serverTimestamp(),
                                observacao: 'Implementação inicial via tela de inventário.'
                            });
                            productsToUpdateCost.add(productId);
                        }
                        // Se não atender à condição, simplesmente continua, pois a alteração de estoque (se houver)
                        // será tratada no Cenário 2a.
                    }

                    // Cenário 2: Item Existente (com movimentação prévia)
                    // 2a: Mudança de Quantidade (SEMPRE que a quantidade for diferente)
                    if (qtyChanged) {
                        const diff = newQty - originalQty;
                        productData.locacoes[locacaoIndex].estoque = newQty;

                        const inventoryMovementRef = doc(collection(db, 'movimentacoes'));
                        transaction.set(inventoryMovementRef, {
                            productId, locacao,
                            tipo: 'inventario',
                            subTipo: diff > 0 ? 'entrada' : 'saida',
                            quantidade: Math.abs(diff),
                            data: serverTimestamp(),
                            observacao: `Ajuste de ${originalQty} para ${newQty} via tela de inventário.`
                        });
                    }

                    // 2b: Mudança de Valor (SÓ se o valor mudou E JÁ EXISTIA uma movimentação)
                    if (valChanged && !isNewImplementation) {
                        const movementRef = doc(db, 'movimentacoes', movementId);
                        const custoTotal = (newQty * newVal) + icms + ipi + frete;
                        transaction.update(movementRef, {
                            valor_unitario: newVal,
                            icms, ipi, frete,
                            custo_total_entrada: custoTotal,
                            data_atualizacao: serverTimestamp()
                        });
                        // Recalcula o custo médio apenas se um valor foi adicionado onde não havia
                        if (originalVal === 0 && newVal > 0) {
                            productsToUpdateCost.add(productId);
                        }
                    }
                }

                // Salvar todas as alterações de estoque no final
                for (const [id, pData] of productsDataCache.entries()) {
                    const productRef = doc(db, 'produtos', id);
                    transaction.update(productRef, { locacoes: pData.locacoes });
                }
            });

            // Após a transação, recalcular custos médios
            if (productsToUpdateCost.size > 0) {
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

    startAddressInput.addEventListener('input', formatAddressInput);
    endAddressInput.addEventListener('input', formatAddressInput);

    filterNoQuantity.addEventListener('change', applyFilters);
    filterNoValue.addEventListener('change', applyFilters);

    fetchAllData();
});
