// Server is the single source of truth. LocalStorage is intentionally not synchronized
// to the database because doing so can overwrite data from another device.
let isOnline = false;

export async function checkBackend(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch("/api/trpc/sync.ping", { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    isOnline = response.ok;
    return isOnline;
  } catch { isOnline = false; return false; }
}
export function getOnlineStatus(): boolean { return isOnline; }
export async function syncAllToBackend(): Promise<void> { /* Deprecated: server is authoritative. */ }
export function quickSync(): void { /* Deprecated: server writes are immediate and transactional. */ }
