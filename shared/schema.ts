import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = sqliteTable("rooms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  topic: text("topic").notNull(),
  status: text("status").notNull().default("waiting"), // waiting | playing | finished
  currentQuestion: integer("current_question").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(10),
  questionsJson: text("questions_json").notNull().default("[]"),
});

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id").notNull(),
  name: text("name").notNull(),
  visitorId: text("visitor_id").notNull(),
  score: integer("score").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  isHost: integer("is_host").notNull().default(0),
});

export const insertRoomSchema = createInsertSchema(rooms).pick({
  topic: true,
  totalQuestions: true,
});

export const insertPlayerSchema = createInsertSchema(players).pick({
  name: true,
  roomId: true,
  visitorId: true,
});

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface GameState {
  roomCode: string;
  topic: string;
  status: "waiting" | "playing" | "finished";
  currentQuestion: number;
  totalQuestions: number;
  players: PlayerState[];
  question?: QuizQuestion;
  timeLeft?: number;
  answers?: Record<string, number>;
  showResults?: boolean;
}

export interface PlayerState {
  id: number;
  name: string;
  score: number;
  streak: number;
  isHost: boolean;
  answered?: boolean;
}
