import { createContext, useContext } from 'react';
import type { InventoryApi } from './useInventory';

export const InventoryContext = createContext<InventoryApi | null>(null);

export function useApp(): InventoryApi {
  const api = useContext(InventoryContext);
  if (!api) throw new Error('InventoryContext is missing');
  return api;
}
