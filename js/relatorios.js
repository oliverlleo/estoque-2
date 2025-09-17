import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async function() {
    console.log("Página de Relatórios carregada.");

    // Gerar Relatório de Curva ABC
    await gerarRelatorioCurvaABC();

    // Gerar Relatório de CMV por Obra
    await gerarRelatorioCMVPorObra();

    // Gerar Relatório de Custo por Fornecedor/Grupo
    await gerarRelatorioCustoAgrupado();

    // Gerar Relatório de Giro de Estoque
    await gerarRelatorioGiroEstoque();

    // Gerar Relatório de Produtos Sem Movimentação
    await gerarRelatorioProdutosSemMovimentacao();
    document.querySelector('#periodo-sem-movimentacao').addEventListener('change', gerarRelatorioProdutosSemMovimentacao);

    // Gerar Relatório de Nível de Serviço
    await gerarRelatorioNivelServico();

    // Gerar Relatório de Posição de Estoque
    await gerarRelatorioPosicaoEstoque();

    // Inicializar a busca do relatório de consumo
    inicializarHistoricoConsumo();
});

async function gerarRelatorioCurvaABC() {
    const tableBody = document.querySelector('#table-curva-abc tbody');
    if (!tableBody) {
        console.error("Elemento #table-curva-abc tbody não encontrado.");
        return;
    }

    try {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando dados...</td></tr>';

        // 1. Buscar todos os produtos
        const productsSnapshot = await getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true)));

        // 2. Calcular o valor total de estoque para cada produto
        let produtosComValor = productsSnapshot.docs.map(doc => {
            const product = doc.data();
            const estoqueAtual = (product.locacoes && Array.isArray(product.locacoes))
                ? product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0)
                : 0;
            const valorMedio = product.valorMedio || 0;
            const valorTotalEstoque = estoqueAtual * valorMedio;

            return {
                codigo: product.codigo,
                descricao: product.descricao,
                valorTotalEstoque: valorTotalEstoque
            };
        });

        // 3. Filtrar produtos com valor de estoque positivo
        produtosComValor = produtosComValor.filter(p => p.valorTotalEstoque > 0);

        // 4. Calcular o valor total do estoque
        const valorTotalGlobal = produtosComValor.reduce((acc, p) => acc + p.valorTotalEstoque, 0);

        // 5. Ordenar produtos por valor de estoque (descendente)
        produtosComValor.sort((a, b) => b.valorTotalEstoque - a.valorTotalEstoque);

        // 6. Calcular percentual acumulado e classificar
        let acumulado = 0;
        const produtosClassificados = produtosComValor.map(p => {
            acumulado += p.valorTotalEstoque;
            const percentualAcumulado = (acumulado / valorTotalGlobal) * 100;
            let classificacao;
            if (percentualAcumulado <= 80) {
                classificacao = 'A';
            } else if (percentualAcumulado <= 95) {
                classificacao = 'B';
            } else {
                classificacao = 'C';
            }
            return {
                ...p,
                percentualAcumulado,
                classificacao
            };
        });

        // 7. Renderizar a tabela
        renderTabelaCurvaABC(produtosClassificados, tableBody);

    } catch (error) {
        console.error("Erro ao gerar relatório de Curva ABC:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderTabelaCurvaABC(data, tableBody) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum produto com valor em estoque encontrado.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        const classificacaoClass = `classificacao-${item.classificacao.toLowerCase()}`; // e.g., classificacao-a
        row.innerHTML = `
            <td>${item.codigo}</td>
            <td>${item.descricao}</td>
            <td>R$ ${item.valorTotalEstoque.toFixed(2)}</td>
            <td>${item.percentualAcumulado.toFixed(2)}%</td>
            <td class="${classificacaoClass}"><strong>${item.classificacao}</strong></td>
        `;
        tableBody.appendChild(row);
    });
}

function inicializarHistoricoConsumo() {
    const searchInput = document.getElementById('consumo-produto-search');
    const resultsContainer = document.getElementById('consumo-produto-results');
    let searchTimeout;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const searchTerm = searchInput.value.trim().toLowerCase();
            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '';
                resultsContainer.style.display = 'none';
                return;
            }

            const q = query(collection(db, 'produtos'), where('arquivado', '!=', true));
            const snapshot = await getDocs(q);
            const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const filtered = allProducts.filter(p =>
                p.codigo.toLowerCase().includes(searchTerm) ||
                p.descricao.toLowerCase().includes(searchTerm)
            ).slice(0, 10); // Limita a 10 resultados

            renderSearchResults(filtered, resultsContainer, searchInput);
        }, 300);
    });

    // Ocultar resultados ao clicar fora
    document.addEventListener('click', (e) => {
        if (!resultsContainer.contains(e.target) && e.target !== searchInput) {
            resultsContainer.style.display = 'none';
        }
    });
}

function renderSearchResults(results, container, input) {
    container.innerHTML = '';
    if (results.length === 0) {
        container.style.display = 'none';
        return;
    }

    results.forEach(product => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.textContent = `${product.codigo} - ${product.descricao}`;
        item.addEventListener('click', () => {
            input.value = `${product.codigo} - ${product.descricao}`;
            container.innerHTML = '';
            container.style.display = 'none';
            gerarRelatorioConsumoProduto(product.id);
        });
        container.appendChild(item);
    });
    container.style.display = 'block';
}

async function gerarRelatorioConsumoProduto(productId) {
    const tableBody = document.querySelector('#table-consumo-produto tbody');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Buscando histórico...</td></tr>';

    try {
        const [saidasSnapshot, obrasSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'movimentacoes'), where('tipo', '==', 'saida'), where('productId', '==', productId))),
            getDocs(collection(db, 'obras'))
        ]);

        const obrasMap = new Map(obrasSnapshot.docs.map(doc => [doc.id, doc.data().nome]));

        const data = saidasSnapshot.docs.map(doc => {
            const saida = doc.data();
            return {
                data: saida.data ? new Date(saida.data.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A',
                quantidade: saida.quantidade,
                obra: obrasMap.get(saida.obraId) || 'Sem Obra',
                requisitante: saida.requisitante || '-',
                observacao: saida.observacao || '-'
            };
        }).sort((a, b) => new Date(b.data.split('/').reverse().join('-')) - new Date(a.data.split('/').reverse().join('-'))); // Ordena por data descendente

        renderTabelaConsumo(data, tableBody);
    } catch (error) {
        console.error("Erro ao gerar relatório de consumo:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500">Erro: ${error.message}</td></tr>`;
    }
}

function renderTabelaConsumo(data, tableBody) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma saída encontrada para este produto.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.data}</td>
            <td>${item.quantidade}</td>
            <td>${item.obra}</td>
            <td>${item.requisitante}</td>
            <td>${item.observacao}</td>
        `;
        tableBody.appendChild(row);
    });
}

async function gerarRelatorioPosicaoEstoque() {
    const tableBody = document.querySelector('#table-posicao-estoque tbody');
    if (!tableBody) {
        console.error("Elemento #table-posicao-estoque tbody não encontrado.");
        return;
    }

    try {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';

        const [produtosSnapshot, locaisSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(collection(db, 'locais'))
        ]);

        const locaisMap = new Map(locaisSnapshot.docs.map(doc => [doc.id, doc.data().nome]));

        const data = [];
        produtosSnapshot.forEach(doc => {
            const produto = doc.data();
            if (produto.locacoes && Array.isArray(produto.locacoes)) {
                produto.locacoes.forEach(loc => {
                    if (loc.estoque > 0) {
                        data.push({
                            codigo: produto.codigo,
                            descricao: produto.descricao,
                            localFisico: locaisMap.get(loc.localId) || 'Desconhecido',
                            locacao: loc.locacao,
                            estoque: loc.estoque || 0
                        });
                    }
                });
            }
        });

        data.sort((a, b) => {
            if (a.codigo < b.codigo) return -1;
            if (a.codigo > b.codigo) return 1;
            if (a.locacao < b.locacao) return -1;
            if (a.locacao > b.locacao) return 1;
            return 0;
        });

        renderTabelaPosicaoEstoque(data, tableBody);

    } catch (error) {
        console.error("Erro ao gerar relatório de posição de estoque:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500">Erro: ${error.message}</td></tr>`;
    }
}

function renderTabelaPosicaoEstoque(data, tableBody) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item encontrado no estoque.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.codigo}</td>
            <td>${item.descricao}</td>
            <td>${item.localFisico}</td>
            <td>${item.locacao}</td>
            <td>${item.estoque}</td>
        `;
        tableBody.appendChild(row);
    });
}

async function gerarRelatorioNivelServico() {
    const kpiElement = document.querySelector('#kpi-nivel-servico');
    if (!kpiElement) {
        console.error("Elemento #kpi-nivel-servico não encontrado.");
        return;
    }

    try {
        const q = query(collection(db, 'movimentacoes'), where("tipo", "in", ["saida", "reserva_cancelada"]));
        const snapshot = await getDocs(q);

        let atendidas = 0;
        let canceladas = 0;

        snapshot.forEach(doc => {
            const mov = doc.data();
            if (mov.tipo === 'saida' && mov.reserva_confirmada === true) {
                atendidas++;
            } else if (mov.tipo === 'reserva_cancelada') {
                canceladas++;
            }
        });

        const totalDecididas = atendidas + canceladas;
        let nivelServico = 0;
        if (totalDecididas > 0) {
            nivelServico = (atendidas / totalDecididas) * 100;
        }

        kpiElement.textContent = `${nivelServico.toFixed(1)}%`;

    } catch (error) {
        console.error("Erro ao gerar relatório de Nível de Serviço:", error);
        kpiElement.textContent = "Erro";
        kpiElement.style.color = 'red';
    }
}

async function gerarRelatorioProdutosSemMovimentacao() {
    const tableBody = document.querySelector('#table-sem-movimentacao tbody');
    const periodoSelect = document.querySelector('#periodo-sem-movimentacao');
    if (!tableBody || !periodoSelect) {
        console.error("Elementos para o relatório de produtos sem movimentação não encontrados.");
        return;
    }

    try {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Analisando dados...</td></tr>';

        // 1. Obter o período e calcular a data de início
        const dias = parseInt(periodoSelect.value, 10);
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - dias);

        // 2. Buscar produtos e saídas em paralelo
        const [produtosSnapshot, saidasSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true))),
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "==", "saida"), where("data", ">=", dataInicio)))
        ]);

        // 3. Criar um Set com os IDs dos produtos que tiveram saída
        const produtosComMovimento = new Set();
        saidasSnapshot.forEach(doc => {
            produtosComMovimento.add(doc.data().productId);
        });

        // 4. Filtrar produtos que NÃO tiveram movimento e TÊM estoque
        const produtosSemMovimento = [];
        produtosSnapshot.forEach(doc => {
            const productId = doc.id;
            if (!produtosComMovimento.has(productId)) {
                const product = doc.data();
                const estoqueAtual = (product.locacoes && Array.isArray(product.locacoes))
                    ? product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0)
                    : 0;

                if (estoqueAtual > 0) {
                    const valorTotalEstoque = estoqueAtual * (product.valorMedio || 0);
                    produtosSemMovimento.push({
                        codigo: product.codigo,
                        descricao: product.descricao,
                        estoqueAtual,
                        valorTotalEstoque
                    });
                }
            }
        });

        // 5. Ordenar por valor (descendente)
        produtosSemMovimento.sort((a, b) => b.valorTotalEstoque - a.valorTotalEstoque);

        // 6. Renderizar a tabela
        renderTabelaSemMovimentacao(produtosSemMovimento, tableBody);

    } catch (error) {
        console.error("Erro ao gerar relatório de produtos sem movimentação:", error);
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500">Erro: ${error.message}</td></tr>`;
    }
}

function renderTabelaSemMovimentacao(data, tableBody) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum produto obsoleto encontrado no período.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.codigo}</td>
            <td>${item.descricao}</td>
            <td>${item.estoqueAtual}</td>
            <td>R$ ${item.valorTotalEstoque.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

async function gerarRelatorioGiroEstoque() {
    const kpiElement = document.querySelector('#kpi-giro-estoque');
    if (!kpiElement) {
        console.error("Elemento #kpi-giro-estoque não encontrado.");
        return;
    }

    try {
        // 1. Definir o período (últimos 365 dias)
        const umAnoAtras = new Date();
        umAnoAtras.setDate(umAnoAtras.getDate() - 365);

        // 2. Buscar saídas e produtos em paralelo
        const [saidasSnapshot, produtosSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "==", "saida"), where("data", ">=", umAnoAtras))),
            getDocs(query(collection(db, 'produtos'), where("arquivado", "!=", true)))
        ]);

        // 3. Calcular o Custo Total das Saídas
        let custoTotalSaidas = 0;
        saidasSnapshot.forEach(doc => {
            const saida = doc.data();
            if (saida.quantidade && saida.valorMedioHistorico) {
                custoTotalSaidas += saida.quantidade * saida.valorMedioHistorico;
            }
        });

        // 4. Calcular o Valor Total do Estoque Atual (que será nosso "Valor Médio")
        let valorTotalEstoque = 0;
        produtosSnapshot.forEach(doc => {
            const product = doc.data();
            const estoqueAtual = (product.locacoes && Array.isArray(product.locacoes))
                ? product.locacoes.reduce((acc, loc) => acc + (loc.estoque || 0), 0)
                : 0;
            valorTotalEstoque += estoqueAtual * (product.valorMedio || 0);
        });

        // 5. Calcular o Giro de Estoque
        let giro = 0;
        if (valorTotalEstoque > 0) {
            giro = custoTotalSaidas / valorTotalEstoque;
        }

        // 6. Exibir o resultado
        kpiElement.textContent = giro.toFixed(2);

    } catch (error) {
        console.error("Erro ao gerar relatório de Giro de Estoque:", error);
        kpiElement.textContent = "Erro";
        kpiElement.style.color = 'red';
    }
}

async function gerarRelatorioCustoAgrupado() {
    const fornecedorTableBody = document.querySelector('#table-custo-fornecedor tbody');
    const grupoTableBody = document.querySelector('#table-custo-grupo tbody');

    if (!fornecedorTableBody || !grupoTableBody) {
        console.error("Tabelas de custo por fornecedor ou grupo não encontradas.");
        return;
    }

    try {
        fornecedorTableBody.innerHTML = '<tr><td colspan="2" class="text-center">Carregando...</td></tr>';
        grupoTableBody.innerHTML = '<tr><td colspan="2" class="text-center">Carregando...</td></tr>';

        // 1. Buscar todos os dados necessários em paralelo
        const [saidasSnapshot, produtosSnapshot, fornecedoresSnapshot, gruposSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "==", "saida"))),
            getDocs(collection(db, 'produtos')),
            getDocs(collection(db, 'fornecedores')),
            getDocs(collection(db, 'grupos'))
        ]);

        // 2. Criar mapas para acesso rápido
        const produtosMap = new Map(produtosSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const fornecedoresMap = new Map(fornecedoresSnapshot.docs.map(doc => [doc.id, doc.data().nome]));
        const gruposMap = new Map(gruposSnapshot.docs.map(doc => [doc.id, doc.data().nome]));

        // 3. Calcular custos agregados
        const custoPorFornecedor = new Map();
        const custoPorGrupo = new Map();

        saidasSnapshot.forEach(doc => {
            const saida = doc.data();
            const produto = produtosMap.get(saida.productId);

            if (produto && saida.quantidade && saida.valorMedioHistorico) {
                const custoSaida = saida.quantidade * saida.valorMedioHistorico;

                // Agregar por Fornecedor
                if (produto.fornecedorId) {
                    const custoAtual = custoPorFornecedor.get(produto.fornecedorId) || 0;
                    custoPorFornecedor.set(produto.fornecedorId, custoAtual + custoSaida);
                }

                // Agregar por Grupo
                if (produto.grupoId) {
                    const custoAtual = custoPorGrupo.get(produto.grupoId) || 0;
                    custoPorGrupo.set(produto.grupoId, custoAtual + custoSaida);
                }
            }
        });

        // 4. Preparar dados para renderização
        const dataFornecedor = Array.from(custoPorFornecedor.entries()).map(([id, custo]) => ({
            nome: fornecedoresMap.get(id) || "Fornecedor Desconhecido",
            custoTotal: custo
        })).sort((a, b) => b.custoTotal - a.custoTotal);

        const dataGrupo = Array.from(custoPorGrupo.entries()).map(([id, custo]) => ({
            nome: gruposMap.get(id) || "Grupo Desconhecido",
            custoTotal: custo
        })).sort((a, b) => b.custoTotal - a.custoTotal);

        // 5. Renderizar tabelas
        renderTabelaAgrupada(dataFornecedor, fornecedorTableBody, "Nenhum custo por fornecedor encontrado.");
        renderTabelaAgrupada(dataGrupo, grupoTableBody, "Nenhum custo por grupo de produto encontrado.");

    } catch (error) {
        console.error("Erro ao gerar relatório de custo agrupado:", error);
        const errorMsg = `<tr><td colspan="2" class="text-center text-red-500">Erro: ${error.message}</td></tr>`;
        fornecedorTableBody.innerHTML = errorMsg;
        grupoTableBody.innerHTML = errorMsg;
    }
}

function renderTabelaAgrupada(data, tableBody, msgVazio) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="2" class="text-center">${msgVazio}</td></tr>`;
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.nome}</td>
            <td>R$ ${item.custoTotal.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

async function gerarRelatorioCMVPorObra() {
    const tableBody = document.querySelector('#table-cmv-obra tbody');
    if (!tableBody) {
        console.error("Elemento #table-cmv-obra tbody não encontrado.");
        return;
    }

    try {
        tableBody.innerHTML = '<tr><td colspan="2" class="text-center">Carregando dados...</td></tr>';

        // 1. Buscar todas as obras e todas as saídas em paralelo
        const [obrasSnapshot, saidasSnapshot] = await Promise.all([
            getDocs(collection(db, 'obras')),
            getDocs(query(collection(db, 'movimentacoes'), where("tipo", "==", "saida")))
        ]);

        // 2. Criar um mapa de Obras para fácil acesso (ID -> Nome)
        const obrasMap = new Map();
        obrasSnapshot.forEach(doc => {
            obrasMap.set(doc.id, doc.data().nome);
        });

        // 3. Calcular o CMV para cada obra
        const cmvPorObra = new Map();
        saidasSnapshot.forEach(doc => {
            const saida = doc.data();
            if (saida.obraId && saida.quantidade && saida.valorMedioHistorico) {
                const custoSaida = saida.quantidade * saida.valorMedioHistorico;
                const custoAtual = cmvPorObra.get(saida.obraId) || 0;
                cmvPorObra.set(saida.obraId, custoAtual + custoSaida);
            }
        });

        // 4. Preparar os dados para renderização
        const dataParaTabela = Array.from(cmvPorObra.entries()).map(([obraId, custoTotal]) => ({
            obraNome: obrasMap.get(obraId) || `Obra Desconhecida (ID: ${obraId})`,
            custoTotal
        }));

        // 5. Ordenar por custo (descendente)
        dataParaTabela.sort((a, b) => b.custoTotal - a.custoTotal);

        // 6. Renderizar a tabela
        renderTabelaCMV(dataParaTabela, tableBody);

    } catch (error) {
        console.error("Erro ao gerar relatório de CMV por Obra:", error);
        tableBody.innerHTML = `<tr><td colspan="2" class="text-center text-red-500">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderTabelaCMV(data, tableBody) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="2" class="text-center">Nenhuma saída de material para obras encontrada.</td></tr>';
        return;
    }

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.obraNome}</td>
            <td>R$ ${item.custoTotal.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}
