// Adicione aqui as suas configurações do Firebase
// NOTA: Este é um exemplo e deve ser substituído pelas suas chaves reais.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Importa as funções do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Exporta a instância do Firestore para ser usada em outros módulos
export { db };

console.log("Firebase inicializado. Certifique-se de que suas credenciais em firebase-config.js estão corretas.");
