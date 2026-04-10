const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type MessageHandler = (msg: any) => void;

class GameWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private roomCode: string = "";
  private playerId: number = 0;
  private pendingJoin: boolean = false;

  connect(roomCode: string, playerId: number) {
    // If already connected or connecting to the same room, just re-send join
    if (this.ws && this.roomCode === roomCode && this.playerId === playerId) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Already open — just re-join to get fresh state
        this.send({ type: "join_room", roomCode, playerId });
        return;
      }
      if (this.ws.readyState === WebSocket.CONNECTING) {
        // Still connecting — the onopen handler will send join
        this.pendingJoin = true;
        return;
      }
    }

    this.roomCode = roomCode;
    this.playerId = playerId;
    this.pendingJoin = false;

    if (this.ws) {
      // Remove all internal handlers before closing
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    // Build WebSocket URL
    let wsUrl: string;
    if (API_BASE) {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const basePath = location.pathname.replace(/\/[^/]*$/, "");
      wsUrl = `${proto}//${location.host}${basePath}/${API_BASE}/ws`;
    } else {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${proto}//${location.host}/ws`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.send({ type: "join_room", roomCode: this.roomCode, playerId: this.playerId });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const typeHandlers = this.handlers.get(msg.type);
        if (typeHandlers) {
          for (const handler of typeHandlers) {
            handler(msg);
          }
        }
        const allHandlers = this.handlers.get("*");
        if (allHandlers) {
          for (const handler of allHandlers) {
            handler(msg);
          }
        }
      } catch (err) {
        console.error("WS message parse error:", err);
      }
    };

    this.ws.onclose = () => {
      // Reconnect after 2s if we still have valid room info
      if (this.roomCode && this.playerId) {
        this.reconnectTimer = setTimeout(() => {
          this.pendingJoin = false;
          this.ws = null; // Clear so connect creates a fresh one
          this.connect(this.roomCode, this.playerId);
        }, 2000);
      }
    };

    this.ws.onerror = () => {
      // Will trigger onclose
    };
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: MessageHandler) {
    this.handlers.get(type)?.delete(handler);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.roomCode = "";
    this.playerId = 0;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

export const gameWs = new GameWebSocket();
