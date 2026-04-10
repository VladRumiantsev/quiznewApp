import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { setPlayerInfo } from "@/lib/playerStore";
import { Zap, Users, Brain, ArrowRight, Sparkles } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [playerName, setPlayerName] = useState("");
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!playerName.trim() || !topic.trim()) {
      setError("Введи имя и тему");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", "/api/rooms", {
        topic: topic.trim(),
        totalQuestions: questionCount,
        playerName: playerName.trim(),
      });
      const data = await res.json();
      setPlayerInfo(data.player.id, data.room.code);
      setLocation(`/lobby/${data.room.code}`);
    } catch (err: any) {
      setError(err.message || "Ошибка создания");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !joinCode.trim()) {
      setError("Введи имя и код комнаты");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("POST", `/api/rooms/${joinCode.trim().toUpperCase()}/join`, {
        playerName: playerName.trim(),
      });
      const data = await res.json();
      setPlayerInfo(data.player.id, data.room.code);
      setLocation(`/lobby/${data.room.code}`);
    } catch (err: any) {
      setError(err.message || "Ошибка подключения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-chart-2/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Quiz Arena">
              <rect x="2" y="2" width="36" height="36" rx="8" stroke="hsl(var(--primary))" strokeWidth="2.5" />
              <path d="M14 14L20 8L26 14" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 26L20 32L26 26" stroke="hsl(var(--chart-2))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="20" cy="20" r="4" fill="hsl(var(--primary))" />
            </svg>
            <h1 className="text-xl font-bold tracking-tight">Quiz Arena</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Мультиплеер квиз для подготовки к экзаменам
          </p>
        </div>

        {mode === "menu" && (
          <div className="space-y-3 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <Card
              className="p-5 cursor-pointer border-border/60 hover:border-primary/40 transition-all duration-200 group"
              onClick={() => setMode("create")}
              data-testid="button-create"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">Создать комнату</h3>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    AI сгенерирует вопросы по твоей теме
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Card>

            <Card
              className="p-5 cursor-pointer border-border/60 hover:border-primary/40 transition-all duration-200 group"
              onClick={() => setMode("join")}
              data-testid="button-join"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg bg-chart-2/10 flex items-center justify-center group-hover:bg-chart-2/20 transition-colors">
                  <Users className="w-5 h-5 text-chart-2" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">Присоединиться</h3>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Введи код комнаты от друга
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-chart-2 transition-colors" />
              </div>
            </Card>

            {/* Features */}
            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                { icon: Brain, label: "AI вопросы", color: "text-primary" },
                { icon: Zap, label: "В реальном времени", color: "text-chart-3" },
                { icon: Users, label: "До 20 игроков", color: "text-chart-2" },
              ].map((f, i) => (
                <div key={i} className="text-center py-3">
                  <f.icon className={`w-5 h-5 mx-auto mb-1.5 ${f.color}`} />
                  <span className="text-xs text-muted-foreground">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "create" && (
          <Card className="p-6 animate-slide-up border-border/60">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Новая комната
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Твоё имя</label>
                <Input
                  data-testid="input-name"
                  placeholder="Как тебя зовут?"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="h-10"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Тема экзамена</label>
                <Input
                  data-testid="input-topic"
                  placeholder="Например: Анатомия человека"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="h-10"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Количество вопросов</label>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map((n) => (
                    <button
                      key={n}
                      data-testid={`button-count-${n}`}
                      onClick={() => setQuestionCount(n)}
                      className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all duration-150 ${
                        questionCount === n
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-destructive text-xs animate-shake">{error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setMode("menu"); setError(""); }}
                  className="h-10"
                  data-testid="button-back"
                >
                  Назад
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 h-10"
                  data-testid="button-start-create"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Создаю...
                    </span>
                  ) : (
                    "Создать"
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {mode === "join" && (
          <Card className="p-6 animate-slide-up border-border/60">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-chart-2" />
              Войти в комнату
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Твоё имя</label>
                <Input
                  data-testid="input-join-name"
                  placeholder="Как тебя зовут?"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="h-10"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Код комнаты</label>
                <Input
                  data-testid="input-code"
                  placeholder="ABCDE"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="h-10 text-center font-mono tracking-widest text-lg uppercase"
                  maxLength={5}
                />
              </div>

              {error && (
                <p className="text-destructive text-xs animate-shake">{error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setMode("menu"); setError(""); }}
                  className="h-10"
                  data-testid="button-back-join"
                >
                  Назад
                </Button>
                <Button
                  onClick={handleJoin}
                  disabled={loading}
                  className="flex-1 h-10"
                  data-testid="button-join-room"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Подключаюсь...
                    </span>
                  ) : (
                    "Войти"
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
