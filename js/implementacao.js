import { db } from './firebase-config.js';
import { collection, getDocs, query, where, doc, serverTimestamp, runTransaction, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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
    let allImplementationMovements = []; // Corrected: To store all implementation movements
    let tiposEntradaMap = {};
    let tiposSaidaMap = {};
    let tempInventoryData = {};

    // --- DATA FETCHING ---

    async function fetchAllData() {
        btnListItems.disabled = true;
        btnConfirmMovement.disabled = true;
        btnListItems.textContent = 'Carregando...';
        try {
            // Fetch all products
            const productsSnapshot = await getDocs(collection(db, 'produtos'));
            allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch 'Tipos de Entrada'
            const tiposEntradaSnapshot = await getDocs(collection(db, 'tipos_entrada'));
            tiposEntradaMap = {};
            tiposEntradaSnapshot.forEach(doc => {
                tiposEntradaMap[doc.id] = { id: doc.id, ...doc.data() };
            });

            // Fetch 'Tipos de Saida'
            const tiposSaidaSnapshot = await getDocs(collection(db, 'tipos_saida'));
            tiposSaidaMap = {};
            tiposSaidaSnapshot.forEach(doc => {
                tiposSaidaMap[doc.id] = { id: doc.id, ...doc.data() };
            });

            // Fetch temporary inventory data
            const tempSnapshot = await getDocs(collection(db, 'temp_inventario'));
            tempInventoryData = {};
            tempSnapshot.forEach(doc => {
                tempInventoryData[doc.id] = doc.data();
            });

            // Corrected: Fetch all implementation movements for suggestions
            const implementacaoEntryType = Object.values(tiposEntradaMap).find(
                type => type.nome.toLowerCase() === 'implementação'
            );
            allImplementationMovements = [];
            if (implementacaoEntryType) {
                const movQuery = query(collection(db, 'movimentacoes'), where("tipo_entradaId", "==", implementacaoEntryType.id));
                const movementsSnapshot = await getDocs(movQuery);
                movementsSnapshot.forEach(doc => {
                    allImplementationMovements.push(doc.data());
                });
            }

            console.log(`Dados carregados: ${allProducts.length} produtos, ${allImplementationMovements.length} movimentos de implementação, ${Object.keys(tempInventoryData).length} itens de inventário temporário.`);

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            alert("Falha ao carregar dados iniciais. Verifique o console.");
        } finally {
            btnListItems.disabled = false;
            btnConfirmMovement.disabled = false;
            btnListItems.textContent = 'Listar Itens';
        }
    }

    // --- RENDERING (REFEITO) ---
    function renderTable(items) {
        tableBody.innerHTML = '';

        if (items.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum item encontrado para o range de endereçamento informado.</td></tr>';
            return;
        }

        items.forEach(item => {
            const product = item;
            const loc = item.locacao;
            const key = `${product.id}-${loc.locacao}`;

            const tempData = tempInventoryData[key];

            const row = document.createElement('tr');
            row.dataset.productId = product.id;
            row.dataset.locacao = loc.locacao;
            row.dataset.localId = loc.localId;

            const saldoAtual = loc.estoque || 0;
            const qtdeValue = tempData ? tempData.qtde : '';

            const saldoAtualHtml = `<td class="saldo-atual">${saldoAtual}</td>`;
            const qtdeInputHtml = `<td><input type="number" class="form-control qtde-input" min="0" step="any" value="${qtdeValue}"></td>`;

            let valueInputHtml, icmsInputHtml, ipiInputHtml, freteInputHtml;

            if (saldoAtual > 0) {
                // Adjustment: fields are disabled and empty
                const title = 'O valor só é informado na implementação inicial.';
                valueInputHtml = `<input type="number" class="form-control value-input" value="" min="0" step="0.01" disabled title="${title}">`;
                icmsInputHtml = `<input type="number" class="form-control icms-input" value="" min="0" step="0.01" disabled>`;
                ipiInputHtml = `<input type="number" class="form-control ipi-input" value="" min="0" step="0.01" disabled>`;
                freteInputHtml = `<input type="number" class="form-control frete-input" value="" min="0" step="0.01" disabled>`;
            } else {
                // Initial Implementation: fields are enabled and suggest values
                const allMovementsForThisProduct = allImplementationMovements
                    .filter(m => m.productId === product.id && m.data)
                    .sort((a, b) => b.data.toMillis() - a.data.toMillis());

                let suggestedData = { valor_unitario: '', icms: '', ipi: '', frete: '' };
                if (allMovementsForThisProduct.length > 0) {
                    suggestedData = allMovementsForThisProduct[0];
                }

                const title = 'Valor unitário é obrigatório para implementação.';
                valueInputHtml = `<input type="number" class="form-control value-input" value="${suggestedData.valor_unitario || ''}" min="0" step="0.01" required title="${title}">`;
                icmsInputHtml = `<input type="number" class="form-control icms-input" value="${suggestedData.icms || ''}" min="0" step="0.01">`;
                ipiInputHtml = `<input type="number" class="form-control ipi-input" value="${suggestedData.ipi || ''}" min="0" step="0.01">`;
                freteInputHtml = `<input type="number" class="form-control frete-input" value="${suggestedData.frete || ''}" min="0" step="0.01">`;
            }

            row.innerHTML = `
                <td>${product.codigo}</td>
                <td>${product.descricao}</td>
                <td>${loc.locacao}</td>
                ${saldoAtualHtml}
                ${qtdeInputHtml}
                <td>${valueInputHtml}</td>
                <td>${icmsInputHtml}</td>
                <td>${ipiInputHtml}</td>
                <td>${freteInputHtml}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // --- Temporary Inventory Saving ---
    async function saveTempInventory(productId, locacao, qtde) {
        const key = `${productId}-${locacao}`;
        const tempDocRef = doc(db, 'temp_inventario', key);

        const parsedQtde = parseFloat(qtde);

        if (qtde.trim() !== '' && !isNaN(parsedQtde)) {
            try {
                await setDoc(tempDocRef, {
                    qtde: parsedQtde,
                    lastUpdated: serverTimestamp()
                });
            } catch (error) {
                console.error("Error saving temp inventory:", error);
            }
        } else {
            try {
                await deleteDoc(tempDocRef);
            } catch (error) {
                // Ignore error if doc doesn't exist
            }
        }
    }

    // --- EVENT LISTENERS & FILTERS ---
    function applyFilters() {
        const noQuantityChecked = filterNoQuantity.checked;
        const noValueChecked = filterNoValue.checked;

        document.querySelectorAll('#table-implementacao tbody tr').forEach(row => {
            if (!row.dataset.productId) return;

            const quantityInput = row.querySelector('.qtde-input');
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

        itemsToRender.sort((a, b) => a.locacao.locacao.localeCompare(b.locacao.locacao));

        renderTable(itemsToRender);
        applyFilters();
    });

    // --- CONFIRM MOVEMENT LOGIC (REBUILT FROM SCRATCH) ---
    btnConfirmMovement.addEventListener('click', async () => {
        const rowsToProcess = Array.from(tableBody.querySelectorAll('tr:not([style*="display: none"])'));

        if (rowsToProcess.length === 0 || !rowsToProcess[0].dataset.productId) {
            alert("Nenhum item visível para processar.");
            return;
        }

        // --- Find movement type configurations ---
        const implementacaoEntryType = Object.values(tiposEntradaMap).find(t => t.nome.toLowerCase() === 'implementação');
        const inventarioEntryType = Object.values(tiposEntradaMap).find(t => t.nome.toLowerCase() === 'inventario');
        const inventarioExitType = Object.values(tiposSaidaMap).find(t => t.nome.toLowerCase() === 'inventario');

        if (!implementacaoEntryType) {
            alert('Erro Crítico: O tipo de entrada "Implementação" não foi encontrado. Crie-o em Configurações.');
            return;
        }
        if (!inventarioEntryType || !inventarioExitType) {
            alert('Erro Crítico: Os tipos de entrada e saída "Inventario" não foram encontrados. Crie-os em Configurações.');
            return;
        }

        // --- Prepare data for transaction ---
        const operations = [];
        for (const row of rowsToProcess) {
            const qtdeInput = row.querySelector('.qtde-input');
            const qtdeStr = qtdeInput.value.trim();
            if (qtdeStr === '') continue;

            const saldoAtual = parseFloat(row.querySelector('.saldo-atual').textContent);
            const qtde = parseFloat(qtdeStr);

            if (isNaN(qtde) || qtde < 0) {
                alert(`Valor inválido para QTDE na linha do produto ${row.cells[0].textContent}. Por favor, corrija.`);
                return;
            }

            if (qtde === saldoAtual) continue;

            const valorUnitario = parseFloat(row.querySelector('.value-input').value);
            const productId = row.dataset.productId;
            const locacao = row.dataset.locacao;
            const key = `${productId}-${locacao}`;

            if (saldoAtual === 0 && qtde > 0) {
                if (isNaN(valorUnitario) || valorUnitario <= 0) {
                    alert(`Para uma nova implementação (Saldo Atual 0), o 'Valor Unit.' deve ser maior que zero. Produto: ${row.cells[0].textContent}`);
                    return;
                }
                operations.push({
                    type: 'implementacao',
                    productId, locacao, key, qtde, valorUnitario,
                    icms: parseFloat(row.querySelector('.icms-input').value) || 0,
                    ipi: parseFloat(row.querySelector('.ipi-input').value) || 0,
                    frete: parseFloat(row.querySelector('.frete-input').value) || 0,
                });
            } else {
                operations.push({
                    type: 'ajuste',
                    productId, locacao, key, qtde,
                    diff: qtde - saldoAtual,
                });
            }
        }

        if (operations.length === 0) {
            alert("Nenhuma alteração válida para confirmar.");
            return;
        }

        if (!confirm(`Confirmar ${operations.length} alteraç(ão/ões) de inventário?`)) {
            return;
        }

        btnConfirmMovement.disabled = true;
        btnConfirmMovement.textContent = 'Processando...';
        const productsForCostUpdate = new Set();

        try {
            await runTransaction(db, async (transaction) => {
                const productRefs = {};
                const productDocs = {};
                for (const op of operations) {
                    if (!productDocs[op.productId]) {
                        const productRef = doc(db, 'produtos', op.productId);
                        productRefs[op.productId] = productRef;
                        const pDoc = await transaction.get(productRef);
                        if (!pDoc.exists()) throw new Error(`Produto ${op.productId} não encontrado.`);
                        productDocs[op.productId] = pDoc.data();
                    }
                }

                for (const op of operations) {
                    const productData = productDocs[op.productId];
                    const locacaoIndex = productData.locacoes.findIndex(l => l.locacao === op.locacao);
                    if (locacaoIndex === -1) throw new Error(`Locação ${op.locacao} não encontrada no produto ${productData.codigo}.`);

                    productData.locacoes[locacaoIndex].estoque = op.qtde;

                    const newMovementRef = doc(collection(db, 'movimentacoes'));
                    if (op.type === 'implementacao') {
                        const custoTotal = (op.qtde * op.valorUnitario) + op.icms + op.ipi + op.frete;
                        transaction.set(newMovementRef, {
                            productId: op.productId, locacao: op.locacao, tipo: 'entrada',
                            tipo_entradaId: implementacaoEntryType.id,
                            quantidade: op.qtde, quantidade_compra: op.qtde,
                            valor_unitario: op.valorUnitario, icms: op.icms, ipi: op.ipi, frete: op.frete,
                            custo_total_entrada: custoTotal, data: serverTimestamp(),
                            observacao: 'Implementação de saldo inicial'
                        });
                        if (implementacaoEntryType.recalcula_custo_medio) {
                            productsForCostUpdate.add(op.productId);
                        }
                    } else if (op.type === 'ajuste') {
                        if (op.diff > 0) {
                            transaction.set(newMovementRef, {
                                productId: op.productId, locacao: op.locacao, tipo: 'entrada',
                                tipo_entradaId: inventarioEntryType.id,
                                quantidade: op.diff, data: serverTimestamp(),
                                observacao: `Ajuste de inventário (Entrada)`
                            });
                        } else {
                             transaction.set(newMovementRef, {
                                productId: op.productId, locacao: op.locacao, tipo: 'saida',
                                tipo_saidaId: inventarioExitType.id,
                                quantidade: Math.abs(op.diff),
                                valorMedioHistorico: productData.valorMedio || 0,
                                data: serverTimestamp(),
                                observacao: `Ajuste de inventário (Saída)`
                            });
                        }
                    }

                    const tempDocRef = doc(db, 'temp_inventario', op.key);
                    transaction.delete(tempDocRef);
                }

                for (const productId in productDocs) {
                    transaction.update(productRefs[productId], { locacoes: productDocs[productId].locacoes });
                }
            });

            for (const productId of productsForCostUpdate) {
                await atualizarCustoMedioProduto(productId);
            }

            alert("Operação concluída com sucesso! A lista será atualizada.");
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

    let debounceTimer;
    tableBody.addEventListener('input', (e) => {
        if (e.target.classList.contains('qtde-input')) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const row = e.target.closest('tr');
                const productId = row.dataset.productId;
                const locacao = row.dataset.locacao;
                const qtde = e.target.value;

                if (productId && locacao) {
                    saveTempInventory(productId, locacao, qtde);
                }
            }, 500);
        }
    });

    fetchAllData();
});
