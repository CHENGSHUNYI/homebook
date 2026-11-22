// Firebase 網頁設定（這些值本來就會公開給瀏覽器，安全性由 firestore.rules 控制）。
// 清空的話，App 會以「本機模式」運作（資料只存在這支手機，無法和家人共享）。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDfbSzNm679R8y2EffWr2RZYJ0qJuzjbnM',
  authDomain: 'homebook-4c9a0.firebaseapp.com',
  projectId: 'homebook-4c9a0',
  storageBucket: 'homebook-4c9a0.firebasestorage.app',
  messagingSenderId: '103274233554',
  appId: '1:103274233554:web:47e935ac5ad2663aef770b',
};
