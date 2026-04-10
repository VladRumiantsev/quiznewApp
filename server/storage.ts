import { type Room, type Player, type InsertRoom, type InsertPlayer, rooms, players } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  createRoom(room: InsertRoom & { code: string }): Promise<Room>;
  getRoom(id: number): Promise<Room | undefined>;
  getRoomByCode(code: string): Promise<Room | undefined>;
  updateRoom(id: number, data: Partial<Room>): Promise<Room | undefined>;
  addPlayer(player: InsertPlayer & { isHost?: number }): Promise<Player>;
  getPlayersByRoom(roomId: number): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayerByVisitorAndRoom(visitorId: string, roomId: number): Promise<Player | undefined>;
  updatePlayer(id: number, data: Partial<Player>): Promise<Player | undefined>;
  removePlayer(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createRoom(room: InsertRoom & { code: string }): Promise<Room> {
    return db.insert(rooms).values(room).returning().get();
  }

  async getRoom(id: number): Promise<Room | undefined> {
    return db.select().from(rooms).where(eq(rooms.id, id)).get();
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    return db.select().from(rooms).where(eq(rooms.code, code)).get();
  }

  async updateRoom(id: number, data: Partial<Room>): Promise<Room | undefined> {
    return db.update(rooms).set(data).where(eq(rooms.id, id)).returning().get();
  }

  async addPlayer(player: InsertPlayer & { isHost?: number }): Promise<Player> {
    return db.insert(players).values({
      ...player,
      isHost: player.isHost ?? 0,
    }).returning().get();
  }

  async getPlayersByRoom(roomId: number): Promise<Player[]> {
    return db.select().from(players).where(eq(players.roomId, roomId)).all();
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    return db.select().from(players).where(eq(players.id, id)).get();
  }

  async getPlayerByVisitorAndRoom(visitorId: string, roomId: number): Promise<Player | undefined> {
    return db.select().from(players).where(
      and(eq(players.visitorId, visitorId), eq(players.roomId, roomId))
    ).get();
  }

  async updatePlayer(id: number, data: Partial<Player>): Promise<Player | undefined> {
    return db.update(players).set(data).where(eq(players.id, id)).returning().get();
  }

  async removePlayer(id: number): Promise<void> {
    db.delete(players).where(eq(players.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
