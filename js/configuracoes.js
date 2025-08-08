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
            fields: { nome: "Nome do Fornecedor", imposto: "Imposto (ST)" },
            render: (d) => {
                const contatosHtml = (d.contatos || []).map(c => {
                    const telefonePuro = String(c.telefone || '').replace(/\D/g, '');
                    return `<span style="display: block; white-space: nowrap;">
                        ${c.nome}: ${formatarTelefone(c.telefone)}
                        <a href="https://wa.me/${telefonePuro}" target="_blank" title="Abrir no WhatsApp" style="color: #25D366; text-decoration: none; margin-left: 5px;">
                            <i data-feather="message-circle" style="width: 16px; height: 16px; vertical-align: middle;"></i>
                        </a>
                    </span>`
                }).join('');
                return `<td>${d.nome}</td><td>${contatosHtml || 'Nenhum contato'}</td>`;
            },
            tableHeaders: "<th>Nome</th><th>Contatos</th>"
        },
        { name: "Grupos", id: "grupo", collectionName: "grupos", fields: { nome: "Nome do Grupo" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Aplicações", id: "aplicacao", collectionName: "aplicacoes", fields: { nome: "Nome da Aplicação" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Conjuntos", id: "conjunto", collectionName: "conjuntos", fields: { nome: "Nome do Conjunto" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        { name: "Gerenciar Locação", id: "local", collectionName: "locais", fields: { nome: "Nome do Local" }, render: (d) => `<td>${d.nome}</td>`, tableHeaders: "<th>Nome</th>" },
        {
            name: "Tipos de Entrada",
            id: "tipo-entrada",
            collectionName: "tipos_entrada",
            fields: {
                nome: "Nome do Tipo de Entrada",
                movimenta_estoque: "Movimenta Estoque",
                recalcula_custo_medio: "Recalcula Custo Médio",
                informa_valor_unitario: "Informa Valor Unitário"
            },
            render: (d) => `<td>${d.nome}</td>`,
            tableHeaders: "<th>Nome</th>"
        },
        {
            name: "Tipos de Saída",
            id: "tipo-saida",
            collectionName: "tipos_saida",
            fields: {
                nome: "Nome do Tipo de Saída",
                movimenta_estoque: "Movimenta Estoque",
                informa_obra: "Informa Obra",
                reservar_estoque: "É uma Reserva?"
            },
            render: (d) => `<td>${d.nome}</td>`,
            tableHeaders: "<th>Nome</th>"
        },
        { name: "Obras", id: "obra", collectionName: "obras", fields: { codigo: "Código da Obra", nome: "Nome da Obra" }, render: (d) => `<td>${d.codigo || ''}</td><td>${d.nome}</td>`, tableHeaders: "<th>Código</th><th>Nome</th>" },
        {
            name: "Conversão de Unidade",
            id: "conversao",
            collectionName: "conversoes",
            fields: {
                nome_regra: "Nome da Regra (ex: Metro p/ Peça)",
                qtd_compra: "Unidade de Compra (valor)",
                medida_compra: "Medida Compra (ex: m, kg, cm)",
                qtd_padrao: "Unidade Padrão (valor)",
                medida_padrao: "Medida Padrão (ex: Pç, Un, Cx)",
                unidade_sobra: "Unidade da Sobra (Ex: mm)",
                fator_conversao_sobra: "Fator Conversão Sobra (Ex: 5800)"
            },
            render: (d) => `<td>${d.nome_regra}</td><td>${d.qtd_compra} ${d.medida_compra} = ${d.qtd_padrao} ${d.medida_padrao}</td><td>1 ${d.medida_padrao} = ${d.fator_conversao_sobra} ${d.unidade_sobra}</td>`,
            tableHeaders: "<th>Nome da Regra</th><th>Fórmula Padrão</th><th>Fórmula Sobra</th>"
        }
    ];

    const buttonsContainer = document.getElementById('config-buttons-container');
    const modal = document.getElementById('config-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const closeButton = document.querySelector('.close-button');

    configs.forEach(config => {
        const button = document.createElement('button');
        button.className = 'btn';
        button.style.backgroundColor = '#495057';
        button.textContent = `Gerenciar ${config.name}`;
        button.addEventListener('click', () => openConfigModal(config));
        buttonsContainer.appendChild(button);
    });

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
        let formFields = Object.entries(config.fields).map(([key, label]) => {
            if (key.includes('movimenta_') || key.includes('recalcula_custo_medio') || key.includes('informa_obra') || key.includes('informa_valor_unitario') || key.includes('reservar_estoque')) {
                return `
                    <div style="grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 0.5rem; background-color: #f8f9fa; border: 1px solid #ced4da; border-radius: 0.25rem;">
                        <input type="checkbox" id="${config.id}-${key}" style="width: auto; height: 1.2em; width: 1.2em;">
                        <label for="${config.id}-${key}" style="margin-bottom: 0;">${label}</label>
                    </div>
                `;
            }
            const inputType = (key.includes('imposto') || key.includes('valor')) ? 'number' : 'text';
            const step = inputType === 'number' ? 'step="0.01"' : '';
            return `<input type="${inputType}" id="${config.id}-${key}" placeholder="${label}" required class="form-control" ${step}>`;
        }).join('');

        return `
            <div class="card">
                <div class="card-header"><h3>Formulário de ${config.name}</h3></div>
                <div class="card-body">
                    <form id="form-${config.id}" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                        <input type="hidden" id="${config.id}-id">
                        ${formFields}
                        <button type="submit" class="btn btn-success" style="flex-basis: 100%;">Salvar</button>
                    </form>
                    <div id="contatos-container" style="margin-top: 20px;">
                        <h4 style="margin-bottom: 10px;">Contatos</h4>
                        <div id="lista-contatos-form"></div>
                        <button type="button" id="btn-add-contato" class="btn" style="background-color: #0d6efd; margin-top: 10px;">Adicionar Contato</button>
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3>${config.name} Cadastrados</h3></div>
                <div class="card-body">
                    <input type="text" id="filter-${config.id}" class="form-control" placeholder="Filtrar..." style="margin-bottom: 15px;">
                    <div class="table-wrapper">
                        <table id="table-${config.id}" class="table">
                            <thead><tr>${config.tableHeaders}<th>Ações</th></tr></thead>
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

            const addContatoField = (contato = { nome: '', telefone: '' }) => {
                const contatoDiv = document.createElement('div');
                contatoDiv.className = 'contato-field-group';
                contatoDiv.innerHTML = `
                    <input type="text" placeholder="Nome do Contato" value="${contato.nome}" class="form-control contato-nome">
                    <input type="tel" placeholder="Telefone (só números com DDD)" value="${contato.telefone}" class="form-control contato-telefone">
                    <button type="button" class="btn btn-danger btn-remove-contato">Remover</button>
                `;
                contatosContainer.appendChild(contatoDiv);

                contatoDiv.querySelector('.btn-remove-contato').addEventListener('click', () => {
                    contatoDiv.remove();
                });
            };

            btnAddContato.addEventListener('click', () => addContatoField());

            form.addEventListener('reset', () => {
                 setTimeout(() => {
                    contatosContainer.innerHTML = '';
                 }, 0);
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
                const contatosData = [];
                contatosNodes.forEach(node => {
                    const nome = node.querySelector('.contato-nome').value.trim();
                    const telefone = node.querySelector('.contato-telefone').value.trim();
                    if (nome && telefone) {
                        contatosData.push({ nome, telefone });
                    }
                });
                data.contatos = contatosData;
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
                form.querySelector(`#${config.id}-id`).value = '';
            } catch (error) {
                console.error(`Erro ao salvar ${config.name}:`, error);
                alert(`Erro ao salvar: ${error.message}`);
            }
        });

        const renderTable = (data) => {
            tableBody.innerHTML = '';
            data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    ${config.render(item.data)}
                    <td class="actions">
                        <button class="btn-edit" data-id="${item.id}">Editar</button>
                        <button class="btn-delete" data-id="${item.id}">Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
            feather.replace();
        };

        const colRef = collection(db, config.collectionName);
        unsubscribe = onSnapshot(colRef, (snapshot) => {
            currentData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
            renderTable(currentData);
        });

        tableBody.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            const id = target.dataset.id;
            if (!id) return;

            if (target.classList.contains('btn-edit')) {
                const item = currentData.find(d => d.id === id);
                if (item) {
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
                        const contatosContainer = modal.querySelector('#lista-contatos-form');
                        contatosContainer.innerHTML = '';
                        if (item.data.contatos) {
                            item.data.contatos.forEach(contato => {
                                const addContatoField = (c = { nome: '', telefone: '' }) => {
                                    const contatoDiv = document.createElement('div');
                                    contatoDiv.className = 'contato-field-group';
                                    contatoDiv.innerHTML = `
                                        <input type="text" placeholder="Nome do Contato" value="${c.nome}" class="form-control contato-nome">
                                        <input type="tel" placeholder="Telefone (só números com DDD)" value="${c.telefone}" class="form-control contato-telefone">
                                        <button type="button" class="btn btn-danger btn-remove-contato">Remover</button>
                                    `;
                                    contatosContainer.appendChild(contatoDiv);
                                    contatoDiv.querySelector('.btn-remove-contato').addEventListener('click', () => contatoDiv.remove());
                                };
                                addContatoField(contato);
                            });
                        }
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
            const filteredData = currentData.filter(item =>
                Object.values(item.data).some(value =>
                    String(value).toLowerCase().includes(searchTerm)
                )
            );
            renderTable(filteredData);
        });

        const observer = new MutationObserver((mutationsList, observer) => {
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
});
