import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  IconUsers, IconBriefcase, IconLeaf, IconStats, IconSparkles,
  IconFuture, IconUser, IconMenu, IconClose, IconBot,
} from "./Icons";
import UserProfileModal from "./UserProfileModal";
import { useUserProfile } from "../../lib/userProfile";
import type { ReactNode } from "react";

interface Props {
  topTitle: string;
  topSub?: string;
  topActions?: ReactNode;
  children: ReactNode;
  /**
   * Whether this page renders a left .panel as the first child.
   * When true, AppShell renders a hamburger button on mobile and
   * tracks the panel-open drawer state via a shell-level class.
   */
  hasPanel?: boolean;
  /**
   * Optional AI-dock controls. When provided, AppShell renders a
   * floating "AI" button (FAB) on mobile that toggles the dock.
   */
  aiOpen?: boolean;
  onToggleAI?: () => void;
}

const NAV_ITEMS = [
  { to: "/",         label: "Обществ.",  short: "Город",  Icon: IconUsers },
  { to: "/business", label: "Бизнес",    short: "Бизнес", Icon: IconBriefcase },
  { to: "/eco",      label: "Эко",       short: "Эко",    Icon: IconLeaf },
  { to: "/futures",  label: "Болашақ",   short: "Будущ.", Icon: IconFuture },
  { to: "/stats",    label: "Статист.",  short: "Стат.",  Icon: IconStats },
  { to: "/ai",       label: "AI-отчёт",  short: "AI",     Icon: IconSparkles },
];

export default function AppShell({
  topTitle, topSub, topActions, children,
  hasPanel = true, aiOpen, onToggleAI,
}: Props) {
  const { pathname } = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile] = useUserProfile();
  const [panelOpen, setPanelOpen] = useState(false);

  // Auto-close panel/AI on route change
  useEffect(() => {
    setPanelOpen(false);
  }, [pathname]);

  // Lock body-scroll when a drawer is open on mobile (avoids rubber-banding)
  useEffect(() => {
    const open = panelOpen || aiOpen;
    if (open && typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    return undefined;
  }, [panelOpen, aiOpen]);

  // Close drawers on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (panelOpen) setPanelOpen(false);
        else if (aiOpen && onToggleAI) onToggleAI();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, aiOpen, onToggleAI]);

  const shellClasses = [
    "shell",
    panelOpen ? "panel-open" : "",
    aiOpen ? "ai-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClasses}>
      <aside className="rail">
        <NavLink to="/" className="rail-logo" title="AQYL CITY — домой">
          <img src="/aqyl-logo.png" alt="AQYL CITY" />
        </NavLink>
        <div className="rail-brand">AQYL<br/>CITY</div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", alignItems: "center" }}>
          {NAV_ITEMS.map(({ to, label, Icon }) => {
            const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                className={`rail-item ${isActive ? "active" : ""}`}
                title={label}
              >
                <Icon size={22} />
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="work">
        <header className="topbar">
          <div className="topbar-left">
            {hasPanel && (
              <button
                className="icon-btn mobile-only"
                aria-label="Открыть меню"
                onClick={() => setPanelOpen((o) => !o)}
              >
                {panelOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="topbar-title">{topTitle}</div>
              {topSub && <div className="topbar-sub">{topSub}</div>}
            </div>
          </div>
          <div className="topbar-right">
            {topActions}
            <button
              onClick={() => setProfileOpen(true)}
              className={`pill-btn ${profile.display_name || profile.home_district ? "primary" : ""}`}
              style={{ fontSize: 12 }}
              title={
                profile.display_name
                  ? `Профиль: ${profile.display_name}`
                  : "Создать профиль"
              }
            >
              <IconUser size={14} />
              <span className="desktop-only">
                {profile.display_name
                  ? profile.display_name.split(" ")[0]
                  : "Профиль"}
              </span>
            </button>
          </div>
        </header>
        <div className="work-body">{children}</div>

        {/* Mobile bottom navigation */}
        <nav className="mobile-bottom-nav" aria-label="Основная навигация">
          <div className="mobile-bottom-nav-inner">
            {NAV_ITEMS.map(({ to, short, Icon }) => {
              const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`mobile-nav-item ${isActive ? "active" : ""}`}
                  aria-label={short}
                >
                  <Icon size={22} />
                  <span>{short}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </main>

      {/* Drawer backdrop — closes whichever drawer is open on tap */}
      {(panelOpen || aiOpen) && (
        <div
          className="drawer-backdrop mobile-only"
          onClick={() => {
            if (panelOpen) setPanelOpen(false);
            else if (aiOpen && onToggleAI) onToggleAI();
          }}
        />
      )}

      {/* Floating AI button on mobile (when page exposes onToggleAI) */}
      {onToggleAI && !aiOpen && (
        <button
          className="mobile-fab"
          onClick={onToggleAI}
          aria-label="Открыть AQYL AI"
          title="AQYL AI"
        >
          <IconBot size={22} />
        </button>
      )}

      <UserProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
