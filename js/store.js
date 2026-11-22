// 資料儲存：本機（IndexedDB）或雲端家庭共享（Firebase Firestore）
import { FIREBASE_CONFIG } from './firebase-config.js';
import { genFamilyCode } from './logic.js';

const SETTINGS_KEY = 'homebook.settings';
export function loadSettings() {
  try { return { me: '', hid: null, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { me: '', hid: null }; }
}
export function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
export const cloudConfigured = () => !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

const clean = (o) => JSON.parse(JSON.stringify(o)); // 去掉 undefined，Firestore 不接受

// ---------- 本機 ----------
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('homebook', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('records', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export class LocalStore {
  mode = 'local';
  map = new Map();
  listeners = new Set();
  async init() {
    this.db = await openDB();
    const all = await new Promise((res, rej) => {
      const q = this.db.transaction('records').objectStore('records').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    all.forEach((r) => this.map.set(r.id, r));
    this.emit();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((f) => f()); }
  all() { return [...this.map.values()]; }
  get(id) { return this.map.get(id); }
  async put(rec) {
    rec = clean(rec);
    this.map.set(rec.id, rec); this.emit();
    await new Promise((res, rej) => {
      const tx = this.db.transaction('records', 'readwrite');
      tx.objectStore('records').put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async purge(id) {
    this.map.delete(id); this.emit();
    await new Promise((res) => {
      const tx = this.db.transaction('records', 'readwrite');
      tx.objectStore('records').delete(id); tx.oncomplete = res; tx.onerror = res;
    });
  }
  async putMany(recs) { for (const r of recs) await this.put(r); }
}

// ---------- 雲端（Firebase） ----------
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
let fbCache = null;
async function firebase() {
  if (fbCache) return fbCache;
  const [appM, authM, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
  ]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  const auth = authM.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch { db = fs.getFirestore(app); }
  const user = await new Promise((res, rej) => {
    const off = authM.onAuthStateChanged(auth, (u) => {
      if (u) { off(); res(u); }
      else authM.signInAnonymously(auth).catch((e) => { off(); rej(e); });
    });
  });
  fbCache = { fs, db, user };
  return fbCache;
}

export async function createFamily(name, me) {
  const { fs, db, user } = await firebase();
  const hid = genFamilyCode();
  await fs.setDoc(fs.doc(db, 'households', hid), { name: name || '我們家', createdAt: Date.now(), createdBy: user.uid });
  await fs.setDoc(fs.doc(db, 'households', hid, 'members', user.uid), { name: me || '', joinedAt: Date.now() });
  return hid;
}

export async function joinFamily(code, me) {
  const { fs, db, user } = await firebase();
  const hid = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3');
  const snap = await fs.getDoc(fs.doc(db, 'households', hid));
  if (!snap.exists()) throw new Error('找不到這個家庭代碼，請確認有沒有打錯');
  await fs.setDoc(fs.doc(db, 'households', hid, 'members', user.uid), { name: me || '', joinedAt: Date.now() });
  return hid;
}

export class CloudStore {
  mode = 'cloud';
  map = new Map();
  listeners = new Set();
  status = 'connecting';
  constructor(hid) { this.hid = hid; }
  async init() {
    const { fs, db } = await firebase();
    this.fs = fs; this.db = db;
    this.col = fs.collection(db, 'households', this.hid, 'records');
    await new Promise((res) => {
      let first = true;
      fs.onSnapshot(this.col, { includeMetadataChanges: true }, (snap) => {
        this.map.clear();
        snap.forEach((d) => this.map.set(d.id, d.data()));
        this.status = snap.metadata.fromCache ? 'offline' : 'online';
        this.pending = snap.metadata.hasPendingWrites;
        this.emit();
        if (first) { first = false; res(); }
      }, (err) => { console.error(err); this.status = 'error'; this.error = err; this.emit(); res(); });
    });
    const s = await fs.getDoc(fs.doc(db, 'households', this.hid)).catch(() => null);
    this.familyName = s?.data()?.name || '';
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((f) => f()); }
  all() { return [...this.map.values()]; }
  get(id) { return this.map.get(id); }
  put(rec) {
    rec = clean(rec);
    this.map.set(rec.id, rec); this.emit();
    // 離線時不等伺服器回應，連線後 Firestore 會自動補上傳
    this.fs.setDoc(this.fs.doc(this.col, rec.id), rec).catch((e) => console.error('寫入失敗', e));
    return Promise.resolve();
  }
  purge(id) {
    this.map.delete(id); this.emit();
    this.fs.deleteDoc(this.fs.doc(this.col, id)).catch((e) => console.error(e));
    return Promise.resolve();
  }
  async putMany(recs) {
    for (let i = 0; i < recs.length; i += 400) {
      const b = this.fs.writeBatch(this.db);
      recs.slice(i, i + 400).forEach((r) => b.set(this.fs.doc(this.col, r.id), clean(r)));
      await b.commit();
    }
  }
}
