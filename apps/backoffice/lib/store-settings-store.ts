const KEY = 'molho.backoffice.store-id';

export function getSavedStoreId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY) ?? '';
}

export function saveStoreId(storeId: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = storeId.trim();
  if (trimmed) window.localStorage.setItem(KEY, trimmed);
  else window.localStorage.removeItem(KEY);
}
