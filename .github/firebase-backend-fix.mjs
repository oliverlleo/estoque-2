import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, addDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

const source = fs.readFileSync('js/firebase-config.js', 'utf8');
const pick = (name) => (source.match(new RegExp(name + ':\\s*"([^"]+)"')) || [,''])[1];
const app = initializeApp({
  apiKey: pick('apiKey'),
  authDomain: pick('authDomain'),
  projectId: pick('projectId'),
  storageBucket: pick('storageBucket'),
  messagingSenderId: pick('messagingSenderId'),
  appId: pick('appId')
});
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const productId = 'Zgn3r67z03iBlwBH6pXF';
const movementId = 'W68GQhnt2hdyyz25KWc8';
const productRef = doc(db, 'produtos', productId);
const movementRef = doc(db, 'movimentacoes', movementId);

let before = null;
await runTransaction(db, async (tx) => {
  const [pSnap, mSnap] = await Promise.all([tx.get(productRef), tx.get(movementRef)]);
  if (!pSnap.exists() || !mSnap.exists()) throw new Error('Produto ou movimentação não encontrado.');

  const p = pSnap.data();
  const m = mSnap.data();

  if (p.codigo !== 'TUB4509NAT') throw new Error('Produto inesperado: ' + p.codigo);
  if (String(p.conversaoId || '') !== '') throw new Error('Abortado: produto passou a ter conversão cadastrada.');
  if (Number(m.quantidade) !== 94) throw new Error('Abortado: quantidade no estoque não é mais 94.');
  if (Number(m.quantidade_compra) !== 60) throw new Error('Abortado: quantidade_compra não é mais 60.');
  if (Math.abs(Number(m.valor_unitario) - 109.05) > 0.000001) throw new Error('Abortado: valor_unitario mudou.');
  if (Math.abs(Number(m.custo_total_entrada) - 6543) > 0.000001) throw new Error('Abortado: custo_total_entrada mudou.');

  before = {
    quantidade: Number(m.quantidade),
    quantidade_compra: Number(m.quantidade_compra),
    valor_unitario: Number(m.valor_unitario),
    custo_total_entrada: Number(m.custo_total_entrada)
  };

  tx.update(movementRef, {
    quantidade: 94,
    quantidade_compra: 94,
    valor_unitario: 98.82,
    custo_total_entrada: 9289.08,
    corrigidoBackendEm: serverTimestamp(),
    corrigidoBackendMotivo: 'Restauracao da entrada original: produto sem conversao; quantidade correta 94 PC a R$ 98,82.'
  });

  tx.update(productRef, {
    valorMedio: 98.82,
    custoMedioRecalculadoEm: new Date().toISOString(),
    custoMedioRecalculadoPorEdicao: true
  });
});

await addDoc(collection(db, 'movimentacoes_edicoes'), {
  movimentacaoId: movementId,
  productId,
  data: serverTimestamp(),
  origem: 'correcao_backend',
  motivo: 'Restaurada entrada original sem conversao: 94 PC a R$ 98,82.',
  antes: before,
  depois: {
    quantidade: 94,
    quantidade_compra: 94,
    valor_unitario: 98.82,
    custo_total_entrada: 9289.08
  }
});

const [pAfter, mAfter] = await Promise.all([getDoc(productRef), getDoc(movementRef)]);
console.log('AFTER_PRODUCT', JSON.stringify(pAfter.data()));
console.log('AFTER_MOVEMENT', JSON.stringify(mAfter.data()));
process.exit(0);
