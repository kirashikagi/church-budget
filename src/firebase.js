import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCy6qvyrhRxap8A78TDG9MbvdOCPgbOGCM",
  authDomain: "churchbudget-620e2.firebaseapp.com",
  projectId: "churchbudget-620e2",
  storageBucket: "churchbudget-620e2.firebasestorage.app",
  messagingSenderId: "238428969794",
  appId: "1:238428969794:web:59f92b2901882d06b006db"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
