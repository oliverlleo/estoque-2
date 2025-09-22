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
            icon: "groups",
            description: "Cadastre e gerencie seus fornecedores.",
            collectionName: "fornecedores",
            fields: { nome: { label: "Nome do Fornecedor" }, imposto: { label: "Imposto (ST)", type: 'number' } },
            tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contatos</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marcas</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>`
        },
        { name: "Grupos", id: "grupo", icon: "category", description: "Organize seus produtos em grupos.", collectionName: "grupos", fields: { nome: { label: "Nome do Grupo" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>` },
        { name: "Aplicações", id: "aplicacao", icon: "widgets", description: "Defina as aplicações dos produtos.", collectionName: "aplicacoes", fields: { nome: { label: "Nome da Aplicação" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>` },
        { name: "Conjuntos", id: "conjunto", icon: "blender", description: "Crie e gerencie conjuntos de produtos.", collectionName: "conjuntos", fields: { nome: { label: "Nome do Conjunto" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>` },
        { name: "Locação", id: "local", icon: "place", description: "Gerencie os locais de armazenamento.", collectionName: "locais", fields: { nome: { label: "Nome do Local" } }, render: (d) => `<td>${d.nome || ''}</td>`, tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>` },
        {
            name: "Tipos de Entrada",
            id: "tipo-entrada",
            icon: "input",
            description: "Configure os tipos de entrada de estoque.",
            collectionName: "tipos_entrada",
            fields: {
                nome: { label: "Nome do Tipo de Entrada" },
                movimenta_estoque: { label: "Movimenta Estoque", type: 'checkbox' },
                recalcula_custo_medio: { label: "Recalcula Custo Médio", type: 'checkbox' },
                informa_valor_unitario: { label: "Valor Obrigatório", type: 'checkbox' }
            },
            render: (d) => `
            <td>${d.nome || ''}</td>
            <td>${d.movimenta_estoque ? 'Sim' : 'Não'}</td>
            <td>${d.recalcula_custo_medio ? 'Sim' : 'Não'}</td>
            <td>${d.informa_valor_unitario ? 'Sim' : 'Não'}</td>
        `,
            tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mov. Estoque</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recalc. Custo</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Obrigatório</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>`
        },
        {
            name: "Tipos de Saída",
            id: "tipo-saida",
            icon: "output",
            description: "Configure os tipos de saída de estoque.",
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
            tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mov. Estoque</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Informa Obra</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reserva</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>`
        },
        {
            name: "Obras",
            id: "obra",
            icon: "construction",
            description: "Gerencie as obras relacionadas ao estoque.",
            collectionName: "obras",
            fields: {
                codigo: { label: "Código da Obra" },
                nome: { label: "Nome da Obra" },
                orcamento: { label: "Orçamento", type: 'number' }
            },
            render: (d) => `<td>${d.codigo || ''}</td><td>${d.nome || ''}</td><td>${(d.orcamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>`,
            tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orçamento</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>`
        },
        {
            name: "Conversão de Unidade",
            id: "conversao",
            icon: "swap_horiz",
            description: "Defina as conversões de unidades de medida.",
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
            tableHeaders: `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome da Regra</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fórmula Padrão</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fórmula Sobra</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>`
        }
    ];

    const buttonsContainer = document.getElementById('config-buttons-container');
    const modal = document.getElementById('config-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const closeButton = document.querySelector('.close-button');

    const iconColorClasses = [
        'text-blue-500', 'text-green-500', 'text-indigo-500', 'text-purple-500',
        'text-yellow-500', 'text-red-500', 'text-pink-500', 'text-teal-500', 'text-orange-500'
    ];

    configs.forEach((config, index) => {
        const card = document.createElement('a');
        card.href = "#";
        card.className = "bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow flex flex-col items-center text-center";
        card.addEventListener('click', (e) => {
            e.preventDefault();
            openConfigModal(config)
        });

        const iconColor = iconColorClasses[index % iconColorClasses.length];

        card.innerHTML = `
            <span class="material-icons text-4xl ${iconColor} mb-4">${config.icon}</span>
            <h2 class="text-lg font-semibold text-gray-800">${config.name}</h2>
            <p class="text-gray-500 text-sm mt-1">${config.description}</p>
        `;

        buttonsContainer.appendChild(card);
    });

    function openConfigModal(config) {
        modalTitle.textContent = `Cadastro de ${config.name}`;
        modalBody.innerHTML = generateModalContent(config);
        setupModalCrud(config);
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeModel() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modalBody.innerHTML = '';
    }

    closeButton.addEventListener('click', closeModel);
    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            closeModel();
        }
    });

function generateModalContent(config) {
    const inputBaseClasses = "w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out";

    let formFields = Object.entries(config.fields).map(([key, fieldDef]) => {
        const id = `${config.id}-${key}`;
        const label = fieldDef.label;
        const type = fieldDef.type || 'text';

        if (type === 'checkbox') {
            return `
                <div class="flex items-center">
                    <input type="checkbox" id="${id}" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                    <label for="${id}" class="ml-2 block text-sm text-gray-900">${label}</label>
                </div>
            `;
        }

        const inputType = type === 'number' ? 'number' : 'text';
        const step = type === 'number' ? 'step="0.01"' : '';
        return `
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1" for="${id}">${label}</label>
                <input type="${inputType}" id="${id}" placeholder="${label}" class="${inputBaseClasses}" ${step}>
            </div>
        `;
    }).join('');

    const fornecedorExtraSections = `
        <div class="mb-6">
            <h3 class="text-lg font-medium text-gray-700 mb-3">Contatos</h3>
            <div id="lista-contatos-form" class="space-y-3"></div>
            <button type="button" id="btn-add-contato" class="mt-3 inline-flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <span class="material-icons mr-2">add</span>
                Adicionar Contato
            </button>
        </div>
        <div class="mb-6">
            <h3 class="text-lg font-medium text-gray-700 mb-3">Marcas</h3>
            <div class="flex items-center space-x-2">
                <input type="text" id="input-add-marca" placeholder="Digite uma marca e pressione Enter" class="flex-grow ${inputBaseClasses}">
                <button type="button" id="btn-add-marca" class="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Adicionar
                </button>
            </div>
            <div id="lista-marcas-tags" class="mt-3 flex flex-wrap gap-2"></div>
        </div>
    `;

    const tableHeadersHTML = config.id === 'fornecedor'
        ? `
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">Nome</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">Contatos</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" scope="col">Marcas</th>
            <th class="relative px-6 py-3" scope="col"><span class="sr-only">Ações</span></th>
        `
        : config.tableHeaders;


    return `
        <div>
            <form id="form-${config.id}">
                <input type="hidden" id="${config.id}-id">
                <div class="mb-6">
                    <h3 class="text-lg font-medium text-gray-700 mb-3">Formulário de ${config.name}</h3>
                    <div class="space-y-4">
                        ${formFields}
                    </div>
                </div>

                ${config.id === 'fornecedor' ? fornecedorExtraSections : ''}

                <div class="pt-4 border-t border-gray-200">
                    <button type="submit" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                        Salvar
                    </button>
                </div>
            </form>
        </div>

        <div class="bg-gray-50 border-t border-gray-200 -mx-6 -mb-6 mt-6 px-6 pb-6 pt-6 rounded-b-lg">
            <h3 class="text-lg font-medium text-gray-700 mb-4">${config.name} Cadastrados</h3>
            <div class="mb-4">
                <input type="text" id="filter-${config.id}" class="${inputBaseClasses}" placeholder="Filtrar...">
            </div>
            <div class="overflow-x-auto">
                <table id="table-${config.id}" class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-100">
                        <tr>${tableHeadersHTML}</tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200"></tbody>
                </table>
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

        let addContatoField = (contato = { nome: '', telefone: '' }) => {};
        let addMarcaTag = (marca) => {};

        if (config.id === 'fornecedor') {
            const contatosContainer = modal.querySelector('#lista-contatos-form');
            const btnAddContato = modal.querySelector('#btn-add-contato');
            const marcasInput = modal.querySelector('#input-add-marca');
            const btnAddMarca = modal.querySelector('#btn-add-marca');
            const marcasTagsContainer = modal.querySelector('#lista-marcas-tags');
            const inputBaseClasses = "w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out";

            addContatoField = (contato = { nome: '', telefone: '' }) => {
                const contatoDiv = document.createElement('div');
                contatoDiv.className = 'flex items-center space-x-2';
                contatoDiv.innerHTML = `
                    <input type="text" placeholder="Nome do Contato" value="${contato.nome}" class="flex-grow ${inputBaseClasses} contato-nome">
                    <input type="tel" placeholder="Telefone com DDD" value="${contato.telefone}" class="flex-grow ${inputBaseClasses} contato-telefone">
                    <button type="button" class="px-3 py-2 bg-red-500 text-white font-semibold rounded-md hover:bg-red-600 btn-remove-contato">
                        <span class="material-icons text-sm">delete</span>
                    </button>
                `;
                contatosContainer.appendChild(contatoDiv);
                contatoDiv.querySelector('.btn-remove-contato').addEventListener('click', () => contatoDiv.remove());
            };

            addMarcaTag = (marca) => {
                if (!marca.trim()) return;
                const tagSpan = document.createElement('span');
                tagSpan.className = "px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-gray-200 text-gray-800 items-center marca-tag";
                tagSpan.innerHTML = `
                    <span class="brand-text">${marca.trim()}</span>
                    <button type="button" class="ml-2 -mr-1 text-gray-500 hover:text-gray-700 focus:outline-none">
                        <span class="material-icons text-sm">close</span>
                    </button>
                `;
                marcasTagsContainer.appendChild(tagSpan);
                tagSpan.querySelector('button').addEventListener('click', () => tagSpan.remove());
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

                const marcaNodes = modal.querySelectorAll('.marca-tag .brand-text');
                data.marcas = Array.from(marcaNodes).map(node => node.textContent.trim());
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
                    row.innerHTML = `
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.data.nome || ''}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${(item.data.contatos && item.data.contatos.length > 0)
                                ? item.data.contatos.map(c => {
                                    const telefonePuro = String(c.telefone || '').replace(/\D/g, '');
                                    const temWhatsapp = telefonePuro.length >= 11;
                                    return `<div>${c.nome}: ${formatarTelefone(c.telefone)}
                                        ${temWhatsapp ? `<a href="https://wa.me/55${telefonePuro}" target="_blank" class="text-green-500 hover:text-green-700 inline-block align-middle"><span class="material-icons text-sm">check_circle</span></a>` : ''}
                                    </div>`;
                                }).join('')
                                : 'Nenhum contato'
                            }
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div class="flex flex-wrap gap-1">
                            ${(item.data.marcas && item.data.marcas.length > 0)
                                ? item.data.marcas.map(m => `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-200 text-gray-800">${m}</span>`).join(' ')
                                : 'Nenhuma marca'
                            }
                            </div>
                        </td>
                    `;
                } else {
                    if (config.render) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = `<table><tbody><tr>${config.render(item.data)}</tr></tbody></table>`;
                        Array.from(tempDiv.querySelector('tr').cells).forEach(cell => {
                            cell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
                            row.appendChild(cell.cloneNode(true))
                        });
                    }
                }

                const tdActions = document.createElement('td');
                tdActions.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2';
                tdActions.innerHTML = `
                    <button class="text-white bg-yellow-500 hover:bg-yellow-600 px-3 py-1 rounded-md text-xs font-semibold btn-edit" data-id="${item.id}">Editar</button>
                    <button class="text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md text-xs font-semibold btn-delete" data-id="${item.id}">Excluir</button>
                `;
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
                        (item.data.contatos || []).forEach(contato => addContatoField(contato));
                        (item.data.marcas || []).forEach(marca => addMarcaTag(marca));
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
