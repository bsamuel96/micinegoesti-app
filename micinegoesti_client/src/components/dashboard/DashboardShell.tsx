import {
  BookOpen,
  Boxes,
  ChevronLeft,
  ClipboardList,
  House,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Settings,
  Users,
  X
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { User } from "../../api/types";

export type DashboardSection = {
  key: string;
  label: string;
  group: "Operațiuni" | "Catalog" | "Administrare";
};

type DashboardShellProps = {
  sections: DashboardSection[];
  activeSection: string;
  user: User;
  onSectionChange: (key: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

const sectionIcons = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  products: Boxes,
  categories: BookOpen,
  users: Users,
  "delivery-zones": MapPinned,
  settings: Settings
} as const;

const roleLabels: Partial<Record<User["role"], string>> = {
  admin: "Administrator",
  store_manager: "Manager magazin",
  kitchen: "Bucătărie",
  deliverer: "Curier",
  customer: "Client"
};

export function DashboardShell({
  sections,
  activeSection,
  user,
  onSectionChange,
  onLogout,
  children
}: DashboardShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const activeLabel = sections.find((section) => section.key === activeSection)?.label ?? "Panou";

  useEffect(() => {
    if (!navigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("button")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [navigationOpen]);

  function selectSection(key: string) {
    onSectionChange(key);
    setNavigationOpen(false);
  }

  return (
    <div className={`dashboard-shell${user.role === "deliverer" ? " is-deliverer" : ""}`}>
      <a className="dashboard-skip-link" href="#dashboard-content">Sari la conținut</a>
      <header className="dashboard-mobile-header">
        <button
          ref={menuButtonRef}
          className="dashboard-icon-button"
          type="button"
          aria-label="Deschide navigarea"
          aria-controls={drawerId}
          aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
        <div>
          <span>Operațiuni</span>
          <strong>{activeLabel}</strong>
        </div>
        <span className="dashboard-role-chip">{roleLabels[user.role] ?? "Personal"}</span>
      </header>

      {navigationOpen && (
        <button
          className="dashboard-nav-backdrop"
          type="button"
          aria-label="Închide navigarea"
          onClick={() => setNavigationOpen(false)}
        />
      )}

      <aside
        ref={drawerRef}
        id={drawerId}
        className={`dashboard-sidebar${navigationOpen ? " is-open" : ""}`}
        aria-label="Navigare operațională"
        aria-modal={navigationOpen || undefined}
        role={navigationOpen ? "dialog" : undefined}
      >
        <div className="dashboard-brand">
          <img src="/assets/brand/cropped-LogoWebsite.png" alt="Logo Mici de Negoești" />
          <div>
            <strong>Mici de Negoești</strong>
            <small>Panou operațional</small>
          </div>
          <button
            className="dashboard-icon-button dashboard-nav-close"
            type="button"
            aria-label="Închide navigarea"
            onClick={() => setNavigationOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <DashboardNavigation sections={sections} activeSection={activeSection} onSelect={selectSection} />
        <div className="dashboard-account">
          <div>
            <strong>{user.name || user.phone}</strong>
            <span>{roleLabels[user.role] ?? "Personal"}</span>
          </div>
          <a href="/">
            <House aria-hidden="true" size={19} />
            Pagina principală
          </a>
          <button type="button" onClick={onLogout}>
            <LogOut aria-hidden="true" size={19} />
            Ieși din cont
          </button>
        </div>
      </aside>

      <main id="dashboard-content" className="dashboard-main" tabIndex={-1}>
        <header className="dashboard-desktop-header">
          <div>
            <span>Panou operațional</span>
            <h1>{activeLabel}</h1>
          </div>
          <p>{user.name || user.phone} · {roleLabels[user.role] ?? "Personal"}</p>
          <button
            className="dashboard-collapse-button"
            type="button"
            aria-label="Deschide meniul"
            onClick={() => setNavigationOpen(true)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        </header>
        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}

function DashboardNavigation({
  sections,
  activeSection,
  onSelect
}: {
  sections: DashboardSection[];
  activeSection: string;
  onSelect: (key: string) => void;
}) {
  const groups: DashboardSection["group"][] = ["Operațiuni", "Catalog", "Administrare"];

  return (
    <nav className="dashboard-navigation" aria-label="Secțiuni panou">
      {groups.map((group) => {
        const groupSections = sections.filter((section) => section.group === group);
        if (!groupSections.length) return null;
        return (
          <div className="dashboard-nav-group" key={group}>
            <span>{group}</span>
            {groupSections.map((section) => {
              const Icon = sectionIcons[section.key as keyof typeof sectionIcons] ?? LayoutDashboard;
              return (
                <button
                  type="button"
                  key={section.key}
                  className={activeSection === section.key ? "is-active" : ""}
                  aria-current={activeSection === section.key ? "page" : undefined}
                  onClick={() => onSelect(section.key)}
                >
                  <Icon aria-hidden="true" size={20} />
                  {section.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
