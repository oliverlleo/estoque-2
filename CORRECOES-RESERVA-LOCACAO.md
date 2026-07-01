# Correções de reserva e locações

## Reserva confirmada

Ao confirmar uma reserva, a movimentação agora preserva a data original em `dataReserva` e grava a data efetiva da baixa em `confirmadaEm` e `dataSaida`.

As rotinas de histórico e custo médio usam a seguinte prioridade cronológica:

1. `confirmadaEm`
2. `dataSaida`
3. `data`

Isso impede que uma saída confirmada depois seja processada antes de uma entrada apenas porque a reserva foi criada anteriormente.

## Proteção das locações

A tela de edição de produtos não pode mais:

- remover uma locação com estoque;
- alterar local ou endereço de uma locação com estoque;
- zerar ou modificar silenciosamente a quantidade total;
- sobrescrever uma movimentação ocorrida enquanto o formulário estava aberto.

A edição usa transação e preserva as quantidades atuais do Firestore.

## Transferências

As transferências continuam funcionando normalmente pela tela de Movimentações. A rotina:

- debita a locação de origem;
- credita a locação de destino;
- registra uma movimentação `transferencia`;
- executa tudo dentro de uma transação.

O bloqueio existe somente na edição cadastral, para impedir transferências sem histórico.

## Registros antigos

Reservas confirmadas antes desta correção não possuem `confirmadaEm` ou `dataSaida`. Como a data real de confirmação não foi gravada, ela não pode ser reconstruída automaticamente com segurança. Esses casos devem continuar em revisão quando a ordem cronológica antiga gerar inconsistência.
