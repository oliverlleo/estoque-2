document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);

    produtos.forEach(produto => {
        const pData = produto.data;
        const enderecamento = produto.enderecamento || 'N/A';

        // Cria o elemento da etiqueta
        const etiquetaDiv = document.createElement('div');
        etiquetaDiv.className = 'etiqueta';

        // Monta o HTML interno da etiqueta
        etiquetaDiv.innerHTML = `
        <div class="etiqueta-main">
            <div class="qr-code" id="qr-${produto.id}"></div>
            <div class="produto-info">
                <div class="info-bloco produto">
                    <div class="header">PRODUTO</div>
                    <div class="valor">${pData.descricao || ''}</div>
                </div>
                <div class="info-bloco codigo">
                    <div class="header">CÓDIGO</div>
                    <div class="valor">${pData.codigo || ''}</div>
                </div>
                <div class="info-bloco codigo-padrao">
                    <div class="header">C. PADRÃO</div>
                    <div class="valor">${pData.codigo_global || ''}</div>
                </div>
            </div>
        </div>
        <div class="etiqueta-footer">
            ENDEREÇAMENTO: ${enderecamento}
        </div>
    `;

        // Adiciona a etiqueta ao container
        container.appendChild(etiquetaDiv);

        // Gera o QR Code no seu respectivo container
        const url = `${window.location.origin}/detalhe-produto.html?id=${produto.id}`;
        new QRCode(document.getElementById(`qr-${produto.id}`), {
            text: url,
            width: 120,
            height: 120,
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    // ---- INÍCIO DO NOVO BLOCO DE CÓDIGO ----
    // Pega todos os elementos de valor que precisam de ajuste
    const elementosParaAjustar = document.querySelectorAll('.info-bloco .valor');

    // Aplica a função de ajuste para cada um deles
    elementosParaAjustar.forEach(el => {
        adjustFontSizeToFit(el);
    });
    // ---- FIM DO NOVO BLOCO DE CÓDIGO ----

    // Limpa os dados do localStorage depois de usados
    localStorage.removeItem('etiquetasParaImprimir');
});

function adjustFontSizeToFit(element) {
    // Reseta qualquer estilo inline para começar do zero a cada vez
    element.style.fontSize = '';
    element.style.lineHeight = '';

    // Pega os estilos computados para os valores iniciais
    const style = window.getComputedStyle(element);
    let fontSize = parseFloat(style.fontSize);
    let lineHeight = parseFloat(style.lineHeight);

    // Condição de estouro: a altura do conteúdo é maior que a do contêiner,
    // OU a largura do conteúdo é maior que a do contêiner.
    const isOverflowing = () => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;

    // Loop: enquanto o elemento estiver transbordando (sem tamanho mínimo)
    while (isOverflowing()) {
        // Reduz a fonte
        fontSize -= 0.5;
        // Reduz a altura da linha proporcionalmente. Isso é CRUCIAL para textos com quebra de linha.
        lineHeight -= 0.6;

        // Aplica os novos valores
        element.style.fontSize = `${fontSize}px`;
        element.style.lineHeight = `${lineHeight}px`;

        // Mecanismo de segurança para evitar um loop infinito em casos bizarros
        if (fontSize < 1) {
            break;
        }
    }
}
