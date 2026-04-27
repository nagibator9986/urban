import { useState } from "react";
import AppShell from "../components/shell/AppShell";
import AIReportModal from "../components/ai/AIReportModal";
import { IconBriefcase, IconLeaf, IconSparkles, IconUsers } from "../components/shell/Icons";
import type { Mode } from "../types";

const CARDS: { mode: Mode; title: string; desc: string; Icon: any; grad: string }[] = [
  {
    mode: "public", title: "Общественная инфраструктура",
    desc: "Школы, сады, больницы, покрытие, дефициты, лидеры и рекомендации по СНиП РК.",
    Icon: IconUsers, grad: "linear-gradient(135deg,#2DD4BF,#22D3EE)",
  },
  {
    mode: "business", title: "Бизнес-ландшафт",
    desc: "Распределение категорий, насыщенность районов, свободные ниши, топ точки открытия.",
    Icon: IconBriefcase, grad: "linear-gradient(135deg,#F59E0B,#EF4444)",
  },
  {
    mode: "eco", title: "Экологическая оценка",
    desc: "AQI, PM2.5/PM10, NO₂, SO₂, озеленение, трафик, главные эко-проблемы, прогнозы.",
    Icon: IconLeaf, grad: "linear-gradient(135deg,#A855F7,#EC4899)",
  },
];

export default function AIReportsHub() {
  const [open, setOpen] = useState<Mode | null>(null);

  return (
    <AppShell
      topTitle="AI-отчёты AQYL"
      topSub="Автоматические аналитические сводки по всем режимам. Просмотр в окне + экспорт в Markdown."
      hasPanel={false}
    >
      <div className="stats-page">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {CARDS.map(({ mode, title, desc, Icon, grad }) => (
            <div key={mode} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: grad, color: "#052029",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 24px rgba(45,212,191,0.25)",
              }}>
                <Icon size={26} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
              </div>
              <button className="btn primary" style={{ justifyContent: "center" }} onClick={() => setOpen(mode)}>
                <IconSparkles size={14} /> Сгенерировать отчёт
              </button>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title">Что внутри AI-отчёта</div>
          <ul style={{ marginLeft: 16, color: "var(--text-2)", lineHeight: 1.8 }}>
            <li>Общая оценка города и грейд A/B/C/D/E</li>
            <li>Ключевые дефициты и узкие места</li>
            <li>Ранжирование районов, лидеры и отстающие</li>
            <li>Приоритетные рекомендации (SNIP РК + ВОЗ)</li>
            <li>Экспорт Markdown для презентаций и отчётов акимату</li>
          </ul>
        </div>
      </div>

      <AIReportModal mode={(open ?? "public") as Mode} open={!!open} onClose={() => setOpen(null)} />
    </AppShell>
  );
}
