import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-check.js";

async function carregarChaves() {
    try {
        // Pede as chaves para o servidor do Firebase
        const response = await fetch('/__/firebase/init.json');
        if (!response.ok) throw new Error("Erro ao buscar chaves.");
        return await response.json();
    } catch (e) {
        console.error("Erro crítico: Site não está rodando no Firebase Hosting.", e);
        return null;
    }
}

let db = null;

// Inicializa assim que a chave chegar do servidor
(async () => {
    try {
        const config = await carregarChaves();
        if (config) {
            const app = initializeApp(config);
            
            // Ative isso APENAS se já configurou o App Check no painel do Firebase
            // const appCheck = initializeAppCheck(app, {
            //    provider: new ReCaptchaV3Provider('SUA_CHAVE_SITE_KEY_RECAPTCHA'),
            //    isTokenAutoRefreshEnabled: true
            // });

            db = getFirestore(app);
            console.log("Conectado ao projeto:", config.projectId);
        }
    } catch (erro) {
        console.error("Falha ao iniciar:", erro);
    }
})();

export { db };