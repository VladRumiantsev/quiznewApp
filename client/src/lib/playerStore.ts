// Simple in-memory store for player/room info (no localStorage since sandboxed)
let _playerId: number | null = null;
let _roomCode: string | null = null;

export function setPlayerInfo(playerId: number, roomCode: string) {
  _playerId = playerId;
  _roomCode = roomCode;
}

export function getPlayerId(): number | null {
  return _playerId;
}

export function getRoomCode(): string | null {
  return _roomCode;
}

export function clearPlayerInfo() {
  _playerId = null;
  _roomCode = null;
}
