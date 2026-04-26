import { useEffect, useState } from "react";
import { aiReport } from "../../services/api";
import type { AIReport, Mode } from "../../types";
import { IconClose, IconDownload, IconSparkles } from "../shell/Icons";
import { renderMarkdown } from "../ui/markdown";

interface Props { mode: Mode; open: boolean; onClose: () => void; }

export default function AIReportModal({ mode, open, onClose }: Props) {
  const [report, setReport] = useState<AIReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    aiReport(mode).then(setReport).finally(() => setLoading(false));
  }, [open, mode]);

  if (!open) return null;

  const download = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aqyl-report-${mode}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ai-avatar" style={{ width: 30, height: 30, borderRadius: 8 }}>
              <IconSparkles size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{report?.title ?? "AI-отчёт"}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {report ? `Создано: ${new Date(report.generated_at).toLocaleString("ru-RU")}` : "Генерация..."}
              </div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}><IconClose size={16} /></button>
        </div>
        <div className="modal-body md-content">
          {loading && <div className="loading">Генерируем отчёт...</div>}
          {report && !loading && (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(report.markdown) }} />
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Закрыть</button>
          <button className="btn primary" onClick={download} disabled={!report}>
            <IconDownload size={14} /> Скачать .md
          </button>
        </div>
      </div>
    </div>
  );
}
