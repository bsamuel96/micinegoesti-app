import { Camera, MessageSquare, Search } from "lucide-react";
import type { ShiftHandoverCategory, ShiftHandoverItem, ShiftHandoverStatus, ShiftKey, ShiftPriority } from "../../api/types";

const statusLabels: Record<ShiftHandoverStatus, string> = {
  new: "Nou",
  seen: "Văzut / preluat",
  in_progress: "În lucru",
  resolved: "Rezolvat",
  archived: "Arhivat"
};

const priorityLabels: Record<ShiftPriority, string> = {
  low: "Mică",
  normal: "Normală",
  high: "Mare",
  urgent: "Urgentă"
};

const categoryLabels: Record<ShiftHandoverCategory, string> = {
  cleaning: "Curățenie",
  stock: "Stoc lipsă",
  equipment: "Echipament",
  customer_issue: "Client",
  food_quality: "Calitate",
  safety: "Siguranță",
  handover: "Predare",
  staff: "Personal",
  other: "Altceva"
};

const shiftLabels: Record<ShiftKey, string> = {
  shift_1: "Tura 1",
  shift_2: "Tura 2"
};

const columns: ShiftHandoverStatus[] = ["new", "seen", "in_progress", "resolved"];

export type HandoverTab = "all" | "from_shift_1" | "from_shift_2" | "for_me" | "urgent" | "resolved";

export function filterItemsForTab(items: ShiftHandoverItem[], tab: HandoverTab, myShiftKey?: ShiftKey | null) {
  switch (tab) {
    case "from_shift_1":
      return items.filter((item) => item.sourceShiftKey === "shift_1");
    case "from_shift_2":
      return items.filter((item) => item.sourceShiftKey === "shift_2");
    case "for_me":
      return myShiftKey ? items.filter((item) => item.targetShiftKey === myShiftKey || !item.targetShiftKey) : items;
    case "urgent":
      return items.filter((item) => item.priority === "urgent" || item.priority === "high");
    case "resolved":
      return items.filter((item) => item.status === "resolved");
    default:
      return items.filter((item) => item.status !== "archived");
  }
}

export function HandoverBoard({
  items,
  tab,
  myShiftKey,
  onTab,
  onSelect
}: {
  items: ShiftHandoverItem[];
  tab: HandoverTab;
  myShiftKey?: ShiftKey | null;
  onTab: (tab: HandoverTab) => void;
  onSelect: (item: ShiftHandoverItem) => void;
}) {
  const visible = filterItemsForTab(items, tab, myShiftKey);

  return (
    <div className="handover-board-wrap">
      <div className="handover-tabs" aria-label="Filtre predare ture">
        {[
          ["all", "Toate"],
          ["from_shift_1", "De la Tura 1"],
          ["from_shift_2", "De la Tura 2"],
          ["for_me", "Pentru tura mea"],
          ["urgent", "Urgente"],
          ["resolved", "Rezolvate"]
        ].map(([key, label]) => (
          <button type="button" className={tab === key ? "active" : ""} key={key} onClick={() => onTab(key as HandoverTab)}>
            {label}
          </button>
        ))}
      </div>

      {!visible.length ? (
        <div className="handover-empty">
          <Search size={22} />
          <p>Nu sunt predări pentru filtrul ales.</p>
        </div>
      ) : (
        <div className="handover-columns">
          {columns.map((status) => {
            const columnItems = visible.filter((item) => item.status === status);
            return (
              <section className="handover-column" key={status}>
                <h3>{statusLabels[status]}</h3>
                {columnItems.length ? columnItems.map((item) => <HandoverCard item={item} key={item.id} onSelect={onSelect} />) : <p className="admin-empty-note">Liber.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HandoverCard({ item, onSelect }: { item: ShiftHandoverItem; onSelect: (item: ShiftHandoverItem) => void }) {
  return (
    <article className={`handover-card priority-${item.priority}`}>
      <button type="button" onClick={() => onSelect(item)}>
        <span className="handover-code">{item.code}</span>
        <strong>{item.title}</strong>
        {item.description && <small>{item.description.slice(0, 120)}{item.description.length > 120 ? "..." : ""}</small>}
        <span className="handover-meta">
          {shiftLabels[item.sourceShiftKey]} → {item.targetShiftKey ? shiftLabels[item.targetShiftKey] : "General"}
        </span>
        <span className="handover-meta">{categoryLabels[item.category]}{item.locationLabel ? ` · ${item.locationLabel}` : ""}</span>
        <span className="handover-card-footer">
          <span className={`priority-badge ${item.priority}`}>{priorityLabels[item.priority]}</span>
          <span>{statusLabels[item.status]}</span>
          <span><Camera size={14} /> {item.photoCount}</span>
          <span><MessageSquare size={14} /> {item.commentCount}</span>
        </span>
        <time>{new Date(item.createdAt).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
      </button>
    </article>
  );
}

export const handoverLabels = {
  statusLabels,
  priorityLabels,
  categoryLabels,
  shiftLabels
};
