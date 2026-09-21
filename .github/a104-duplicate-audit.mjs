import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const source = fs.readFileSync('js/firebase-config.js','utf8');
const pick = n => (source.match(new RegExp(n + ':\\s*"([^"]+)"')) || [,''])[1];
const cfg={apiKey:pick('apiKey'),authDomain:pick('authDomain'),projectId:pick('projectId'),storageBucket:pick('storageBucket'),messagingSenderId:pick('messagingSenderId'),appId:pick('appId')};
const app=initializeApp(cfg);
const auth=getAuth(app);
await signInAnonymously(auth);
const token=await auth.currentUser.getIdToken();
const db=getFirestore(app);

const ps=await getDocs(query(collection(db,'produtos'), where('codigo','==','A104NAT')));
console.log('PRODUCT_COUNT',ps.size);
for(const d of ps.docs) console.log('PRODUCT',d.id,JSON.stringify(d.data()));
const productIds=ps.docs.map(d=>d.id);

for(const pid of productIds){
  const body={structuredQuery:{from:[{collectionId:'movimentacoes'}],where:{fieldFilter:{field:{fieldPath:'productId'},op:'EQUAL',value:{stringValue:pid}}}}};
  const res=await fetch('https://firestore.googleapis.com/v1/projects/'+cfg.projectId+'/databases/(default)/documents:runQuery',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const rows=await res.json();
  const docs=rows.filter(x=>x.document).map(x=>({
    id:x.document.name.split('/').pop(),
    createTime:x.document.createTime,
    updateTime:x.document.updateTime,
    fields:x.document.fields
  }));
  console.log('MOVEMENTS_REST',JSON.stringify(docs));

  for(const m of docs){
    const mid=m.id;
    const aq={structuredQuery:{from:[{collectionId:'movimentacoes_edicoes'}],where:{fieldFilter:{field:{fieldPath:'movimentacaoId'},op:'EQUAL',value:{stringValue:mid}}}}};
    const ar=await fetch('https://firestore.googleapis.com/v1/projects/'+cfg.projectId+'/databases/(default)/documents:runQuery',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(aq)
    });
    const aj=await ar.json();
    const audits=aj.filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),createTime:x.document.createTime,updateTime:x.document.updateTime,fields:x.document.fields}));
    if(audits.length) console.log('AUDIT',mid,JSON.stringify(audits));
  }
}
process.exit(0);