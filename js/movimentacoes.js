// js/movimentacoes.js - VERSÃO FINAL E SEGURA

import { db } from './firebase-config.js';
import { collection, getDocs, onSnapshot, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    const formEntrada = document.getElementById('form-entrada');
    const formSaida = document.getElementById('form-saida');
    const tableBody = document.querySelector('#table-movimentacoes tbody');

    let productsMap = {};
    let configData = {};
    let allMovements = [];
    let sortState = { column: 'data', direction: 'desc' };
    let filterState = {};
    let initialDataLoaded = false;

    async function loadInitialData() {
        const productsSnapshot = await getDocs(collection(db, 'produtos'));
        productsMap = {};
        const productOptions = ['<option value="">Selecione o Produto...</option>'];
        productsSnapshot.forEach(doc => {
            const product = doc.data();
            productsMap[doc.id] = { id: doc.id, ...product };
            const codigo = product.codigo || 'S/C';
            const descricao = product.descricao || 'Produto sem descrição';
            productOptions.push(`<option value="${doc.id}">${codigo} - ${descricao}</option>`);
        });
        document.getElementById('entrada-produto').innerHTML = productOptions.join('');
        document.getElementById('saida-produto').innerHTML = productOptions.join('');

        const configsToLoad = [
            { id: 'entrada-tipo', collection: 'tipos_entrada', field: 'nome', defaultOption: 'Tipo de Entrada...' },
            { id: 'saida-tipo', collection: 'tipos_saida', field: 'nome', defaultOption: 'Tipo de Saída...' },
            { id: 'saida-obra', collection: 'obras', field: 'nome', defaultOption: 'Selecione a Obra...' },
        ];

        for (const cfg of configsToLoad) {
            const select = document.getElementById(cfg.id);
            if(select) {
                const snapshot = await getDocs(collection(db, cfg.collection));
                configData[cfg.collection] = {};
                select.innerHTML = `<option value="">${cfg.defaultOption}</option>`;
                snapshot.forEach(doc => {
                    configData[cfg.collection][doc.id] = doc.data();
                    select.innerHTML += `<option value="${doc.id}">${doc.data()[cfg.field]}</option>`;
                });
            }
        }
    }

    function setupAutoFill() {
        document.getElementById('entrada-produto').addEventListener('change', (e) => {
            const product = productsMap[e.target.value];
            document.getElementById('entrada-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('entrada-codigoglobal-display').textContent = product ? (product.codigo_global || '-') : '-';
            document.getElementById('entrada-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('entrada-un-display').textContent = product ? product.un_compra : '-';
        });
        document.getElementById('saida-produto').addEventListener('change', (e) => {
            const product = productsMap[e.target.value];
            document.getElementById('saida-codigo-display').textContent = product ? product.codigo : '-';
            document.getElementById('saida-codigoglobal-display').textContent = product ? (product.codigo_global || '-') : '-';
            document.getElementById('saida-descricao-display').textContent = product ? product.descricao : '-';
            document.getElementById('saida-un-display').textContent = product ? product.un : '-';
            document.getElementById('saida-estoque-display').textContent = product ? (product.estoque || 0) : '-';
        });
    }

    formEntrada.addEventListener('submit', async (e) => {
        e.preventDefault();

        const produtoSelect = document.getElementById('entrada-produto');
        const productId = produtoSelect.value;
        const quantidade = document.getElementById('entrada-quantidade').value;

        if (!productId || productId.trim() === "") {
            alert('ERRO: Nenhum produto foi selecionado. A entrada não pode ser salva.');
            return;
        }
        const quantidadeNumerica = parseFloat(String(quantidade).replace(',', '.')) || 0;
        if (quantidadeNumerica <= 0) {
            alert('Por favor, preencha a quantidade com um número válido e maior que zero.');
            return;
        }

        try {
            await runTransaction(db, async (transaction) => {
                const productRef = doc(db, 'produtos', productId);
                const productDoc = await transaction.get(productRef);

                if (!productDoc.exists()) { throw new Error("Produto não encontrado no banco de dados! A entrada foi cancelada."); }

                const productData = productDoc.data();
                let quantidadeParaEstoque = quantidadeNumerica;

                if (productData.conversaoId) {
                    const conversaoRef = doc(db, 'conversoes', productData.conversaoId);
                    const conversaoDoc = await transaction.get(conversaoRef);
                    if (conversaoDoc.exists()) {
                        const regra = conversaoDoc.data();
                        const fator_qtd_compra = parseFloat(String(regra.qtd_compra).replace(',', '.'));
                        const fator_qtd_padrao = parseFloat(String(regra.qtd_padrao).replace(',', '.'));
                        if (fator_qtd_compra > 0) {
                            quantidadeParaEstoque = (quantidadeNumerica / fator_qtd_compra) * fator_qtd_padrao;
                        }
                    }
                }

                const currentEstoque = parseFloat(productData.estoque) || 0;
                const newEstoque = currentEstoque + quantidadeParaEstoque;
                transaction.update(productRef, { estoque: newEstoque });

                const movementRef = doc(collection(db, 'movimentacoes'));
                const movementData = {
                    tipo: 'entrada',
                    productId: productId,
                    quantidade: quantidadeParaEstoque,
                    quantidade_compra: quantidadeNumerica,
                    data: serverTimestamp(),
                    tipo_entradaId: document.getElementById('entrada-tipo').value,
                    nf: document.getElementById('entrada-nf').value,
                    valor_unitario: parseFloat(String(document.getElementById('entrada-valor-unitario').value || 0).replace(',', '.')) || 0,
                    icms: parseFloat(String(document.getElementById('entrada-icms').value || 0).replace(',', '.')) || 0,
                    ipi: parseFloat(String(document.getElementById('entrada-ipi').value || 0).replace(',', '.')) || 0,
                    frete: parseFloat(String(document.getElementById('entrada-frete').value || 0).replace(',', '.')) || 0,
                    observacao: document.getElementById('entrada-observacao').value,
                    medida: document.getElementById('entrada-medida').value,
                };
                transaction.set(movementRef, movementData);
            });

            alert('Entrada registrada com sucesso!');
            formEntrada.reset();

        } catch (error) {
            console.error("Erro na transação de entrada:", error);
            alert(`Erro ao registrar entrada: ${error.message}`);
        }
    });
});
