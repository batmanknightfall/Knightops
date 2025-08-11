/* Minimal, debuggable crypto helpers using Web Crypto. */
const Crypto = (() => {
  const text = new TextEncoder();
  const untext = new TextDecoder();

  /** PBKDF2 deriveKey → AES-GCM key. */
  async function deriveKey(passphrase, salt) {
    const base = await crypto.subtle.importKey(
      "raw", text.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt","decrypt"]
    );
  }

  async function getKey(passphrase) {
    const salt = await getOrMakeSalt();
    return deriveKey(passphrase, salt);
  }

  async function getOrMakeSalt() {
    let salt = localStorage.getItem("salt");
    if (salt) return Uint8Array.from(atob(salt), c=>c.charCodeAt(0));
    const s = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem("salt", btoa(String.fromCharCode(...s)));
    return s;
  }

  async function encrypt(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, text.encode(plaintext));
    return { iv: btoa(String.fromCharCode(...iv)), ct: btoa(String.fromCharCode(...new Uint8Array(ct))) };
  }

  async function decrypt(key, ivB64, ctB64) {
    const iv = Uint8Array.from(atob(ivB64), c=>c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64), c=>c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return untext.decode(pt);
  }

  return { getKey, encrypt, decrypt };
})();
