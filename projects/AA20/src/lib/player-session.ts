export function tokenKey(roomCode: string): string { return `friends-table:${roomCode.toUpperCase()}:token`; }
export function savePlayerToken(roomCode: string, token: string): void { localStorage.setItem(tokenKey(roomCode), token); }
export function loadPlayerToken(roomCode: string): string | null { return localStorage.getItem(tokenKey(roomCode)); }
