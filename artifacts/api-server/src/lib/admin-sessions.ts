// Shared in-memory admin session store.
// Imported by both admin.ts (to write) and forex.ts (to read for owner routing).
export const adminSessions = new Set<string>();
