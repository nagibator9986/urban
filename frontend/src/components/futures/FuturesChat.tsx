import { useEffect, useRef, useState } from "react";
import { IconBot, IconSend } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";
import { futuresChat } from "../../services/api";
import type { FuturesForecast } from "../../types";

interface Props {
  forecast: FuturesForecast;
}

interface Message {
  role: "user" | "bot";
  text: string;
  engine?: string;
  ts: string;
}

const SUGGESTIONS = [
  "Какой год самый критический?",
  "Что будет со школами к концу горизонта?",
  "Как сильно вырастет нагрузка на поликлиники?",
  "Какие главные риски этого сценария?",
  "Что сильнее всего влияет на AQI?",
  "Сколько нужно детсадов, чтобы закрыть дефицит?",
];

export default function FuturesChat({ forecast }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      ts: new Date().toISOString(),
      text: `Прогноз по сценарию **${forecast.scenario_name}** готов. Спросите меня о нём — я отвечу только по цифрам из этого прогноза.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q, ts: new Date().toISOString() }]);
    setLoading(true);
    try {
      const r = await futuresChat(forecast, q);
      setMessages((m) => [...m, { role: "bot", text: r.answer, engine: r.engine, ts: r.generated_at }]);
    } catch (e: any) {
      setMessages((m) => [...m, {
        role: "bot",
        text: `Не удалось получить ответ: ${e?.message ?? "ошибка сети"}`,
        ts: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="ai-avatar" style={{ width: 38, height: 38, borderRadius: 12 }}>
          <IconBot size={18} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>AQYL Futures Chat</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            Спрашивайте всё о текущем прогнозе — AI отвечает только по его данным.
          </div>
        </div>
      </div>

      <div
        ref={scroller}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxHeight: 460,
          minHeight: 320,
          padding: "4px 2px",
        }}
      >
        {messages.map((m, i) =>
          m.role === "bot" ? (
            <div
              key={i}
              className="ai-msg bot"
              style={{
                padding: 12, borderRadius: 10,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                fontSize: 13, lineHeight: 1.5,
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
            />
          ) : (
            <div
              key={i}
              className="ai-msg user"
              style={{
                padding: 12, borderRadius: 10,
                background: "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(34,211,238,0.08))",
                border: "1px solid rgba(45,212,191,0.3)",
                fontSize: 13, alignSelf: "flex-end", maxWidth: "80%",
              }}
            >
              {m.text}
            </div>
          )
        )}
        {loading && (
          <div className="ai-typing"><span /><span /><span /></div>
        )}
      </div>

      {messages.length <= 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{ display: "flex", gap: 8 }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Задайте вопрос про этот прогноз…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text, #E5E7EB)",
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <button
          type="submit"
          className="pill-btn primary"
          disabled={!input.trim() || loading}
          style={{ alignSelf: "stretch" }}
        >
          <IconSend size={16} />
        </button>
      </form>
    </div>
  );
}
