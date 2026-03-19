import { registerPlugin } from "@capacitor/core";

export interface KeychainPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const Keychain = registerPlugin<KeychainPlugin>("Keychain");

async function keychainAvailable(): Promise<boolean> {
  try {
    await Keychain.get({ key: "__probe__" });
    return true;
  } catch {
    return false;
  }
}

let _available: boolean | null = null;
async function isAvailable(): Promise<boolean> {
  if (_available === null) _available = await keychainAvailable();
  return _available;
}

export const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    if (await isAvailable()) {
      try {
        const { value } = await Keychain.get({ key });
        return value ?? null;
      } catch {
        return null;
      }
    }
    return localStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (await isAvailable()) {
      try {
        await Keychain.set({ key, value });
        return;
      } catch {}
    }
    localStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (await isAvailable()) {
      try {
        await Keychain.remove({ key });
        return;
      } catch {}
    }
    localStorage.removeItem(key);
  },
};
