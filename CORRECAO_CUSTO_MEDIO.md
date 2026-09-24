# Correção do custo médio de inventário

## O que foi corrigido

1. Inventário positivo passa a herdar o custo médio vigente.
2. Inventário negativo passa a registrar o custo médio vigente e o custo total da baixa.
3. A consulta e o dashboard usam a mesma regra de custo médio móvel.
4. O recálculo de custo médio foi centralizado em `js/custo-medio.js`.
5. Foi criada a tela `migracao-custo-medio.html` para corrigir movimentações antigas.

## Regra aplicada

- Entrada valorizada: acrescenta quantidade e custo total.
- Inventário positivo: acrescenta quantidade e `quantidade × custo médio vigente`; o custo médio não muda naquele momento.
- Saída e inventário negativo: retiram quantidade e valor pelo custo médio vigente.
- Reserva e transferência: não alteram o custo médio consolidado.

## Migração de dados antigos

1. Abra **Configurações**.
2. Acesse **Migração de Custo Médio**.
3. Clique em **Simular correção**.
4. Baixe o backup JSON.
5. Revise os produtos marcados como `REVISÃO MANUAL`.
6. Digite `CORRIGIR` e aplique somente os itens marcados como `PRONTO`.

A migração não altera automaticamente produtos cujo saldo reconstruído não confere com o saldo atual ou cujo primeiro inventário não possui custo médio anterior válido.

## Validação de implementação inicial por produto

A tela de inventário não usa mais apenas o saldo da localização para decidir se o lançamento é uma implementação inicial.

A decisão agora exige simultaneamente:

- estoque total do produto igual a zero em todas as locações;
- custo médio atual igual a zero;
- inexistência de qualquer movimentação anterior do produto.

Se o produto já tiver histórico, mesmo com estoque total e custo zerados, o sistema não permite tratá-lo como primeira implementação. Nesse caso, solicita a migração/correção do custo antes de um novo ajuste de inventário.


## Versão 4 — último custo conhecido com estoque zero

- O campo `valorMedio` não é apagado quando o saldo chega a zero.
- A Consulta e o Dashboard exibem o último custo médio conhecido mesmo com estoque zero.
- O valor total do estoque permanece `0,00` quando a quantidade é zero.
- Para produtos antigos, a exibição usa primeiro o custo já salvo no produto; se ele estiver zerado, usa o último custo válido reconstruído das movimentações.
- Uma nova compra com saldo anterior zero define um novo custo médio somente pelo custo da nova entrada.
- O recálculo e a migração não substituem um último custo válido por zero quando o histórico não contém base suficiente.
