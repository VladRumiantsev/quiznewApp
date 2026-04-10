import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { log } from "./index";
import type { QuizQuestion, GameState, PlayerState } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
});

// Room state in memory
interface RoomRuntime {
  roomId: number;
  code: string;
  topic: string;
  status: "waiting" | "playing" | "finished";
  currentQuestion: number;
  totalQuestions: number;
  questions: QuizQuestion[];
  players: Map<number, { ws: WebSocket; player: PlayerState }>;
  answers: Map<number, number>; // playerId -> answerIndex
  timer?: ReturnType<typeof setInterval>;
  timeLeft: number;
  showResults: boolean;
}

const roomRuntimes = new Map<string, RoomRuntime>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function generateQuestions(topic: string, count: number): Promise<QuizQuestion[]> {
  const prompt = `Сгенерируй ${count} вопросов для подготовки к экзамену по теме: "${topic}".

Каждый вопрос должен иметь 4 варианта ответа, один правильный, и короткое объяснение.
Вопросы должны быть разной сложности — от базовых до продвинутых.

Верни ТОЛЬКО валидный JSON массив без markdown, без обёрток:
[
  {
    "question": "Текст вопроса?",
    "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
    "correctIndex": 0,
    "explanation": "Краткое объяснение правильного ответа"
  }
]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.choices[0]?.message?.content || "[]";
    // Try to parse, handling potential markdown wrapping
    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    const questions: QuizQuestion[] = JSON.parse(jsonStr);
    return questions.slice(0, count);
  } catch (error) {
    log(`AI generation error: ${error}`, "ai");
    // Fallback questions
    return Array.from({ length: count }, (_, i) => ({
      question: `Вопрос ${i + 1} по теме "${topic}" (AI временно недоступен)`,
      options: ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
      correctIndex: 0,
      explanation: "AI был недоступен для генерации этого вопроса",
    }));
  }
}

function broadcastToRoom(runtime: RoomRuntime, message: object) {
  const data = JSON.stringify(message);
  for (const [, { ws }] of runtime.players) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function getGameState(runtime: RoomRuntime, forPlayerId?: number): GameState {
  const playerStates: PlayerState[] = [];
  for (const [, { player }] of runtime.players) {
    playerStates.push({
      ...player,
      answered: runtime.answers.has(player.id),
    });
  }
  playerStates.sort((a, b) => b.score - a.score);

  const currentQ = runtime.questions[runtime.currentQuestion];

  return {
    roomCode: runtime.code,
    topic: runtime.topic,
    status: runtime.status,
    currentQuestion: runtime.currentQuestion,
    totalQuestions: runtime.totalQuestions,
    players: playerStates,
    question: runtime.status === "playing" && currentQ
      ? (runtime.showResults
        ? currentQ
        : { ...currentQ, correctIndex: -1, explanation: "" })
      : undefined,
    timeLeft: runtime.timeLeft,
    showResults: runtime.showResults,
    answers: runtime.showResults
      ? Object.fromEntries(runtime.answers)
      : undefined,
  };
}

function startQuestion(runtime: RoomRuntime) {
  runtime.answers = new Map();
  runtime.showResults = false;
  runtime.timeLeft = 20;

  broadcastToRoom(runtime, {
    type: "game_state",
    state: getGameState(runtime),
  });

  if (runtime.timer) clearInterval(runtime.timer);

  runtime.timer = setInterval(() => {
    runtime.timeLeft--;

    broadcastToRoom(runtime, {
      type: "tick",
      timeLeft: runtime.timeLeft,
    });

    if (runtime.timeLeft <= 0) {
      clearInterval(runtime.timer!);
      showQuestionResults(runtime);
    }
  }, 1000);
}

function showQuestionResults(runtime: RoomRuntime) {
  if (runtime.timer) clearInterval(runtime.timer);
  runtime.showResults = true;

  // Calculate scores for unanswered players (they get 0)
  const currentQ = runtime.questions[runtime.currentQuestion];

  // Update streaks for non-answerers
  for (const [, { player }] of runtime.players) {
    if (!runtime.answers.has(player.id)) {
      player.streak = 0;
    }
  }

  broadcastToRoom(runtime, {
    type: "game_state",
    state: getGameState(runtime),
  });

  // After 4 seconds, go to next question or end
  setTimeout(() => {
    runtime.currentQuestion++;
    if (runtime.currentQuestion >= runtime.totalQuestions || runtime.currentQuestion >= runtime.questions.length) {
      endGame(runtime);
    } else {
      startQuestion(runtime);
    }
  }, 4000);
}

async function endGame(runtime: RoomRuntime) {
  runtime.status = "finished";
  if (runtime.timer) clearInterval(runtime.timer);

  // Persist scores
  for (const [, { player }] of runtime.players) {
    await storage.updatePlayer(player.id, { score: player.score, streak: player.streak });
  }
  await storage.updateRoom(runtime.roomId, { status: "finished" });

  broadcastToRoom(runtime, {
    type: "game_state",
    state: getGameState(runtime),
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Create room
  app.post("/api/rooms", async (req, res) => {
    const { topic, totalQuestions, playerName } = req.body;
    if (!topic || !playerName) {
      return res.status(400).json({ message: "Topic and player name required" });
    }

    const code = generateRoomCode();
    const room = await storage.createRoom({
      code,
      topic,
      totalQuestions: totalQuestions || 10,
    });

    const visitorId = req.headers["x-visitor-id"] as string || `visitor-${Date.now()}`;
    const player = await storage.addPlayer({
      name: playerName,
      roomId: room.id,
      visitorId,
      isHost: 1,
    });

    res.json({ room, player });
  });

  // Join room
  app.post("/api/rooms/:code/join", async (req, res) => {
    const { code } = req.params;
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ message: "Player name required" });
    }

    const room = await storage.getRoomByCode(code.toUpperCase());
    if (!room) {
      return res.status(404).json({ message: "Комната не найдена" });
    }
    if (room.status !== "waiting") {
      return res.status(400).json({ message: "Игра уже началась" });
    }

    const visitorId = req.headers["x-visitor-id"] as string || `visitor-${Date.now()}`;

    // Check if player already in room
    const existing = await storage.getPlayerByVisitorAndRoom(visitorId, room.id);
    if (existing) {
      return res.json({ room, player: existing });
    }

    const player = await storage.addPlayer({
      name: playerName,
      roomId: room.id,
      visitorId,
    });

    // Notify via WebSocket if room runtime exists
    const runtime = roomRuntimes.get(room.code);
    if (runtime) {
      broadcastToRoom(runtime, {
        type: "player_joined",
        player: { id: player.id, name: player.name, score: 0, streak: 0, isHost: false },
      });
    }

    res.json({ room, player });
  });

  // Get room
  app.get("/api/rooms/:code", async (req, res) => {
    const room = await storage.getRoomByCode(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ message: "Room not found" });
    const roomPlayers = await storage.getPlayersByRoom(room.id);
    res.json({ room, players: roomPlayers });
  });

  // WebSocket
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname === "/ws" || url.pathname.endsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws, request) => {
    let currentRoom: RoomRuntime | null = null;
    let currentPlayerId: number | null = null;

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "join_room": {
            const { roomCode, playerId } = msg;
            const room = await storage.getRoomByCode(roomCode);
            if (!room) {
              ws.send(JSON.stringify({ type: "error", message: "Комната не найдена" }));
              return;
            }

            const player = await storage.getPlayer(playerId);
            if (!player) {
              ws.send(JSON.stringify({ type: "error", message: "Игрок не найден" }));
              return;
            }

            // Get or create runtime
            let runtime = roomRuntimes.get(roomCode);
            if (!runtime) {
              const roomPlayers = await storage.getPlayersByRoom(room.id);
              runtime = {
                roomId: room.id,
                code: room.code,
                topic: room.topic,
                status: room.status as any,
                currentQuestion: room.currentQuestion,
                totalQuestions: room.totalQuestions,
                questions: JSON.parse(room.questionsJson || "[]"),
                players: new Map(),
                answers: new Map(),
                timeLeft: 20,
                showResults: false,
              };
              // Add existing players
              for (const p of roomPlayers) {
                if (p.id !== playerId) {
                  // These don't have WS yet, we'll add placeholder
                }
              }
              roomRuntimes.set(roomCode, runtime);
            }

            // Add this player to runtime
            const playerState: PlayerState = {
              id: player.id,
              name: player.name,
              score: player.score,
              streak: player.streak,
              isHost: player.isHost === 1,
            };

            runtime.players.set(player.id, { ws, player: playerState });
            currentRoom = runtime;
            currentPlayerId = player.id;

            // Send current game state
            ws.send(JSON.stringify({
              type: "game_state",
              state: getGameState(runtime, player.id),
            }));

            // Notify others
            broadcastToRoom(runtime, {
              type: "player_update",
              players: getGameState(runtime).players,
            });

            break;
          }

          case "start_game": {
            if (!currentRoom || currentPlayerId === null) return;
            const playerEntry = currentRoom.players.get(currentPlayerId);
            if (!playerEntry?.player.isHost) {
              ws.send(JSON.stringify({ type: "error", message: "Только хост может начать игру" }));
              return;
            }

            // Generate questions via AI
            broadcastToRoom(currentRoom, { type: "generating" });

            const questions = await generateQuestions(currentRoom.topic, currentRoom.totalQuestions);
            currentRoom.questions = questions;
            currentRoom.status = "playing";
            currentRoom.currentQuestion = 0;

            await storage.updateRoom(currentRoom.roomId, {
              status: "playing",
              questionsJson: JSON.stringify(questions),
            });

            startQuestion(currentRoom);
            break;
          }

          case "answer": {
            if (!currentRoom || currentPlayerId === null) return;
            if (currentRoom.showResults) return;
            if (currentRoom.answers.has(currentPlayerId)) return;

            const { answerIndex } = msg;
            const currentQ = currentRoom.questions[currentRoom.currentQuestion];
            if (!currentQ) return;

            currentRoom.answers.set(currentPlayerId, answerIndex);

            const playerEntry = currentRoom.players.get(currentPlayerId);
            if (!playerEntry) return;

            const isCorrect = answerIndex === currentQ.correctIndex;
            if (isCorrect) {
              // Bonus based on time left
              const timeBonus = Math.floor(currentRoom.timeLeft * 50);
              const streakBonus = playerEntry.player.streak * 100;
              const basePoints = 1000;
              playerEntry.player.score += basePoints + timeBonus + streakBonus;
              playerEntry.player.streak++;
            } else {
              playerEntry.player.streak = 0;
            }

            // Send confirmation to answerer
            ws.send(JSON.stringify({ type: "answer_confirmed", answerIndex }));

            // Broadcast updated answer count
            broadcastToRoom(currentRoom, {
              type: "answer_count",
              count: currentRoom.answers.size,
              total: currentRoom.players.size,
            });

            // If all answered, show results early
            if (currentRoom.answers.size >= currentRoom.players.size) {
              clearInterval(currentRoom.timer!);
              showQuestionResults(currentRoom);
            }

            break;
          }

          case "play_again": {
            if (!currentRoom || currentPlayerId === null) return;
            const playerEntry = currentRoom.players.get(currentPlayerId);
            if (!playerEntry?.player.isHost) return;

            // Reset
            currentRoom.status = "waiting";
            currentRoom.currentQuestion = 0;
            currentRoom.questions = [];
            currentRoom.answers = new Map();
            currentRoom.showResults = false;
            for (const [, entry] of currentRoom.players) {
              entry.player.score = 0;
              entry.player.streak = 0;
            }

            await storage.updateRoom(currentRoom.roomId, {
              status: "waiting",
              currentQuestion: 0,
              questionsJson: "[]",
            });

            broadcastToRoom(currentRoom, {
              type: "game_state",
              state: getGameState(currentRoom),
            });
            break;
          }
        }
      } catch (err) {
        log(`WS error: ${err}`, "ws");
      }
    });

    ws.on("close", () => {
      if (currentRoom && currentPlayerId !== null) {
        currentRoom.players.delete(currentPlayerId);
        broadcastToRoom(currentRoom, {
          type: "player_update",
          players: getGameState(currentRoom).players,
        });

        // Clean up empty rooms
        if (currentRoom.players.size === 0) {
          if (currentRoom.timer) clearInterval(currentRoom.timer);
          roomRuntimes.delete(currentRoom.code);
        }
      }
    });
  });

  return httpServer;
}
