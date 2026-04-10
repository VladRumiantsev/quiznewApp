import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { gameWs } from "@/lib/websocket";
import { getPlayerId, clearPlayerInfo } from "@/lib/playerStore";
import type { GameState } from "@shared/schema";
import {
  CheckCircle2,
  XCircle,
  Flame,
  Trophy,
  Crown,
  Medal,
  Star,
  RotateCcw,
  Home,
  Loader2,
  Zap,
} from "lucide-react";

const OPTION_COLORS = [
  "from-red-500/15 to-red-600/5 border-red-500/20 hover:border-red-500/50",
  "from-blue-500/15 to-blue-600/5 border-blue-500/20 hover:border-blue-500/50",
  "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20 hover:border-emerald-500/50",
  "from-amber-500/15 to-amber-600/5 border-amber-500/20 hover:border-amber-500/50",
];

const OPTION_ICONS = ["A", "B", "C", "D"];

export default function Game() {
  const params = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const pid = getPlayerId() || 0;

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerCount, setAnswerCount] = useState({ count: 0, total: 0 });
  const [scoreAnimation, setScoreAnimation] = useState<number | null>(null);
  const prevScoreRef = useRef<number>(0);
  useEffect(() => {
    if (!params.code || !pid) return;

    const handleGameState = (msg: any) => {
      const state: GameState = msg.state;
      setGameState(state);
      if (!state.showResults) {
        setSelectedAnswer(null);
        setAnswerCount({ count: 0, total: state.players.length });
      }
      setTimeLeft(state.timeLeft || 0);

      // Score animation
      const myPlayer = state.players.find((p) => p.id === pid);
      if (myPlayer && myPlayer.score > prevScoreRef.current && state.showResults) {
        setScoreAnimation(myPlayer.score - prevScoreRef.current);
        setTimeout(() => setScoreAnimation(null), 1500);
      }
      if (myPlayer) prevScoreRef.current = myPlayer.score;

      // If room reset to waiting (play again), go back to lobby
      if (state.status === "waiting") {
        setLocation(`/lobby/${params.code}`);
      }
    };

    const handleTick = (msg: any) => {
      setTimeLeft(msg.timeLeft);
    };

    const handleAnswerConfirmed = (msg: any) => {
      setSelectedAnswer(msg.answerIndex);
    };

    const handleAnswerCount = (msg: any) => {
      setAnswerCount({ count: msg.count, total: msg.total });
    };

    gameWs.on("game_state", handleGameState);
    gameWs.on("tick", handleTick);
    gameWs.on("answer_confirmed", handleAnswerConfirmed);
    gameWs.on("answer_count", handleAnswerCount);

    // Always connect — the WS lib handles reconnection internally
    gameWs.connect(params.code, pid);

    return () => {
      gameWs.off("game_state", handleGameState);
      gameWs.off("tick", handleTick);
      gameWs.off("answer_confirmed", handleAnswerConfirmed);
      gameWs.off("answer_count", handleAnswerCount);
    };
  }, [params.code, pid, setLocation]);

  const submitAnswer = (index: number) => {
    if (selectedAnswer !== null || gameState?.showResults) return;
    gameWs.send({ type: "answer", answerIndex: index });
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // FINISHED STATE
  if (gameState.status === "finished") {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    const isHost = gameState.players.find((p) => p.id === pid)?.isHost;
    const myRank = sortedPlayers.findIndex((p) => p.id === pid) + 1;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Confetti particles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 rounded-sm"
            style={{
              left: `${Math.random() * 100}%`,
              background: `hsl(${Math.random() * 360} 80% 60%)`,
              animation: `confetti-fall ${2 + Math.random() * 3}s linear ${Math.random() * 2}s infinite`,
              top: "-20px",
            }}
          />
        ))}

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-6 animate-bounce-in">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-chart-3" />
            <h2 className="text-xl font-bold">Игра окончена</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {myRank === 1 ? "Поздравляем с победой!" : `Ты на ${myRank} месте`}
            </p>
          </div>

          <div className="space-y-2 mb-6">
            {sortedPlayers.map((player, i) => (
              <Card
                key={player.id}
                className={`p-4 border-border/60 animate-slide-up ${
                  player.id === pid ? "ring-2 ring-primary/30" : ""
                } ${i === 0 ? "bg-chart-3/5 border-chart-3/20" : ""}`}
                style={{ animationDelay: `${i * 0.1}s` }}
                data-testid={`result-player-${player.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 flex items-center justify-center">
                    {i === 0 ? (
                      <Crown className="w-6 h-6 text-chart-3" />
                    ) : i === 1 ? (
                      <Medal className="w-5 h-5 text-muted-foreground" />
                    ) : i === 2 ? (
                      <Medal className="w-5 h-5 text-orange-400" />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: `hsl(${(player.id * 47) % 360} 60% ${30 + (player.id % 3) * 10}%)`,
                      color: "white",
                    }}
                  >
                    {player.name[0].toUpperCase()}
                  </div>
                  <span className="font-medium text-sm flex-1">{player.name}</span>
                  <div className="text-right">
                    <p className="font-bold text-sm">{player.score.toLocaleString()}</p>
                    {player.streak > 0 && (
                      <div className="flex items-center gap-1 text-xs text-orange-400">
                        <Flame className="w-3 h-3" />
                        <span>{player.streak}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                gameWs.disconnect();
                clearPlayerInfo();
                setLocation("/");
              }}
              className="h-11"
              data-testid="button-go-home"
            >
              <Home className="w-4 h-4 mr-2" />
              Домой
            </Button>
            {isHost && (
              <Button
                onClick={() => gameWs.send({ type: "play_again" })}
                className="flex-1 h-11"
                data-testid="button-play-again"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Играть снова
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PLAYING STATE
  const question = gameState.question;
  const myPlayer = gameState.players.find((p) => p.id === pid);
  const timerPercent = (timeLeft / 20) * 100;
  const isUrgent = timeLeft <= 5;

  return (
    <div className="min-h-screen flex flex-col p-4 relative overflow-hidden">
      {/* Score animation */}
      {scoreAnimation !== null && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
          <div className="bg-chart-2 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-xl">
            +{scoreAnimation.toLocaleString()}
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" className="text-xs">
            {gameState.currentQuestion + 1} / {gameState.totalQuestions}
          </Badge>

          <div className="flex items-center gap-2">
            {myPlayer && myPlayer.streak >= 2 && (
              <div className="flex items-center gap-1 text-orange-400 animate-streak-fire">
                <Flame className="w-4 h-4" />
                <span className="text-xs font-bold">{myPlayer.streak}x</span>
              </div>
            )}
            <Badge variant="secondary" className="text-xs font-mono">
              <Star className="w-3 h-3 mr-1" />
              {myPlayer?.score.toLocaleString() || 0}
            </Badge>
          </div>
        </div>

        {/* Timer */}
        <div className="mb-4">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 linear ${
                isUrgent ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-xs text-muted-foreground">
              {answerCount.count}/{answerCount.total} ответили
            </span>
            <span
              className={`text-sm font-mono font-bold ${
                isUrgent ? "text-destructive animate-timer-pulse" : "text-muted-foreground"
              }`}
            >
              {timeLeft}с
            </span>
          </div>
        </div>

        {/* Question */}
        {question && (
          <div className="animate-slide-up">
            <Card className="p-5 mb-4 border-border/60">
              <p className="text-sm font-semibold leading-relaxed">
                {question.question}
              </p>
            </Card>

            {/* Options */}
            <div className="grid grid-cols-1 gap-2.5">
              {question.options.map((option, i) => {
                const isSelected = selectedAnswer === i;
                const isCorrect = gameState.showResults && i === question.correctIndex;
                const isWrong = gameState.showResults && isSelected && i !== question.correctIndex;

                let borderClass = `border bg-gradient-to-r ${OPTION_COLORS[i]}`;
                if (gameState.showResults) {
                  if (isCorrect) {
                    borderClass = "border-2 border-emerald-500 bg-emerald-500/10";
                  } else if (isWrong) {
                    borderClass = "border-2 border-destructive bg-destructive/10 animate-shake";
                  } else {
                    borderClass = "border border-border/40 opacity-50";
                  }
                } else if (isSelected) {
                  borderClass = "border-2 border-primary bg-primary/10";
                }

                return (
                  <button
                    key={i}
                    onClick={() => submitAnswer(i)}
                    disabled={selectedAnswer !== null || gameState.showResults}
                    className={`p-4 rounded-xl text-left transition-all duration-200 flex items-center gap-3 animate-slide-up opacity-0 stagger-${i + 1} ${borderClass} ${
                      !selectedAnswer && !gameState.showResults ? "active:scale-[0.98]" : ""
                    }`}
                    data-testid={`option-${i}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isCorrect
                          ? "bg-emerald-500 text-white"
                          : isWrong
                          ? "bg-destructive text-white"
                          : isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isWrong ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        OPTION_ICONS[i]
                      )}
                    </div>
                    <span className="text-sm">{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {gameState.showResults && question.explanation && (
              <Card className="p-4 mt-3 border-chart-2/20 bg-chart-2/5 animate-slide-up">
                <p className="text-xs text-muted-foreground mb-1">Объяснение</p>
                <p className="text-sm">{question.explanation}</p>
              </Card>
            )}
          </div>
        )}

        {/* Mini Scoreboard */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {[...gameState.players]
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((player, i) => (
                <Badge
                  key={player.id}
                  variant={player.id === pid ? "default" : "secondary"}
                  className={`text-xs transition-all scoreboard-move ${
                    player.answered ? "opacity-100" : "opacity-60"
                  }`}
                >
                  {i === 0 && <Crown className="w-3 h-3 mr-1" />}
                  {player.name}: {player.score.toLocaleString()}
                </Badge>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
