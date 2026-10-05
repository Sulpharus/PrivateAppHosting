import { createContext, useContext } from 'react';
import type { Sdk } from './mininode';
import type { InventoryApi } from './useInventory';

export const InventoryContext = createContext<InventoryApi | null>(null);

export function useApp(): InventoryApi {
  const api = useContext(InventoryContext);
  if (!api) throw new Error('InventoryContext is missing');
  return api;
}

/**
 * The SDK on its own. Pictures need only this, so typing in the search or saving an item does
 * not draw every picture again (the inventory context changes with every edit).
 */
export const SdkContext = createContext<Sdk | null>(null);
export const useSdk = (): Sdk | null => useContext(SdkContext);
