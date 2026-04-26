import { useEffect, useRef, useState } from "react";
import { IconBot, IconSend } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";
import { aiChat } from "../../services/api";
import { profileSummary, useUserProfile } from "../../lib/userProfile";

interface Props {
  districtName: string | null;
  simulatorState?: Record<string, unknown>;
}

interface Msg {
  role: "user" | "bot";
  text: string;
  tools?: Array<{ tool: string; args: Record<string, unknown>; ok: boolean }>;
}

export default function DistrictAIChatCard({
  districtName, simulatorState,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [profile] = useUserProfile();

  // Reset on district change
  useEffect(() => {
    if (!districtName) {
      setMessages([]);
      return;
    }
    setMessages([{
      role: "bot",
      text: `Выбрали **${districtName}**. Спросите меня: «почему у района такая оценка?», «какого типа объектов не хватает?», «сколько нужно школ до A?»`,
    }]);
  }, [districtName]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || !districtName || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const history = messages.slice(-8).map((m) => ({
        role: (m.role === "bot" ? "assistant" : "user") as "user" | "assistant",
        content: m.text,
      }));
      const r = await aiChat("public", q, {
        district_focus: districtName,
        simulator_state: simulatorState,
        user_profile: profileSummary(profile) ?? undefined,
        history,
      });
      setMessages((m) => [...m, { role: "bot", text: r.answer, tools: r.tool_calls }]);
    } catch (e: any) {
      setMessages((m) => [...m, {
        role: "bot",
        text: `Не удалось получить ответ: ${e?.message ?? "сеть"}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!districtName) {
    return (
      <div className="card" style={{ fontSize: 12, color: "var(--muted)" }}>
        <div className="card-title">💬 AI по выбранному району</div>
        Выберите район на карте или в списке — спросите AQYL AI про него.
      </div>
    );
  }

  const suggestions = [
    "Почему такая оценка?",
    "Где самые большие дефициты?",
    "Что добавить до A?",
  ];

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="ai-avatar" style={{ width: 32, height: 32, borderRadius: 10 }}>
          <IconBot size={16} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>AQYL AI · {districtName.replace(" район", "")}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>
            Живые данные района + ваши «добавления» из симулятора.
          </div>
        </div>
      </div>

      <div
        ref={scroller}
        style={{
          display: "flex", flexDirection: "column", gap: 8,
          maxHeight: 280, overflowY: "auto", padding: 2,
        }}
      >
        {messages.map((m, i) =>
          m.role === "bot" ? (
            <div
              key={i}
              style={{
                padding: 10, borderRadius: 8, background: "var(--surface-2)",
                border: "1px solid var(--border)", fontSize: 12, lineHeight: 1.5,
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
            />
          ) : (
            <div key={i} style={{
              padding: 8, borderRadius: 8,
              background: "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(34,211,238,0.08))",
              border: "1px solid rgba(45,212,191,0.3)",
              fontSize: 12, alignSelf: "flex-end", maxWidth: "85%",
            }}>{m.text}</div>
          )
        )}
        {loading && <div className="ai-typing"><span /><span /><span /></div>}
      </div>

      {messages.length <= 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {suggestions.map((s) => (
            <button key={s} className="chip" style={{ fontSize: 10, padding: "3px 8px" }}
                    onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{ display: "flex", gap: 6 }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросите о районе…"
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--surface-2)",
            color: "var(--text, #E5E7EB)", fontSize: 12,
          }}
        />
        <button type="submit" className="pill-btn primary"
                disabled={!input.trim() || loading}>
          <IconSend size={14} />
        </button>
      </form>
    </div>
  );
}
