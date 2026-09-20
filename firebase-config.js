// ============================================
// ATRIL DIGITAL - Configuración del Motor
// ACCIÓN: reemplace el objeto firebaseConfig completo
// con el que copió de la consola de Firebase (Paso 1.5).
// Conserve las dos líneas finales (window.MODO_DEMO y window.FIREBASE_CONFIG).
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyAv1TqzogLeY5GyYpnfEMPArGc6wXL-1gQ",
  authDomain: "atril-digital-ceb51.firebaseapp.com",
  projectId: "atril-digital-ceb51",
  storageBucket: "atril-digital-ceb51.appspot.com",
  messagingSenderId: "935896158385",
  appId: "1:935896158385:web:f64751ab5b1e956c1a9290"
};

// No tocar: detecta automáticamente si aún faltan las claves
window.MODO_DEMO = String(firebaseConfig.apiKey).startsWith("PEGUE");
window.FIREBASE_CONFIG = firebaseConfig;
