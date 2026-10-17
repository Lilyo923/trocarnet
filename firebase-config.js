/*
  Configuration Firebase de Trocarnet
  ===================================
  Remplace l'objet ci-dessous par celui que Firebase te donne dans
  Paramètres du projet > Général > Tes applications > Configuration du SDK.
  Tant que apiKey commence par "COLLE", la coopération reste désactivée
  et le site marche normalement en mode solo.

  Ces valeurs ne sont pas des mots de passe : elles identifient ton projet.
  La protection des données vient des règles Firestore (firestore.rules).
*/
window.TROCARNET_FIREBASE_CONFIG = {
  apiKey: '// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDeTlK8dpP1DKdKWR1lLUdtx4ysG5TlwzA",
  authDomain: "trocarnet-3376d.firebaseapp.com",
  databaseURL: "https://trocarnet-3376d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "trocarnet-3376d",
  storageBucket: "trocarnet-3376d.firebasestorage.app",
  messagingSenderId: "329541579672",
  appId: "1:329541579672:web:5c8a748dd9ae595e4eb1ed"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
