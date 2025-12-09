import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Busca as chaves no seu "cofre" do Firebase
async function buscarChaves() {
    try {
        // Pede o arquivo json que você subiu no passo anterior
        const response = await fetch('https://estoque-d3354.web.app/chaves.json');
        
        if (!response.ok) throw new Error("Falha ao buscar chaves no servidor.");
        
        return await response.json();
    } catch (e) {
        console.error("Erro crítico de conexão:", e);
        return null;
    }
}

let db = null;

// Inicia o sistema
try {
    const config = await buscarChaves();
    
    if (config) {
        const app = initializeApp(config);
        db = getFirestore(app);
        console.log("Sistema conectado via Cloudflare -> Firebase.");
    }
} catch (erro) {
    console.error("Falha ao iniciar:", erro);
}

export { db };
