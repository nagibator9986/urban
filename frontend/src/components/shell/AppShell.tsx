import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  IconUsers, IconBriefcase, IconLeaf, IconStats, IconSparkles,
  IconFuture, IconUser,
} from "./Icons";
import UserProfileModal from "./UserProfileModal";
import { useUserProfile } from "../../lib/userProfile";
import type { ReactNode } from "react";

interface Props {
  topTitle: string;
  topSub?: string;
  topActions?: ReactNode;
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: "/",         label: "Обществ.",  Icon: IconUsers },
  { to: "/business", label: "Бизнес",    Icon: IconBriefcase },
  { to: "/eco",      label: "Эко",       Icon: IconLeaf },
  { to: "/futures",  label: "Болашақ",   Icon: IconFuture },
  { to: "/stats",    label: "Статист.",  Icon: IconStats },
  { to: "/ai",       label: "AI-отчёт",  Icon: IconSparkles },
];

export default function AppShell({ topTitle, topSub, topActions, children }: Props) {
  const { pathname } = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile] = useUserProfile();

  return (
    <div className="shell">
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
            <div>
              <div className="topbar-title">{topTitle}</div>
              {topSub && <div className="topbar-sub">{topSub}</div>}
            </div>
          </div>
          <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
              {profile.display_name
                ? profile.display_name.split(" ")[0]
                : "Профиль"}
            </button>
          </div>
        </header>
        <div className="work-body">{children}</div>
      </main>
      <UserProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
