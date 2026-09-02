import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { ProxyConfig } from '@/types';

interface ProxyState {
  enabled: boolean;
  host: string;
  port: number;
  isReachable: boolean | null;
  isTesting: boolean;
  isLoading: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (updated: Partial<ProxyConfig>) => Promise<void>;
  testConnection: (targetHost?: string, targetPort?: number) => Promise<boolean>;
  toggleEnabled: () => Promise<void>;
}

let testIdCounter = 0;

export const useProxyStore = create<ProxyState>((set, get) => ({
  enabled: false,
  host: '127.0.0.1',
  port: 7890,
  isReachable: null,
  isTesting: false,
  isLoading: false,

  loadConfig: async () => {
    set({ isLoading: true });
    try {
      const config = await invoke<ProxyConfig>('get_proxy_config');
      set({
        enabled: config.enabled,
        host: config.host || '127.0.0.1',
        port: config.port || 7890,
      });
      // Check reachability on load if enabled
      if (config.enabled) {
        void get().testConnection(config.host || '127.0.0.1', config.port || 7890);
      }
    } catch (e) {
      console.warn('Failed to load proxy config:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  saveConfig: async (updated: Partial<ProxyConfig>) => {
    const current = get();
    const newConfig: ProxyConfig = {
      enabled: updated.enabled ?? current.enabled,
      host: (updated.host ?? current.host).trim() || '127.0.0.1',
      port: updated.port ?? current.port,
    };

    try {
      await invoke('set_proxy_config', { config: newConfig });
      set({
        enabled: newConfig.enabled,
        host: newConfig.host,
        port: newConfig.port,
      });
      if (newConfig.enabled) {
        void get().testConnection(newConfig.host, newConfig.port);
      } else {
        set({ isReachable: null });
      }
    } catch (e) {
      console.error('Failed to save proxy config:', e);
      throw e;
    }
  },

  testConnection: async (targetHost?: string, targetPort?: number) => {
    const host = targetHost ?? get().host;
    const port = targetPort ?? get().port;

    testIdCounter += 1;
    const currentTestId = testIdCounter;

    set({ isTesting: true });
    try {
      const reachable = await invoke<boolean>('test_proxy_connection', {
        host: host.trim() || '127.0.0.1',
        port: Number(port) || 7890,
      });

      // Only update state if this is the most recent test request and proxy is still enabled
      if (currentTestId === testIdCounter && get().enabled) {
        set({ isReachable: reachable });
      }
      return reachable;
    } catch (e) {
      console.warn('Failed to test proxy connection:', e);
      if (currentTestId === testIdCounter && get().enabled) {
        set({ isReachable: false });
      }
      return false;
    } finally {
      if (currentTestId === testIdCounter) {
        set({ isTesting: false });
      }
    }
  },

  toggleEnabled: async () => {
    const current = get();
    await current.saveConfig({ enabled: !current.enabled });
  },
}));

// Load configuration on module initialization
if (typeof window !== 'undefined') {
  void useProxyStore.getState().loadConfig();
}
