import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

function formatarTelefone(telefone) {
    const telLimpo = String(telefone).replace(/\D/g, '');
    const tam = telLimpo.length;

    if (tam <= 2) {
        return telLimpo;
    }
    if (tam <= 6) {
        return `(${telLimpo.slice(0, 2)}) ${telLimpo.slice(2)}`;
    }
    if (tam <= 10) { // Fixo: (XX) XXXX-XXXX
        return `(${telLimpo.slice(0, 2)}) ${telLimpo.slice(2, 6)}-${telLimpo.slice(6)}`;
    }
    // Celular: (XX) XXXXX-XXXX
    return `(${telLimpo.slice(0, 2)}) ${telLimpo.slice(2, 7)}-${telLimpo.slice(7)}`;
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("Página de Configurações V2 (com Modais) carregada.");

    const configs = [
        {
            name: "Fornecedores",
            id: "fornecedor",
            collectionName: "fornecedores",
            fields: { nome: { label: "Nome do Fornecedor" }, imposto: { label: "Imposto (ST)", type: 'number' } },
            tableHeaders: "<th>Nome</th><th>Contatos</th><th>Marcas</th><th>Ações</th>"
        },
        { name: "Grupos", id: "grupo", collectionName: "grupos", fields: { nome: { label: "Nome do Grupo" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: "<th>Nome</th><th>Ações</th>" },
        { name: "Aplicações", id: "aplicacao", collectionName: "aplicacoes", fields: { nome: { label: "Nome da Aplicação" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: "<th>Nome</th><th>Ações</th>" },
        { name: "Conjuntos", id: "conjunto", collectionName: "conjuntos", fields: { nome: { label: "Nome do Conjunto" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: "<th>Nome</th><th>Ações</th>" },
        { name: "Locação", id: "local", collectionName: "locais", fields: { nome: { label: "Nome do Local" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: "<th>Nome</th><th>Ações</th>" },
        {
            name: "Tipos de Entrada",
            id: "tipo-entrada",
            collectionName: "tipos_entrada",
            fields: {
                nome: { label: "Nome do Tipo de Entrada" },
                movimenta_estoque: { label: "Movimenta Estoque", type: 'checkbox' },
                recalcula_custo_medio: { label: "Recalcula Custo Médio", type: 'checkbox' },
                informa_valor_unitario: { label: "Informa Valor Unitário", type: 'checkbox' }
            },
            render: (d) => `
            <td>${d.nome || ''}</td>
            <td>${d.movimenta_estoque ? 'Sim' : 'Não'}</td>
            <td>${d.recalcula_custo_medio ? 'Sim' : 'Não'}</td>
            <td>${d.informa_valor_unitario ? 'Sim' : 'Não'}</td>
        `,
            tableHeaders: "<th>Nome</th><th>Mov. Estoque</th><th>Recalc. Custo</th><th>Informa Valor</th><th>Ações</th>"
        },
        {
            name: "Tipos de Saída",
            id: "tipo-saida",
            collectionName: "tipos_saida",
            fields: {
                nome: { label: "Nome do Tipo de Saída" },
                movimenta_estoque: { label: "Movimenta Estoque", type: 'checkbox' },
                informa_obra: { label: "Informa Obra", type: 'checkbox' },
                reservar_estoque: { label: "Reserva", type: 'checkbox' }
            },
            render: (d) => `
            <td>${d.nome || ''}</td>
            <td>${d.movimenta_estoque ? 'Sim' : 'Não'}</td>
            <td>${d.informa_obra ? 'Sim' : 'Não'}</td>
            <td>${d.reservar_estoque ? 'Sim' : 'Não'}</td>
        `,
            tableHeaders: "<th>Nome</th><th>Mov. Estoque</th><th>Informa Obra</th><th>Reserva</th><th>Ações</th>"
        },
        { name: "Obras", id: "obra", collectionName: "obras", fields: { codigo: { label: "Código da Obra" }, nome: { label: "Nome da Obra" } }, render: (d) => `<td>${d.codigo || ''}</td><td>${d.nome || ''}</td>`, tableHeaders: "<th>Código</th><th>Nome</th><th>Ações</th>" },
        {
            name: "Conversão de Unidade",
            id: "conversao",
            collectionName: "conversoes",
            fields: {
                nome_regra: { label: "Nome da Regra (ex: Metro p/ Peça)" },
                qtd_compra: { label: "Unidade de Compra (valor)" },
                medida_compra: { label: "Medida Compra (ex: m, kg, cm)" },
                qtd_padrao: { label: "Unidade Padrão (valor)" },
                medida_padrao: { label: "Medida Padrão (ex: Pç, Un, Cx)" },
                unidade_sobra: { label: "Unidade da Sobra (Ex: mm)" },
                fator_conversao_sobra: { label: "Fator Conversão Sobra (Ex: 5800)" }
            },
            render: (d) => `<td>${d.nome_regra}</td><td>${d.qtd_compra || ''} ${d.medida_compra || ''} = ${d.qtd_padrao || ''} ${d.medida_padrao || ''}</td><td>1 ${d.medida_padrao || ''} = ${d.fator_conversao_sobra || ''} ${d.unidade_sobra || ''}</td>`,
            tableHeaders: "<th>Nome da Regra</th><th>Fórmula Padrão</th><th>Fórmula Sobra</th><th>Ações</th>"
        }
    ];

    const configGrid = document.getElementById('config-grid');
    const modal = document.getElementById('config-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const closeButton = document.querySelector('.close-button');

    if (configGrid) {
        configGrid.addEventListener('click', (event) => {
            const card = event.target.closest('.config-card');
            if (card) {
                const configId = card.dataset.configId;
                const config = configs.find(c => c.id === configId);
                if (config) {
                    openConfigModal(config);
                }
            }
        });
    }

    function openConfigModal(config) {
        modalTitle.textContent = `Cadastro de ${config.name}`;
        modalBody.innerHTML = generateModalContent(config);
        setupModalCrud(config);
        modal.style.display = 'block';
    }

    function closeModel() {
        modal.style.display = 'none';
        modalBody.innerHTML = '';
    }

    closeButton.addEventListener('click', closeModel);
    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            closeModel();
        }
    });

    function generateModalContent(config) {
        let formFields = Object.entries(config.fields).map(([key, fieldDef]) => {
            const id = `${config.id}-${key}`;
            const label = fieldDef.label;
            const type = fieldDef.type || 'text';

            if (type === 'checkbox') {
                return `
                    <div class="form-check">
                        <input type="checkbox" id="${id}" class="form-check-input">
                        <label for="${id}" class="form-check-label">${label}</label>
                    </div>
                `;
            }

            const inputType = type === 'number' ? 'number' : 'text';
            const step = inputType === 'number' ? 'step="0.01"' : '';
            return `<input type="${inputType}" id="${id}" placeholder="${label}" class="form-control" ${step}>`;

        }).join('');

        const fornecedorExtraFields = `
            <div id="contatos-container" style="margin-top: 20px; border-top: 1px solid #dee2e6; padding-top: 20px;">
                <h4 style="margin-bottom: 10px;">Contatos</h4>
                <div id="lista-contatos-form"></div>
                <button type="button" id="btn-add-contato" class="btn" style="background-color: #0d6efd; margin-top: 10px;">Adicionar Contato</button>
            </div>
            <div id="marcas-container" style="margin-top: 20px; border-top: 1px solid #dee2e6; padding-top: 20px;">
                <h4 style="margin-bottom: 10px;">Marcas</h4>
                <div id="marcas-input-wrapper">
                    <input type="text" id="input-add-marca" placeholder="Digite uma marca e pressione Enter" class="form-control">
                    <button type="button" id="btn-add-marca" class="btn">Adicionar</button>
                </div>
                <div id="lista-marcas-tags"></div>
            </div>
        `;

        return `
            <div class="card">
                <div class="card-header"><h3>Formulário de ${config.name}</h3></div>
                <div class="card-body">
                    <form id="form-${config.id}" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                        <input type="hidden" id="${config.id}-id">
                        ${formFields}

                        ${config.id === 'fornecedor' ? fornecedorExtraFields : ''}

                        <button type="submit" class="btn btn-success" style="margin-top: 20px;">Salvar</button>
                    </form>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3>${config.name} Cadastrados</h3></div>
                <div class="card-body">
                    <input type="text" id="filter-${config.id}" class="form-control" placeholder="Filtrar..." style="margin-bottom: 15px;">
                    <div class="table-wrapper">
                        <table id="table-${config.id}" class="table ${config.id === 'fornecedor' ? 'table-fornecedores' : ''}">
                            <thead><tr>${config.tableHeaders}</tr></thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function setupModalCrud(config) {
        const form = modal.querySelector(`#form-${config.id}`);
        const tableBody = modal.querySelector(`#table-${config.id} tbody`);
        const filterInput = modal.querySelector(`#filter-${config.id}`);
        let currentData = [];
        let unsubscribe;

        if (config.id === 'fornecedor') {
            const contatosContainer = modal.querySelector('#lista-contatos-form');
            const btnAddContato = modal.querySelector('#btn-add-contato');
            const marcasInput = modal.querySelector('#input-add-marca');
            const btnAddMarca = modal.querySelector('#btn-add-marca');
            const marcasTagsContainer = modal.querySelector('#lista-marcas-tags');

            const addContatoField = (contato = { nome: '', telefone: '' }) => {
                const contatoDiv = document.createElement('div');
                contatoDiv.className = 'contato-field-group';
                contatoDiv.innerHTML = `
                    <input type="text" placeholder="Nome do Contato" value="${contato.nome}" class="form-control contato-nome">
                    <input type="tel" placeholder="Telefone (só números com DDD)" value="${contato.telefone}" class="form-control contato-telefone">
                    <button type="button" class="btn btn-danger btn-remove-contato">Remover</button>
                `;
                contatosContainer.appendChild(contatoDiv);
                contatoDiv.querySelector('.btn-remove-contato').addEventListener('click', () => contatoDiv.remove());
            };

            const addMarcaTag = (marca) => {
                if (!marca.trim()) return;
                const tagSpan = document.createElement('span');
                tagSpan.className = 'marca-tag';
                tagSpan.textContent = marca.trim();
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => tagSpan.remove();
                tagSpan.appendChild(removeBtn);
                marcasTagsContainer.appendChild(tagSpan);
            };

            const handleAddMarca = () => {
                addMarcaTag(marcasInput.value);
                marcasInput.value = '';
                marcasInput.focus();
            };

            btnAddContato.addEventListener('click', () => addContatoField());
            btnAddMarca.addEventListener('click', handleAddMarca);
            marcasInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMarca();
                }
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = form.querySelector(`#${config.id}-id`).value;
            const data = {};
            for (const key in config.fields) {
                const input = form.querySelector(`#${config.id}-${key}`);
                if (input.type === 'checkbox') {
                    data[key] = input.checked;
                } else {
                    data[key] = input.value;
                }
            }

            if (config.id === 'fornecedor') {
                const contatosNodes = modal.querySelectorAll('.contato-field-group');
                data.contatos = Array.from(contatosNodes).map(node => ({
                    nome: node.querySelector('.contato-nome').value.trim(),
                    telefone: node.querySelector('.contato-telefone').value.trim()
                })).filter(c => c.nome && c.telefone);

                const marcaNodes = modal.querySelectorAll('.marca-tag');
                data.marcas = Array.from(marcaNodes).map(node => node.firstChild.textContent.trim());
            }

            try {
                if (id) {
                    await setDoc(doc(db, config.collectionName, id), data, { merge: true });
                    alert(`${config.name} atualizado com sucesso!`);
                } else {
                    await addDoc(collection(db, config.collectionName), data);
                    alert(`${config.name} salvo com sucesso!`);
                }
                form.reset();
                if (config.id === 'fornecedor') {
                    modal.querySelector('#lista-contatos-form').innerHTML = '';
                    modal.querySelector('#lista-marcas-tags').innerHTML = '';
                }
                form.querySelector(`#${config.id}-id`).value = '';

            } catch (error) {
                console.error(`Erro ao salvar ${config.name}:`, error);
                alert(`Erro ao salvar: ${error.message}`);
            }
        });

        // SUBSTITUA O BLOCO ANTIGO POR ESTE:

        const colRef = collection(db, config.collectionName);
        unsubscribe = onSnapshot(colRef, (snapshot) => {
            currentData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

            tableBody.innerHTML = '';
            currentData.forEach(item => {
                const row = document.createElement('tr');

                if (config.id === 'fornecedor') {
                    // Célula Nome
                    const tdNome = document.createElement('td');
                    tdNome.textContent = item.data.nome;
                    row.appendChild(tdNome);

                    // Célula Contatos
                    const tdContatos = document.createElement('td');
                    if (item.data.contatos && item.data.contatos.length > 0) {
                        tdContatos.innerHTML = item.data.contatos.map(c => {
                            const telefonePuro = String(c.telefone || '').replace(/\D/g, '');
                            return `<div class="contato-item">${c.nome}: ${formatarTelefone(c.telefone)} <a href="https://wa.me/55${telefonePuro}" target="_blank" title="Abrir no WhatsApp" class="whatsapp-link"><i data-feather="message-circle"></i></a></div>`;
                        }).join('');
                    } else {
                        tdContatos.textContent = 'Nenhum contato';
                    }
                    row.appendChild(tdContatos);

                    // Célula Marcas
                    const tdMarcas = document.createElement('td');
                    if (item.data.marcas && item.data.marcas.length > 0) {
                        tdMarcas.innerHTML = item.data.marcas.map(m => `<span class="marca-tag-display">${m}</span>`).join(' ');
                    } else {
                        tdMarcas.textContent = 'Nenhuma marca';
                    }
                    row.appendChild(tdMarcas);

                } else {
                    if (config.render) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = `<table><tbody><tr>${config.render(item.data)}</tr></tbody></table>`;
                        Array.from(tempDiv.querySelector('tr').cells).forEach(cell => row.appendChild(cell.cloneNode(true)));
                    }
                }

                // Célula Ações
                const tdActions = document.createElement('td');
                tdActions.className = 'actions';
                tdActions.innerHTML = `<button class="btn-edit" data-id="${item.id}">Editar</button> <button class="btn-delete" data-id="${item.id}">Excluir</button>`;
                row.appendChild(tdActions);

                tableBody.appendChild(row);
            });

            feather.replace();
        });

        tableBody.addEventListener('click', async (e) => {
            const target = e.target;
            if (!target.classList.contains('btn-edit') && !target.classList.contains('btn-delete')) return;

            const id = target.dataset.id;
            if (!id) return;

            if (target.classList.contains('btn-edit')) {
                const item = currentData.find(d => d.id === id);
                if (item) {
                    form.reset();
                    if (config.id === 'fornecedor') {
                        modal.querySelector('#lista-contatos-form').innerHTML = '';
                        modal.querySelector('#lista-marcas-tags').innerHTML = '';
                    }

                    form.querySelector(`#${config.id}-id`).value = item.id;
                    for (const key in config.fields) {
                        const input = form.querySelector(`#${config.id}-${key}`);
                        if (input.type === 'checkbox') {
                            input.checked = item.data[key] === true;
                        } else {
                            input.value = item.data[key] || '';
                        }
                    }

                    if (config.id === 'fornecedor') {
                        (item.data.contatos || []).forEach(c => {
                            const contatoDiv = document.createElement('div');
                            contatoDiv.className = 'contato-field-group';
                            contatoDiv.innerHTML = `
                                <input type="text" placeholder="Nome do Contato" value="${c.nome || ''}" class="form-control contato-nome">
                                <input type="tel" placeholder="Telefone (só números com DDD)" value="${c.telefone || ''}" class="form-control contato-telefone">
                                <button type="button" class="btn btn-danger btn-remove-contato">Remover</button>
                            `;
                            modal.querySelector('#lista-contatos-form').appendChild(contatoDiv);
                            contatoDiv.querySelector('.btn-remove-contato').addEventListener('click', () => contatoDiv.remove());
                        });

                        (item.data.marcas || []).forEach(m => {
                            const tagSpan = document.createElement('span');
                            tagSpan.className = 'marca-tag';
                            tagSpan.textContent = m;
                            const removeBtn = document.createElement('button');
                            removeBtn.type = 'button';
                            removeBtn.innerHTML = '&times;';
                            removeBtn.onclick = () => tagSpan.remove();
                            tagSpan.appendChild(removeBtn);
                            marcasTagsContainer.appendChild(tagSpan);
                        });
                    }
                    form.scrollIntoView({ behavior: 'smooth' });
                }
            }

            if (target.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este item?')) {
                    try {
                        await deleteDoc(doc(db, config.collectionName, id));
                        alert('Item excluído com sucesso!');
                    } catch (error) {
                        console.error('Erro ao excluir:', error);
                        alert(`Erro ao excluir: ${error.message}`);
                    }
                }
            }
        });

        filterInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = currentData.filter(item => {
                return Object.values(item.data).some(value =>
                    String(value).toLowerCase().includes(searchTerm)
                );
            });
            renderTable(filteredData);
        });

        const observer = new MutationObserver((mutationsList) => {
            for(const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (modal.style.display === 'none' && unsubscribe) {
                        unsubscribe();
                        observer.disconnect();
                        return;
                    }
                }
            }
        });
        observer.observe(modal, { attributes: true });
    }

    const renderTable = (data) => {
        const config = configs.find(c => document.getElementById(`table-${c.id}`));
        if (!config) return;

        const tableBody = document.getElementById(`table-${config.id}`).querySelector('tbody');
        tableBody.innerHTML = '';

        data.forEach(item => {
            const row = document.createElement('tr');

            if (config.id === 'fornecedor') {
                const tdNome = document.createElement('td');
                tdNome.textContent = item.data.nome;
                row.appendChild(tdNome);

                const tdContatos = document.createElement('td');
                if (item.data.contatos && item.data.contatos.length > 0) {
                    tdContatos.innerHTML = item.data.contatos.map(c => {
                        const telefonePuro = String(c.telefone || '').replace(/\D/g, '');
                        return `<span class="contato-item">${c.nome}: ${formatarTelefone(c.telefone)} <a href="https://wa.me/${telefonePuro}" target="_blank" title="Abrir no WhatsApp" class="whatsapp-link"><i data-feather="message-circle"></i></a></span>`;
                    }).join('<br>');
                } else {
                    tdContatos.textContent = 'Nenhum contato';
                }
                row.appendChild(tdContatos);

                const tdMarcas = document.createElement('td');
                if (item.data.marcas && item.data.marcas.length > 0) {
                    tdMarcas.innerHTML = item.data.marcas.map(m => `<span class="marca-tag-display">${m}</span>`).join(' ');
                } else {
                    tdMarcas.textContent = 'Nenhuma marca';
                }
                row.appendChild(tdMarcas);

            } else {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = `<table><tbody><tr>${config.render(item.data)}</tr></tbody></table>`;
                Array.from(tempDiv.querySelector('tr').cells).forEach(cell => {
                    row.appendChild(cell.cloneNode(true));
                });
            }

            const tdActions = document.createElement('td');
            tdActions.className = 'actions';
            tdActions.innerHTML = `
                <button class="btn-edit" data-id="${item.id}">Editar</button>
                <button class="btn-delete" data-id="${item.id}">Excluir</button>
            `;
            row.appendChild(tdActions);

            tableBody.appendChild(row);
        });
        feather.replace();
    };
});
