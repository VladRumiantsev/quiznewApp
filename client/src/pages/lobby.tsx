import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { gameWs } from "@/lib/websocket";
import { getPlayerId } from "@/lib/playerStore";
import type { GameState, PlayerState } from "@shared/schema";
import { Copy, Check, Crown, Users, Loader2, Sparkles, Zap } from "lucide-react";

export default function Lobby() {
  const params = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const pid = getPlayerId();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!params.code || !pid) return;

    const handleGameState = (msg: any) => {
      setGameState(msg.state);
      setGenerating(false);
      if (msg.state.status === "playing") {
        setLocation(`/game/${params.code}`);
      }
    };

    const handlePlayerUpdate = (msg: any) => {
      setGameState((prev) =>
        prev ? { ...prev, players: msg.players } : prev
      );
    };

    const handlePlayerJoined = (msg: any) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const exists = prev.players.some((p) => p.id === msg.player.id);
        return {
          ...prev,
          players: exists
            ? prev.players
            : [...prev.players, msg.player],
        };
      });
    };

    const handleGenerating = () => {
      setGenerating(true);
    };

    gameWs.on("game_state", handleGameState);
    gameWs.on("player_update", handlePlayerUpdate);
    gameWs.on("player_joined", handlePlayerJoined);
    gameWs.on("generating", handleGenerating);

    gameWs.connect(params.code, pid);

    return () => {
      // Only remove handlers, don't disconnect — game page will reuse the WS
      gameWs.off("game_state", handleGameState);
      gameWs.off("player_update", handlePlayerUpdate);
      gameWs.off("player_joined", handlePlayerJoined);
      gameWs.off("generating", handleGenerating);
    };
  }, [params.code, pid, setLocation]);

  const copyCode = useCallback(() => {
    if (gameState?.roomCode) {
      navigator.clipboard.writeText(gameState.roomCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [gameState?.roomCode]);

  const isHost = gameState?.players.find((p) => p.id === pid)?.isHost;

  const startGame = () => {
    gameWs.send({ type: "start_game" });
  };

  if (!pid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">Сессия потеряна</p>
          <Button onClick={() => setLocation("/")} variant="outline">На главную</Button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Подключаюсь к комнате...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/5 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/5 w-64 h-64 bg-chart-2/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Room Code */}
        <div className="text-center mb-6 animate-slide-up">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Код комнаты</p>
          <button
            onClick={copyCode}
            className="inline-flex items-center gap-3 px-6 py-3 bg-card border border-border/60 rounded-xl hover:border-primary/30 transition-all group"
            data-testid="button-copy-code"
          >
            <span className="font-mono text-2xl font-bold tracking-[0.3em]">
              {gameState.roomCode}
            </span>
            {copied ? (
              <Check className="w-5 h-5 text-chart-2" />
            ) : (
              <Copy className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Нажми, чтобы скопировать
          </p>
        </div>

        {/* Topic */}
        <Card className="p-4 mb-4 border-border/60 animate-slide-up" style={{ animationDelay: "0.05s" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Тема</p>
              <p className="font-semibold text-sm">{gameState.topic}</p>
            </div>
            <Badge variant="secondary" className="ml-auto text-xs">
              {gameState.totalQuestions} вопросов
            </Badge>
          </div>
        </Card>

        {/* Players */}
        <Card className="p-4 mb-4 border-border/60 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Игроки ({gameState.players.length})
            </p>
          </div>
          <div className="space-y-2">
            {gameState.players.map((player, i) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 animate-slide-in-left"
                style={{ animationDelay: `${i * 0.05}s` }}
                data-testid={`player-${player.id}`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: `hsl(${(player.id * 47) % 360} 60% ${30 + (player.id % 3) * 10}%)`,
                    color: "white",
                  }}
                >
                  {player.name[0].toUpperCase()}
                </div>
                <span className="font-medium text-sm flex-1">{player.name}</span>
                {player.isHost && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Crown className="w-3 h-3" />
                    Хост
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Actions */}
        <div className="animate-slide-up" style={{ animationDelay: "0.15s" }}>
          {generating ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-primary/10 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">AI генерирует вопросы...</span>
              </div>
            </div>
          ) : isHost ? (
            <Button
              onClick={startGame}
              className="w-full h-12 text-sm font-semibold animate-pulse-glow"
              disabled={gameState.players.length < 1}
              data-testid="button-start-game"
            >
              <Zap className="w-4 h-4 mr-2" />
              Начать игру
            </Button>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                Ожидаем, пока хост начнёт игру...
              </p>
              <div className="flex justify-center gap-1 mt-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
