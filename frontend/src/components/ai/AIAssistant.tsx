import { useEffect, useRef, useState } from "react";
import { aiChat } from "../../services/api";
import type { Mode } from "../../types";
import { IconBot, IconSend, IconClose } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";
import { profileSummary, useUserProfile } from "../../lib/userProfile";

interface Message {
  role: "user" | "bot";
  text: string;
  tools?: Array<{ tool: string; args: Record<string, unknown>; ok: boolean }>;
}

const TOOL_LABELS: Record<string, string> = {
  get_district_stats: "📊 Stats района",
  get_district_eco: "🌿 Eco района",
  run_simulation: "🧪 Симуляция",
  get_business_recommendations: "💼 Рекомендации",
  find_best_locations: "⭐ Лучшие точки",
  get_pollution_sources: "🏭 Источники",
  get_window_advisor: "🪟 Часы дня",
};

interface Props {
  mode: Mode;
  open: boolean;
  onClose: () => void;
  suggestions?: string[];
}

const DEFAULTS: Record<Mode, string[]> = {
  public:   ["Какие районы самые проблемные?", "Где самый большой дефицит школ?", "Где лучше всего с инфраструктурой?"],
  business: ["Где лучше открыть кафе?", "В каком районе самая низкая конкуренция?", "Какой бизнес самый популярный?"],
  eco:      ["Какое качество воздуха сегодня?", "В каком районе больше всего зелени?", "Какие главные экологические проблемы?"],
};

const GREETING: Record<Mode, string> = {
  public: "Привет! Я AQYL — AI-помощник по общественной инфраструктуре Алматы. Спросите про дефициты, районы, нормативы СНиП.",
  business: "Привет! Я AQYL — помогу разобраться в бизнес-ландшафте Алматы. Спросите про конкуренцию, лучшие точки для открытия, плотность категорий.",
  eco: "Привет! Я AQYL — эко-помощник. Расскажу про AQI, смог, озеленение и экологию каждого района.",
};

// Persistent chat history per mode (localStorage)
const HISTORY_KEY = (mode: Mode) => `aqyl.aichat.${mode}.history`;

function loadChatHistory(mode: Mode): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY(mode));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(mode: Mode, messages: Message[]): void {
  try {
    localStorage.setItem(HISTORY_KEY(mode), JSON.stringify(messages.slice(-30)));
  } catch {
    /* quota exceeded — ignore */
  }
}

export default function AIAssistant({ mode, open, onClose, suggestions }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadChatHistory(mode);
    return saved.length > 0 ? saved : [{ role: "bot", text: GREETING[mode] }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [profile] = useUserProfile();

  useEffect(() => {
    const saved = loadChatHistory(mode);
    setMessages(saved.length > 0 ? saved : [{ role: "bot", text: GREETING[mode] }]);
  }, [mode]);

  // Persist whenever messages change
  useEffect(() => {
    saveChatHistory(mode, messages);
  }, [mode, messages]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sugg = suggestions ?? DEFAULTS[mode];

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const history = messages.slice(-10).map((m) => ({
        role: (m.role === "bot" ? "assistant" : "user") as "user" | "assistant",
        content: m.text,
      }));
      const r = await aiChat(mode, q, {
        district_focus: profile.home_district ?? undefined,
        user_profile: profileSummary(profile) ?? undefined,
        history,
      });
      setMessages((m) => [...m, { role: "bot", text: r.answer, tools: r.tool_calls }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Не удалось получить ответ. Проверьте соединение с API." }]);
    } finally { setLoading(false); }
  };

  const clearHistory = () => {
    setMessages([{ role: "bot", text: GREETING[mode] }]);
  };

  return (
    <aside className={`ai-dock ${open ? "" : "collapsed"}`}>
      <div className="ai-head">
        <div className="ai-head-l">
          <div className="ai-avatar"><IconBot size={18} /></div>
          <div>
            <h3>AQYL AI</h3>
            <p>Помощник режима «{mode === "public" ? "Общественный" : mode === "business" ? "Бизнес" : "Экология"}»</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn ghost sm" onClick={clearHistory} title="Очистить историю"
                  style={{ fontSize: 11 }}>↻</button>
          <button className="btn ghost sm" onClick={onClose} title="Скрыть"><IconClose size={16} /></button>
        </div>
      </div>

      <div className="ai-stream" ref={scroller}>
        {messages.map((m, i) =>
          m.role === "bot" ? (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {m.tools && m.tools.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
                  {m.tools.map((t, ti) => (
                    <span
                      key={ti}
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: t.ok ? "rgba(45,212,191,0.12)" : "rgba(239,68,68,0.12)",
                        color: t.ok ? "var(--brand-1)" : "#EF4444",
                        border: `1px solid ${t.ok ? "rgba(45,212,191,0.3)" : "rgba(239,68,68,0.3)"}`,
                        fontWeight: 600,
                      }}
                      title={JSON.stringify(t.args)}
                    >
                      {TOOL_LABELS[t.tool] ?? t.tool}{t.ok ? "" : " ⚠"}
                    </span>
                  ))}
                </div>
              )}
              <div
                className="ai-msg bot"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
              />
            </div>
          ) : (
            <div key={i} className="ai-msg user">{m.text}</div>
          )
        )}
        {loading && <div className="ai-typing"><span></span><span></span><span></span></div>}
      </div>

      {messages.length <= 1 && (
        <div className="ai-suggest">
          {sugg.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <form className="ai-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросите у AQYL AI..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault(); send();
            }
          }}
        />
        <button className="ai-send" type="submit" disabled={!input.trim() || loading}>
          <IconSend size={16} />
        </button>
      </form>
    </aside>
  );
}
