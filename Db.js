/* Small IndexedDB wrapper with namespaced stores and versioned schema. */
const DB = (() => {
  const DB_NAME = "nightops";
  const DB_VERSION = 1;
  let db;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        d.createObjectStore("notes", { keyPath: "id" }).createIndex("by_updated","updated");
        d.createObjectStore("tasks", { keyPath: "id" }).createIndex("by_updated","updated");
        d.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode="readonly") { return db.transaction(store, mode).objectStore(store); }

  async function put(store, value) {
    return new Promise((res, rej) => tx(store, "readwrite").put(value).onsuccess = () => res());
  }

  async function getAll(store) {
    return new Promise((res, rej) => {
      const out=[]; const cursor = tx(store).openCursor(null, "prev");
      cursor.onsuccess = (e) => {
        const c = e.target.result; if (!c) return res(out);
        out.push(c.value); c.continue();
      };
      cursor.onerror = () => rej(cursor.error);
    });
  }

  async function clearAll() {
    await Promise.all(["notes","tasks","meta"].map(s => new Promise((res,rej)=>{
      const r = tx(s,"readwrite").clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
    })));
  }

  return { open, put, getAll, clearAll };
})();
