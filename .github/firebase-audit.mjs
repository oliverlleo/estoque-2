import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

const source = fs.readFileSync('js/firebase-config.js', 'utf8');
const pick = (name) => {
  const m = source.match(new RegExp(name + ':\\s*"([^"]+)"'));
  return m ? m[1] : '';
};
const config = {
  apiKey: pick('apiKey'),
  authDomain: pick('authDomain'),
  projectId: pick('projectId'),
  storageBucket: pick('storageBucket'),
  messagingSenderId: pick('messagingSenderId'),
  appId: pick('appId')
};
const app = initializeApp(config);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const movementId = 'W68GQhnt2hdyyz25KWc8';
const auditSnap = await getDocs(query(collection(db, 'movimentacoes_edicoes'), where('movimentacaoId', '==', movementId)));
console.log('AUDIT_COUNT', auditSnap.size);
for (const d of auditSnap.docs) console.log('AUDIT_DOC', d.id, JSON.stringify(d.data()));
const mov = await getDoc(doc(db, 'movimentacoes', movementId));
console.log('MOVEMENT', JSON.stringify(mov.data()));

process.exit(0);
