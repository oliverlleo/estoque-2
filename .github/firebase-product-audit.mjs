import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

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
const p = await getDoc(doc(db,'produtos',productId));
console.log('PRODUCT', JSON.stringify(p.data()));
const snap = await getDocs(query(collection(db,'movimentacoes'), where('productId','==',productId)));
const rows = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>{
 const ta=a.data?.toMillis?.() ?? a.data?.seconds*1000 ?? 0;
 const tb=b.data?.toMillis?.() ?? b.data?.seconds*1000 ?? 0;
 return ta-tb;
});
for (const m of rows) console.log('MOV', JSON.stringify(m));
process.exit(0);
