import { db } from './firebase-config.js';
import { collection, getDocs, query, where, limit, doc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { obterIdsInventario, recalcularCustoMedioProduto } from './custo-medio.js';


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
    const btnExportExcel = document.getElementById('btn-export-excel');
    const btnImportExcel = document.getElementById('btn-import-excel');
    const inputImportExcel = document.getElementById('input-import-excel');
    const btnConfirmMovement = document.getElementById('btn-confirm-movement');

    let allProducts = [];
    let implementationMovements = {};
    let tiposEntradaMap = {};
    let tiposSaidaMap = {}; // Armazena as configurações dos tipos de saída
    let locaisMap = {};

    // --- DATA FETCHING ---
    const normalizeStr = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    const getLocationKey = (productId, localId = '', locacao = '') =>
        `${productId}::${localId || '_NO_LOCAL_'}::${String(locacao || '') || '_EMPTY_'}`;

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
            locaisMap = {};
            const localSelect = document.getElementById('filter-local');
            // Add a "Todos" option first
            const allOption = document.createElement('option');
            allOption.value = ""; // Empty value for "All"
            allOption.textContent = "Todos";
            localSelect.appendChild(allOption);
            // Populate with other locations
            locaisSnapshot.forEach(doc => {
                locaisMap[doc.id] = { id: doc.id, ...doc.data() };
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

            // Agrupa por produto + Local + Endereçamento. Endereçamento vazio também é válido.
            allRelevantMovements.forEach(mov => {
                if (!mov.productId) return;
                const key = getLocationKey(mov.productId, mov.localId || '', mov.locacao || '');
                if (!implementationMovements[key]) {
                    implementationMovements[key] = [];
                }
                implementationMovements[key].push(mov);
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
            const key = getLocationKey(product.id, loc.localId || '', loc.locacao || '');

            const row = document.createElement('tr');
            row.dataset.productId = product.id;
            row.dataset.locacao = loc.locacao;
            row.dataset.localId = loc.localId;

            const saldoAtual = loc.estoque || 0;
            const pendingQtde = getPendingQtde(key);

            // --- Status Column Logic ---
            let statusCellHtml = '';
            let movementsForItem = implementationMovements[key] || [];
            if (movementsForItem.length === 0) {
                // Compatibilidade com movimentos antigos que não gravavam localId.
                movementsForItem = implementationMovements[getLocationKey(product.id, '', loc.locacao || '')] || [];
            }
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

            // New logic: Lock cost fields if a suggestion exists
            const areCostFieldsDisabled = !!suggestedData.valor_unitario;
            const disabledAttribute = areCostFieldsDisabled ? 'disabled' : '';

            const qtdeInputHtml = `<input type="number" class="form-control qtde-input" value="${pendingQtde || ''}" min="0" step="any" placeholder="Nova Qtde">`;
            const valueInputHtml = `<input type="number" class="form-control value-input" value="${suggestedData.valor_unitario || ''}" min="0" step="0.01" title="Valor sugerido da última implementação deste produto" ${disabledAttribute}>`;
            const icmsInputHtml = `<input type="number" class="form-control icms-input" value="${suggestedData.icms || ''}" min="0" step="0.01" title="ICMS sugerido da última implementação deste produto" ${disabledAttribute}>`;
            const ipiInputHtml = `<input type="number" class="form-control ipi-input" value="${suggestedData.ipi || ''}" min="0" step="0.01" title="IPI sugerido da última implementação deste produto" ${disabledAttribute}>`;
            const freteInputHtml = `<input type="number" class="form-control frete-input" value="${suggestedData.frete || ''}" min="0" step="0.01" title="Frete sugerido da última implementação deste produto" ${disabledAttribute}>`;

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

            // Add keydown event listener for Enter key
            qtdeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent default form submission or moving to the next field in the same row

                    const currentRow = e.target.closest('tr');
                    let nextRow = currentRow.nextElementSibling;

                    // Skip hidden rows
                    while (nextRow && nextRow.style.display === 'none') {
                        nextRow = nextRow.nextElementSibling;
                    }

                    if (nextRow) {
                        const nextQtdeInput = nextRow.querySelector('.qtde-input');
                        if (nextQtdeInput) {
                            nextQtdeInput.focus();
                            nextQtdeInput.select(); // Optional: select the content of the next input
                        }
                    }
                }
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

        const hasStartAddress = !!startAddress;
        const hasEndAddress = !!endAddress;
        const hasAddressRange = hasStartAddress && hasEndAddress;

        if (!selectedLocalId && !hasStartAddress && !hasEndAddress) {
            alert("Selecione um Local ou informe o endereçamento inicial e final.");
            return;
        }

        if (hasStartAddress !== hasEndAddress) {
            alert("Para filtrar por endereçamento, preencha o endereço inicial e o final.");
            return;
        }

        if (hasAddressRange && (!addressPattern.test(startAddress) || !addressPattern.test(endAddress))) {
            alert("O formato do endereço deve ser N-L-NN-L (Ex: 1-A-01-A).");
            return;
        }

        let itemsToRender = [];
        allProducts.forEach(product => {
            if (product.locacoes && product.locacoes.length > 0) {
                // First, filter locations based on the criteria
                const matchingLocacoes = product.locacoes.filter(loc => {
                    const currentLoc = String(loc.locacao || '').toUpperCase();
                    const matchesLocal = !selectedLocalId || loc.localId === selectedLocalId;
                    const isInAddressRange = !hasAddressRange ||
                        (currentLoc >= startAddress && currentLoc <= endAddress);

                    return matchesLocal && isInAddressRange;
                });

                // Then, if there are any matching locations, add them to the render list
                if (matchingLocacoes.length > 0) {
                    matchingLocacoes.forEach(loc => {
                        // Create a new product object for each location to avoid issues with shared references
                        const productCopy = { ...product };
                        delete productCopy.locacoes; // Remove the full locacoes array from the copy
                        itemsToRender.push({ ...productCopy, locacao: loc }); // Flatten
                    });
                }
            }
        });

        // 2. Sort the flattened list
        itemsToRender.sort((a, b) => {
            // Primary sort by address (locacao)
            const locacaoA = String(a.locacao.locacao || '').toUpperCase();
            const locacaoB = String(b.locacao.locacao || '').toUpperCase();
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

    // --- EXCEL EXPORT / IMPORT ---
    const getCellInputValue = (row, selector) => row.querySelector(selector)?.value ?? '';

    const getRowsFromCurrentTable = () =>
        Array.from(tableBody.querySelectorAll('tr')).filter(row => row.dataset.productId);

    function exportInventoryToExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Não foi possível carregar o recurso de Excel. Atualize a página e tente novamente.');
            return;
        }

        const rows = getRowsFromCurrentTable();
        if (rows.length === 0) {
            alert('Liste os itens do inventário antes de exportar.');
            return;
        }

        const exportData = rows.map(row => {
            const productId = row.dataset.productId || '';
            const localId = row.dataset.localId || '';
            const locacao = row.dataset.locacao || '';
            const product = allProducts.find(item => item.id === productId);
            const localNome = locaisMap[localId]?.nome || '';
            const statusText = row.cells[9]?.innerText?.replace(/\s+/g, ' ').trim() || '';

            return {
                'Produto ID': productId,
                'Local ID': localId,
                'Código': product?.codigo || row.cells[0]?.innerText || '',
                'Descrição': product?.descricao || row.cells[1]?.innerText || '',
                'Local': localNome,
                'Endereçamento': locacao,
                'Saldo Atual': Number(row.querySelector('.saldo-atual')?.textContent || 0),
                'Qtde': getCellInputValue(row, '.qtde-input'),
                'Valor Unit.': getCellInputValue(row, '.value-input'),
                'ICMS': getCellInputValue(row, '.icms-input'),
                'IPI': getCellInputValue(row, '.ipi-input'),
                'Frete': getCellInputValue(row, '.frete-input'),
                'Status': statusText
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        worksheet['!cols'] = [
            { hidden: true, wch: 18 },
            { hidden: true, wch: 18 },
            { wch: 18 },
            { wch: 45 },
            { wch: 24 },
            { wch: 18 },
            { wch: 14 },
            { wch: 14 },
            { wch: 14 },
            { wch: 12 },
            { wch: 12 },
            { wch: 12 },
            { wch: 24 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventário');

        const today = new Date();
        const fileDate = [
            String(today.getFullYear()),
            String(today.getMonth() + 1).padStart(2, '0'),
            String(today.getDate()).padStart(2, '0')
        ].join('-');

        XLSX.writeFile(workbook, `inventario-${fileDate}.xlsx`);
    }

    const normalizeExcelText = value => String(value ?? '').trim();
    const normalizeExcelNumber = value => {
        if (value === '' || value === null || value === undefined) return '';
        if (typeof value === 'number') return String(value);
        return String(value).trim().replace(',', '.');
    };

    async function importInventoryFromExcel(file) {
        if (typeof XLSX === 'undefined') {
            alert('Não foi possível carregar o recurso de Excel. Atualize a página e tente novamente.');
            return;
        }

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error('O arquivo não possui nenhuma planilha.');

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
        if (rows.length === 0) throw new Error('A planilha está vazia.');

        const requiredColumns = ['Produto ID', 'Local ID', 'Endereçamento'];
        const missingColumns = requiredColumns.filter(column => !(column in rows[0]));
        if (missingColumns.length > 0) {
            throw new Error(`Arquivo inválido. Colunas obrigatórias ausentes: ${missingColumns.join(', ')}.`);
        }

        const itemsToRender = [];
        const importedByKey = new Map();
        const errors = [];

        rows.forEach((excelRow, index) => {
            const productId = normalizeExcelText(excelRow['Produto ID']);
            const localId = normalizeExcelText(excelRow['Local ID']);
            const locacao = normalizeExcelText(excelRow['Endereçamento']);
            const codigo = normalizeExcelText(excelRow['Código']);

            let product = allProducts.find(item => item.id === productId);
            if (!product && codigo) {
                const matches = allProducts.filter(item => normalizeExcelText(item.codigo) === codigo);
                if (matches.length === 1) product = matches[0];
            }

            if (!product) {
                errors.push(`Linha ${index + 2}: produto não encontrado.`);
                return;
            }

            const loc = (product.locacoes || []).find(item =>
                (item.localId || '') === localId &&
                String(item.locacao || '').trim() === locacao
            );

            if (!loc) {
                errors.push(`Linha ${index + 2}: Local/Endereçamento não encontrado para o produto ${product.codigo}.`);
                return;
            }

            const key = getLocationKey(product.id, loc.localId || '', loc.locacao || '');
            if (importedByKey.has(key)) {
                errors.push(`Linha ${index + 2}: item duplicado no arquivo (${product.codigo}).`);
                return;
            }

            const productCopy = { ...product };
            delete productCopy.locacoes;
            itemsToRender.push({ ...productCopy, locacao: loc });
            importedByKey.set(key, excelRow);
        });

        if (errors.length > 0) {
            throw new Error(errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n... e mais ${errors.length - 8} erro(s).` : ''));
        }

        renderTable(itemsToRender);

        getRowsFromCurrentTable().forEach(row => {
            const key = getLocationKey(
                row.dataset.productId || '',
                row.dataset.localId || '',
                row.dataset.locacao || ''
            );
            const excelRow = importedByKey.get(key);
            if (!excelRow) return;

            const fields = [
                ['.qtde-input', 'Qtde'],
                ['.value-input', 'Valor Unit.'],
                ['.icms-input', 'ICMS'],
                ['.ipi-input', 'IPI'],
                ['.frete-input', 'Frete']
            ];

            fields.forEach(([selector, column]) => {
                const input = row.querySelector(selector);
                if (!input) return;
                input.value = normalizeExcelNumber(excelRow[column]);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        filterNoQuantity.checked = false;
        filterNoValue.checked = false;
        filterHideUpdated.checked = false;
        applyFilters();

        alert(`Excel importado com sucesso: ${itemsToRender.length} item(ns) carregado(s) e preenchido(s).`);
    }

    btnExportExcel.addEventListener('click', exportInventoryToExcel);
    btnImportExcel.addEventListener('click', () => {
        inputImportExcel.value = '';
        inputImportExcel.click();
    });
    inputImportExcel.addEventListener('change', async () => {
        const file = inputImportExcel.files?.[0];
        if (!file) return;

        try {
            btnImportExcel.disabled = true;
            btnImportExcel.textContent = 'Importando...';
            await importInventoryFromExcel(file);
        } catch (error) {
            console.error('Erro ao importar Excel:', error);
            alert('Não foi possível importar o Excel: ' + error.message);
        } finally {
            btnImportExcel.disabled = false;
            btnImportExcel.innerHTML = '<span class="material-icons" style="font-size:18px; vertical-align:middle;">file_upload</span> Importar Excel';
        }
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

            // Confirma se o produto realmente nunca teve movimentação. Uma localização vazia
            // não significa implementação inicial, e um produto que já teve histórico deve
            // continuar sendo tratado como ajuste de inventário mesmo quando o saldo total
            // e o custo atual estiverem zerados.
            const productHistoryExists = new Map();
            const uniqueProductIds = [...new Set(
                rowsToProcess
                    .map(row => row.dataset.productId)
                    .filter(Boolean)
            )];

            for (const productId of uniqueProductIds) {
                const cachedProduct = allProducts.find(product => product.id === productId);
                const totalStock = (cachedProduct?.locacoes || []).reduce(
                    (total, local) => total + (Number(local.estoque) || 0),
                    0
                );
                const currentAverageCost = Number(cachedProduct?.valorMedio) || 0;

                if (totalStock <= 0 && currentAverageCost <= 0) {
                    const movementSnapshot = await getDocs(query(
                        collection(db, 'movimentacoes'),
                        where('productId', '==', productId),
                        limit(1)
                    ));
                    productHistoryExists.set(productId, !movementSnapshot.empty);
                } else {
                    productHistoryExists.set(productId, true);
                }
            }

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
                    const locacaoStr = row.dataset.locacao || '';
                    const localId = row.dataset.localId || '';
                    const saldoAtual = parseFloat(row.querySelector('.saldo-atual').textContent) || 0;
                    const qtde = parseFloat(qtdeInput.value);
                    const valorUnit = parseFloat(row.querySelector('.value-input').value) || 0;

                    const productData = productsToUpdate.get(productId);
                    if (!productData) continue;

                    const locacaoIndex = productData.locacoes.findIndex(
                        l => String(l.locacao || '') === locacaoStr && (l.localId || '') === localId
                    );
                    if (locacaoIndex === -1) {
                        const origem = locacaoStr || 'sem endereçamento';
                        throw new Error(`Origem ${origem} não encontrada no Local selecionado para o produto ${productData.codigo}.`);
                    }

                    const key = getLocationKey(productId, localId, locacaoStr);

                    // --- LÓGICA DE IMPLEMENTAÇÃO / INVENTÁRIO ---
                    const estoqueTotalAtual = (productData.locacoes || []).reduce(
                        (total, local) => total + (Number(local.estoque) || 0),
                        0
                    );
                    const custoMedioAtual = Number(productData.valorMedio) || 0;
                    const possuiHistorico = productHistoryExists.get(productId) === true;
                    const ehImplementacaoInicial =
                        estoqueTotalAtual <= 0 &&
                        custoMedioAtual <= 0 &&
                        !possuiHistorico;

                    if (ehImplementacaoInicial) {
                        // Primeira valorização real do produto: exige custo informado.
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
                            localId,
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
                        // Ajuste por diferença: altera a quantidade, mas preserva o custo médio vigente.
                        const diff = qtde - saldoAtual;
                        if (diff === 0) {
                            keysToClearFromStorage.push(key); // Clear storage if user sets qtde to current saldo
                            continue;
                        }

                        // Update stock
                        productData.locacoes[locacaoIndex].estoque = qtde;

                        if (custoMedioAtual <= 0) {
                            const motivo = possuiHistorico
                                ? 'já possui histórico de movimentações'
                                : 'possui estoque cadastrado';
                            throw new Error(
                                `O produto ${productData.codigo} ${motivo}, mas está sem custo médio válido. ` +
                                `Execute a Migração de Custo Médio antes de lançar o inventário.`
                            );
                        }

                        const newMovementRef = doc(collection(db, 'movimentacoes'));
                        if (diff > 0) {
                            const custoTotalInventario = diff * custoMedioAtual;
                            transaction.set(newMovementRef, {
                                productId,
                                tipo: 'entrada',
                                tipo_entradaId: inventarioEntryType.id,
                                quantidade: diff,
                                quantidade_compra: diff,
                                valor_unitario: custoMedioAtual,
                                valorMedioHistorico: custoMedioAtual,
                                custo_total_entrada: custoTotalInventario,
                                ajuste_inventario: true,
                                preserva_custo_medio: true,
                                localId,
                                locacao: locacaoStr,
                                data: serverTimestamp(),
                                observacao: `Ajuste de inventário (Entrada). Saldo anterior: ${saldoAtual}. Custo preservado: ${custoMedioAtual.toFixed(3)}.`
                            });
                        } else {
                            const quantidadeSaida = Math.abs(diff);
                            transaction.set(newMovementRef, {
                                productId,
                                tipo: 'saida',
                                tipo_saidaId: inventarioExitType.id,
                                quantidade: quantidadeSaida,
                                valorMedioHistorico: custoMedioAtual,
                                custoTotal: quantidadeSaida * custoMedioAtual,
                                ajuste_inventario: true,
                                preserva_custo_medio: true,
                                localId,
                                locacao: locacaoStr,
                                data: serverTimestamp(),
                                observacao: `Ajuste de inventário (Saída). Saldo anterior: ${saldoAtual}. Custo preservado: ${custoMedioAtual.toFixed(3)}.`
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
                const idsInventario = {
                    idsInventarioEntrada: obterIdsInventario(tiposEntradaMap),
                    idsInventarioSaida: obterIdsInventario(tiposSaidaMap)
                };
                const costUpdatePromises = Array.from(productsToUpdateCost).map(
                    id => recalcularCustoMedioProduto(db, id, idsInventario)
                );
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
