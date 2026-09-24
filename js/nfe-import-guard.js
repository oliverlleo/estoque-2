function elementoVisivel(elemento) {
    return Boolean(elemento) && window.getComputedStyle(elemento).display !== 'none';
}

export function instalarProtecaoImportacaoNFe() {
    const xmlModal = document.getElementById('xml-import-modal');
    const xmlModalClose = document.getElementById('xml-modal-close');
    const xmlLoader = document.getElementById('xml-import-loader');
    const btnConfirmarImportacao = document.getElementById('btn-confirmar-xml-import');
    const modalCorrecao = document.getElementById('correcao-fracionada-modal');
    const btnConfirmarCorrecoes = document.getElementById('btn-confirmar-correcoes');
    const modalCorrecaoClose = document.getElementById('correcao-modal-close');

    if (!xmlModal || !xmlLoader || !btnConfirmarImportacao) return;

    let fase = 'idle';
    let protegido = false;

    const estilosOriginais = new Map();
    [xmlModalClose, modalCorrecaoClose].filter(Boolean).forEach(elemento => {
        estilosOriginais.set(elemento, {
            pointerEvents: elemento.style.pointerEvents,
            opacity: elemento.style.opacity,
            cursor: elemento.style.cursor
        });
    });

    function atualizarFechamentoVisual(bloqueado) {
        [xmlModalClose, modalCorrecaoClose].filter(Boolean).forEach(elemento => {
            const original = estilosOriginais.get(elemento) || {};
            if (bloqueado) {
                elemento.style.pointerEvents = 'none';
                elemento.style.opacity = '0.35';
                elemento.style.cursor = 'not-allowed';
                elemento.setAttribute('aria-disabled', 'true');
                elemento.title = 'Aguarde a importação terminar';
            } else {
                elemento.style.pointerEvents = original.pointerEvents || '';
                elemento.style.opacity = original.opacity || '';
                elemento.style.cursor = original.cursor || '';
                elemento.removeAttribute('aria-disabled');
                elemento.removeAttribute('title');
            }
        });
    }

    function definirProtecao(ativa) {
        protegido = ativa;
        atualizarFechamentoVisual(ativa);
        document.documentElement.toggleAttribute('data-importacao-nfe-em-andamento', ativa);
    }

    function mostrarAvisoNoLoader() {
        const mensagem = xmlLoader.querySelector('.loader-message');
        if (!mensagem) return;

        if (!mensagem.dataset.textoOriginal) {
            mensagem.dataset.textoOriginal = mensagem.textContent || '';
        }

        mensagem.textContent = 'Importação em andamento. Aguarde a conclusão antes de sair.';
    }

    function sincronizarEstado() {
        const correcaoVisivel = elementoVisivel(modalCorrecao);
        const importacaoInicialSinalizada = btnConfirmarImportacao.disabled && elementoVisivel(xmlLoader);

        if (fase === 'idle' && importacaoInicialSinalizada && !correcaoVisivel) {
            fase = 'initial';
            definirProtecao(true);
            mostrarAvisoNoLoader();
            return;
        }

        if (fase === 'initial' && correcaoVisivel) {
            // A primeira etapa terminou. Neste ponto o sistema está aguardando
            // a decisão do usuário no modal de correção e não há gravação em andamento.
            fase = 'correction';
            definirProtecao(false);
            return;
        }

        if (fase === 'initial' && !btnConfirmarImportacao.disabled) {
            fase = 'idle';
            definirProtecao(false);
        }
    }

    const observer = new MutationObserver(sincronizarEstado);
    observer.observe(btnConfirmarImportacao, { attributes: true, attributeFilter: ['disabled'] });
    observer.observe(xmlLoader, { attributes: true, attributeFilter: ['style', 'class'] });
    if (modalCorrecao) {
        observer.observe(modalCorrecao, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    // O processamento das correções também grava item por item. Ativa a mesma
    // proteção antes de o handler original começar a executar.
    if (btnConfirmarCorrecoes) {
        btnConfirmarCorrecoes.addEventListener('click', () => {
            if (fase !== 'correction') return;
            fase = 'correction-processing';
            definirProtecao(true);
            mostrarAvisoNoLoader();
        }, true);
    }

    // Impede fechar o modal, clicar no fundo para fechá-lo ou navegar pelos links
    // internos enquanto existe gravação de NF-e em andamento.
    document.addEventListener('click', event => {
        if (!protegido) return;

        const alvo = event.target;
        const clicouFecharXml = xmlModalClose && (alvo === xmlModalClose || xmlModalClose.contains(alvo));
        const clicouFecharCorrecao = modalCorrecaoClose && (alvo === modalCorrecaoClose || modalCorrecaoClose.contains(alvo));
        const clicouFundoXml = alvo === xmlModal;
        const clicouFundoCorrecao = modalCorrecao && alvo === modalCorrecao;
        const link = alvo instanceof Element ? alvo.closest('a[href]') : null;

        if (clicouFecharXml || clicouFecharCorrecao || clicouFundoXml || clicouFundoCorrecao || link) {
            event.preventDefault();
            event.stopImmediatePropagation();
            mostrarAvisoNoLoader();
        }
    }, true);

    document.addEventListener('keydown', event => {
        if (!protegido) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            mostrarAvisoNoLoader();
        }
    }, true);

    window.addEventListener('beforeunload', event => {
        if (!protegido) return;

        // O fluxo original conclui as correções ocultando o modal e, em seguida,
        // chama location.reload(). Nesse único caso a recarga é parte da conclusão
        // normal e deve passar sem exibir um aviso falso.
        const recargaFinalCorrecao = fase === 'correction-processing' && modalCorrecao && !elementoVisivel(modalCorrecao);
        if (recargaFinalCorrecao) return;

        event.preventDefault();
        event.returnValue = '';
    });

    sincronizarEstado();
}
