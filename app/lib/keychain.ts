import { registerPlugin } from "@capacitor/core";

export interface KeychainPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const Keychain = registerPlugin<KeychainPlugin>("Keychain");

export const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const { value } = await Keychain.get({ key });
      return value ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await Keychain.set({ key, value });
    } catch (e) {
      console.error("[Keychain] setItem failed:", e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await Keychain.remove({ key });
    } catch (e) {
      console.error("[Keychain] removeItem failed:", e);
    }
  },
};
