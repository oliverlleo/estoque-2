
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db } from '../firebase-config.js';

/**
 * Calculates the current average cost of a product in real-time by processing its entire movement history.
 * This ensures the cost used is accurate even if the static 'valorMedio' field on the product document is outdated.
 *
 * Logic replicates 'js/consultas.js'.
 *
 * @param {string} productId - The ID of the product.
 * @returns {Promise<number>} - The calculated average cost.
 */
export async function calcularCustoMedioEmTempoReal(productId) {
    if (!productId) return 0;

    const q = query(collection(db, 'movimentacoes'), where("productId", "==", productId));
    const movementsSnapshot = await getDocs(q);
    const productMovements = [];
    movementsSnapshot.forEach(doc => {
        productMovements.push(doc.data());
    });

    // Ordena as movimentações por data para o cálculo correto do custo médio
    productMovements.sort((a, b) => a.data.toMillis() - b.data.toMillis());

    console.log(`[finance.js] Calculando custo médio para ${productId}. ${productMovements.length} movimentações encontradas.`);

    let totalQuantity = 0;
    let totalCost = 0;

    productMovements.forEach(mov => {
        if (mov.tipo === 'entrada') {
            let custoEntrada = mov.custo_total_entrada;
            if (custoEntrada === undefined || custoEntrada === null) {
                // Fallback para entradas antigas ou sem custo total explícito
                custoEntrada = (mov.quantidade_compra * (mov.valor_unitario || 0)) + (mov.icms || 0) + (mov.ipi || 0) + (mov.frete || 0);
            }
            // Apenas considera entradas que efetivamente aumentam o custo (evita divisões por zero estranhas se houver lógica customizada)
             if (mov.quantidade > 0) {
                totalCost += custoEntrada;
                totalQuantity += mov.quantidade;
            }
        } else if (mov.tipo === 'saida') {
            const currentAvgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
            totalCost -= mov.quantidade * currentAvgCost;
            totalQuantity -= mov.quantidade;
        }
        // Reservas não afetam o custo médio até serem confirmadas (virarem saída),
        // e 'reserva_cancelada' é ignorada.
    });

    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
}
