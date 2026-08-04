import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ShiftHandoverCategory, ShiftHandoverStatus, ShiftKey, ShiftPriority } from "../api/types";
import { HandoverBoard, type HandoverTab, filterItemsForTab, handoverLabels } from "../components/shift-handover/HandoverBoard";
import { HandoverDetailDrawer } from "../components/shift-handover/HandoverDetailDrawer";
import { HandoverForm } from "../components/shift-handover/HandoverForm";
import { HandoverSubscribersPanel } from "../components/shift-handover/HandoverSubscribersPanel";
import { useAuth } from "../context/AuthContext";

export function ShiftHandoverPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<HandoverTab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("item"));
  const [filters, setFilters] = useState({
    priority: "",
    category: "",
    status: "",
    sourceShiftKey: "",
    targetShiftKey: "",
    hasPhotos: ""
  });

  const me = useQuery({ queryKey: ["shift-handover-me"], queryFn: () => api.shiftHandoverMe() });
  const items = useQuery({
    queryKey: ["shift-handover-items", filters],
    queryFn: () => api.shiftHandoverItems(filters),
    refetchInterval: 15000
  });

  const myShiftKey = me.data?.profile?.shiftKey;
  const visibleItems = useMemo(() => filterItemsForTab(items.data?.items ?? [], tab, myShiftKey), [items.data?.items, tab, myShiftKey]);
  const selected = (items.data?.items ?? []).find((item) => item.id === selectedId) ?? visibleItems.find((item) => item.id === selectedId) ?? null;
  const permissions = me.data?.permissions;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["shift-handover-items"] });
    queryClient.invalidateQueries({ queryKey: ["shift-handover-me"] });
  }

  useEffect(() => {
    const itemId = params.get("item");
    if (itemId) setSelectedId(itemId);
  }, [params]);

  return (
    <section className={embedded ? "shift-page embedded" : "section-shell shift-page"}>
      <div className="shift-page-header">
        <div className="shift-brand-lockup">
          <img src="/assets/brand/cropped-LogoWebsite.png" alt="" />
          <div>
            <span>Predare ture</span>
            <h1>Feedback ture</h1>
            <p>Ești în: <strong>{myShiftKey ? handoverLabels.shiftLabels[myShiftKey] : "Tură nealocată"}</strong></p>
          </div>
        </div>
        <div className="shift-page-actions">
          <button className="secondary-button" onClick={() => items.refetch()}>
            <RefreshCw size={17} />
            Actualizează
          </button>
          <button className="primary-button" onClick={() => setShowForm((value) => !value)}>
            <Plus size={18} />
            Adaugă predare
          </button>
        </div>
      </div>

      {showForm && (
        <HandoverForm
          profile={me.data?.profile ?? null}
          templates={me.data?.templates ?? []}
          canManage={Boolean(permissions?.canManage)}
          onCreated={() => {
            setShowForm(false);
            invalidate();
          }}
        />
      )}

      <div className="handover-filter-panel">
        <select value={filters.sourceShiftKey} onChange={(event) => setFilters((current) => ({ ...current, sourceShiftKey: event.target.value }))}>
          <option value="">Shift sursă</option>
          <option value="shift_1">Tura 1</option>
          <option value="shift_2">Tura 2</option>
        </select>
        <select value={filters.targetShiftKey} onChange={(event) => setFilters((current) => ({ ...current, targetShiftKey: event.target.value }))}>
          <option value="">Shift destinație</option>
          <option value="shift_1">Tura 1</option>
          <option value="shift_2">Tura 2</option>
          <option value="general">General</option>
        </select>
        <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value as ShiftPriority | "" }))}>
          <option value="">Prioritate</option>
          <option value="low">Mică</option>
          <option value="normal">Normală</option>
          <option value="high">Mare</option>
          <option value="urgent">Urgentă</option>
        </select>
        <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as ShiftHandoverCategory | "" }))}>
          <option value="">Categorie</option>
          {Object.entries(handoverLabels.categoryLabels).map(([value, label]) => (
            <option value={value} key={value}>{label}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ShiftHandoverStatus | "" }))}>
          <option value="">Status</option>
          {Object.entries(handoverLabels.statusLabels).map(([value, label]) => (
            <option value={value} key={value}>{label}</option>
          ))}
        </select>
        <select value={filters.hasPhotos} onChange={(event) => setFilters((current) => ({ ...current, hasPhotos: event.target.value }))}>
          <option value="">Poze</option>
          <option value="true">Cu poze</option>
        </select>
      </div>

      {items.isLoading ? (
        <p className="admin-empty-note">Se încarcă predările...</p>
      ) : (
        <HandoverBoard
          items={items.data?.items ?? []}
          tab={tab}
          myShiftKey={myShiftKey as ShiftKey | null}
          onTab={setTab}
          onSelect={(item) => setSelectedId(item.id)}
        />
      )}

      {permissions?.canManageSubscribers && <HandoverSubscribersPanel onChanged={invalidate} />}

      {selected && (
        <HandoverDetailDrawer
          item={selected}
          user={user}
          canManage={Boolean(permissions?.canManage)}
          canDelete={Boolean(permissions?.canDelete)}
          onClose={() => setSelectedId(null)}
          onChanged={invalidate}
        />
      )}
    </section>
  );
}
