// Adicione aqui as suas configurações do Firebase
// NOTA: Este é um exemplo e deve ser substituído pelas suas chaves reais.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC3DT4WwCJbeguyZ8myyZ3H0alTJUpn-bE",
  authDomain: "estoque-d3354.firebaseapp.com",
  databaseURL: "https://estoque-d3354-default-rtdb.firebaseio.com",
  projectId: "estoque-d3354",
  storageBucket: "estoque-d3354.firebasestorage.app",
  messagingSenderId: "1051581921795",
  appId: "1:1051581921795:web:5ff083ef333d35c890ec36",
  measurementId: "G-5WQV7SHDZC"
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
