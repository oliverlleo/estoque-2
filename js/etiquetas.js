function adjustFontSizeToFit(element) {
    element.style.fontSize = ''; // Reseta para o tamanho padrão do CSS

    // A condição de estouro simples, que agora vai funcionar graças ao CSS rígido
    const isOverflowing = () => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;

    if (isOverflowing()) {
        let currentSize = parseFloat(window.getComputedStyle(element).fontSize);
        while (isOverflowing() && currentSize > 4) {
            currentSize -= 1; // Diminui 1px por vez
            element.style.fontSize = currentSize + 'px';
        }
    }
}

function processarEtiquetas() {
    const container = document.getElementById('etiquetas-container');
    const dadosJSON = localStorage.getItem('etiquetasParaImprimir');

    if (!dadosJSON) {
        container.innerHTML = '<p>Nenhum dado de etiqueta encontrado. Por favor, gere as etiquetas a partir da página de produtos.</p>';
        return;
    }

    const produtos = JSON.parse(dadosJSON);
    if (!produtos || produtos.length === 0) {
        container.innerHTML = '<p>Lista de etiquetas para impressão está vazia.</p>';
        return;
    }

    const formato = produtos[0].formato || '100x50';
    const style = document.createElement('style');
    style.type = 'text/css';

    if (formato === '100x25') {
        style.innerHTML = `
            /* ON-SCREEN STYLES: Faz a estrutura de duas metades parecer com a original */
            .etiqueta.formato-100x25 {
                display: contents; /* Faz o container desaparecer, promovendo os filhos */
            }
            .etiqueta-meia {
                /* Recria a aparência da .etiqueta original para cada metade na tela */
                background-color: white; width: 100mm; height: 50mm; padding: 4mm;
                box-sizing: border-box; border: 1px dashed #ccc; margin: 20px auto;
                display: flex; flex-direction: column; overflow: hidden;
            }
            .etiqueta-meia:empty {
                display: none; /* Oculta a metade vazia na tela */
            }

            /* PRINT STYLES: Aplica o layout lado a lado apenas na impressão */
            @media print {
                @page { size: 100mm 25mm; margin: 0; }

                /* Restaura o container .etiqueta para impressão */
                .etiqueta.formato-100x25 {
                    display: flex; flex-direction: row; justify-content: space-between;
                    height: 25mm; width: 100mm;
                    padding: 0; margin: 0; border: none; background: none;
                    page-break-after: always;
                }
                .etiqueta.formato-100x25:last-child { page-break-after: avoid; }

                /* Formata as metades para o tamanho de impressão correto */
                .etiqueta-meia {
                    width: 50mm; height: 25mm; padding: 2mm; margin: 0; border: none;
                    display: flex; flex-direction: column; overflow: hidden; position: relative;
                }
                .etiqueta-meia:empty { display: block; }

                /* Ajusta o tamanho da fonte e QR code para o espaço menor */
                .etiqueta-meia .qr-code { width: 20mm; height: 20mm; }
                .etiqueta-meia .qr-code img, .etiqueta-meia .qr-code canvas { width: 100% !important; height: auto !important; }
                .etiqueta-meia .descricao-produto { font-size: 8pt; }
                .etiqueta-meia .detalhe-produto { font-size: 7pt; }
                .etiqueta-meia .codigo-produto { font-size: 9pt; padding: 2px 4px; }
                .etiqueta-meia .etiqueta-footer { font-size: 9pt; margin-top: 1mm; padding-top: 1mm; border-top: 2px solid black; }
            }
        `;
    }
    // O @page para 100x50 já está no CSS do HTML, então não é preciso adicionar aqui.
    document.head.appendChild(style);

    container.innerHTML = '';
    const qrcodesParaGerar = [];

    const gerarConteudoEtiqueta = (produto) => {
        const pData = produto.data;
        const fornecedor = produto.fornecedor || 'N/A';
        const enderecamento = produto.enderecamento || 'N/A';
        const qrId = `qr-${produto.labelId}`;

        qrcodesParaGerar.push({
            id: qrId,
            productId: produto.productId,
            locacaoId: produto.locacaoId,
            size: formato === '100x25' ? 75 : 120,
        });

        // Retorna o HTML interno da etiqueta
        return `
            <div class="etiqueta-main">
                <div class="qr-code" id="${qrId}"></div>
                <div class="produto-info">
                    <div class="descricao-produto">${pData.descricao || ''}</div>
                    <div class="detalhe-produto">${pData.cor || 'N/A'}</div>
                    <div class="detalhe-produto">${fornecedor}</div>
                    <div class="codigo-container">
                       <div class="codigo-produto">${pData.codigo || ''}</div>
                    </div>
                </div>
            </div>
            <div class="etiqueta-footer">${enderecamento}</div>
        `;
    };

    if (formato === '100x25') {
        for (let i = 0; i < produtos.length; i += 2) {
            const produto1 = produtos[i];
            const produto2 = (i + 1 < produtos.length) ? produtos[i + 1] : null;

            const etiquetaDiv = document.createElement('div');
            // Adiciona a classe de formato para aplicar os estilos corretos
            etiquetaDiv.className = 'etiqueta formato-100x25';

            let html = `<div class="etiqueta-meia">${gerarConteudoEtiqueta(produto1)}</div>`;
            if (produto2) {
                html += `<div class="etiqueta-meia">${gerarConteudoEtiqueta(produto2)}</div>`;
            } else {
                html += '<div class="etiqueta-meia"></div>'; // Metade em branco
            }
            etiquetaDiv.innerHTML = html;
            container.appendChild(etiquetaDiv);
        }
    } else { // 100x50
        produtos.forEach(produto => {
            const etiquetaDiv = document.createElement('div');
            etiquetaDiv.className = 'etiqueta'; // Classe padrão
            etiquetaDiv.innerHTML = gerarConteudoEtiqueta(produto);
            container.appendChild(etiquetaDiv);
        });
    }

    // Gera todos os QR codes após a criação do HTML
    qrcodesParaGerar.forEach(qr => {
        let url = `${window.location.origin}/detalhe-produto.html?id=${qr.productId}`;
        if (qr.locacaoId) { url += `&locId=${qr.locacaoId}`; }
        new QRCode(document.getElementById(qr.id), {
            text: url, width: qr.size, height: qr.size, correctLevel: QRCode.CorrectLevel.H
        });
    });

    // Ajusta o tamanho da fonte após a renderização
    requestAnimationFrame(() => {
        document.querySelectorAll('.descricao-produto').forEach(el => adjustFontSizeToFit(el));
    });
}

// Inicia o processo quando a página carregar
document.addEventListener('DOMContentLoaded', processarEtiquetas);
