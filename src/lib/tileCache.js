import { openDB } from 'idb';

const DB_NAME = 'NirmalaTileCacheDB';
const STORE_NAME = 'heatmap_tiles';

export const tileCache = {
  async getDb() {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  },

  async getTile(tileKey) {
    try {
      const db = await this.getDb();
      const record = await db.get(STORE_NAME, tileKey);
      if (!record) return null;
        
      // TTL Check (Cache valid selama 5 menit untuk data telemetri)
      if (Date.now() - record.timestamp > 300000) {
        await db.delete(STORE_NAME, tileKey);
        return null;
      }
      return record.buffer;
    } catch (err) {
      console.error('Failed reading tile cache:', err);
      return null;
    }
  },

  async setTile(tileKey, buffer) {
    try {
      const db = await this.getDb();
      await db.put(
        STORE_NAME,
        { buffer, timestamp: Date.now() },
        tileKey
      );
    } catch (err) {
      console.error('Failed saving tile cache:', err);
    }
  }
};
