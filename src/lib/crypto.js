import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.NEXT_PUBLIC_CRYPTO_SECRET || 'nirmala-secure-key-2026';

export const secureStorage = {
  setItem: (key, data) => {
    if (typeof window === 'undefined') return;
    try {
      const jsonString = JSON.stringify(data);
      const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString();
      localStorage.setItem(key, encrypted);
    } catch (error) {
      console.error('Error encrypting local data:', error);
    }
  },

  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
      if (!decryptedString) return null;
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Error decrypting local data:', error);
      return null;
    }
  },

  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  }
};
