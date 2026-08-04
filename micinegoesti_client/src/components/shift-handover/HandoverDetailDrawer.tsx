import { CheckCircle2, MessageCircle, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { ShiftHandoverItem, User } from "../../api/types";
import { HandoverGallery } from "./HandoverGallery";
import { handoverLabels } from "./HandoverBoard";

export function HandoverDetailDrawer({
  item,
  user,
  canManage,
  canDelete,
  onClose,
  onChanged
}: {
  item: ShiftHandoverItem;
  user: User | null;
  canManage: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [comment, setComment] = useState("");
  const [notifyNumber, setNotifyNumber] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualLinks, setManualLinks] = useState<string[]>([]);
  const detail = useQuery({
    queryKey: ["shift-handover-item", item.id],
    queryFn: () => api.shiftHandoverItem(item.id),
    initialData: { item }
  });
  const current = detail.data?.item ?? item;
  const canResolve = canManage || user?.role === "kitchen" || current.createdByUserId === user?.id;

  useEffect(() => {
    detail.refetch();
  }, [item.id]);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    setManualLinks([]);
    try {
      await fn();
      await detail.refetch();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Acțiunea nu a putut fi finalizată.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer handover-drawer" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Închide">
          <X size={20} />
        </button>
        <div className="handover-drawer-head">
          <span>{current.code}</span>
          <h2>{current.title}</h2>
          <p>
            {handoverLabels.shiftLabels[current.sourceShiftKey]} → {current.targetShiftKey ? handoverLabels.shiftLabels[current.targetShiftKey] : "Ambele ture / general"}
          </p>
        </div>

        <div className="handover-detail-badges">
          <span className={`priority-badge ${current.priority}`}>{handoverLabels.priorityLabels[current.priority]}</span>
          <span>{handoverLabels.statusLabels[current.status]}</span>
          <span>{handoverLabels.categoryLabels[current.category]}</span>
          {current.locationLabel && <span>{current.locationLabel}</span>}
        </div>

        {current.description && <p className="handover-description">{current.description}</p>}

        <HandoverGallery attachments={current.attachments} />

        <div className="handover-actions">
          <button className="secondary-button" disabled={busy === "ack"} onClick={() => run("ack", () => api.acknowledgeShiftHandoverItem(current.id))}>
            <CheckCircle2 size={17} />
            Confirmă citirea
          </button>
          <button className="secondary-button" disabled={busy === "progress"} onClick={() => run("progress", () => api.updateShiftHandoverItem(current.id, { status: "in_progress" }))}>
            În lucru
          </button>
          {canResolve && (
            <button className="primary-button" disabled={busy === "resolve"} onClick={() => run("resolve", () => api.resolveShiftHandoverItem(current.id))}>
              Rezolvă
            </button>
          )}
          {canManage && current.status === "resolved" && (
            <button className="secondary-button" disabled={busy === "reopen"} onClick={() => run("reopen", () => api.updateShiftHandoverItem(current.id, { status: "in_progress" }))}>
              <RotateCcw size={17} />
              Redeschide
            </button>
          )}
          {canDelete && (
            <button className="secondary-button danger-button" disabled={busy === "delete"} onClick={() => run("delete", async () => { await api.deleteShiftHandoverItem(current.id); onClose(); })}>
              <Trash2 size={17} />
              Arhivează
            </button>
          )}
        </div>

        <form
          className="handover-notify-form"
          onSubmit={(event) => {
            event.preventDefault();
            run("notify", async () => {
              const response = await api.notifyShiftHandoverItem(current.id, { whatsappNumber: notifyNumber || undefined, subscribers: !notifyNumber });
              const links = response.whatsapp.results.map((result) => result.waMeUrl).filter(Boolean) as string[];
              setManualLinks(links);
              setNotifyNumber("");
            });
          }}
        >
          <label>
            Notifică WhatsApp
            <input value={notifyNumber} onChange={(event) => setNotifyNumber(event.target.value)} placeholder="+40... sau lasă gol pentru abonați" />
          </label>
          <button className="secondary-button" disabled={busy === "notify"}>
            <MessageCircle size={17} />
            Notifică
          </button>
        </form>
        {manualLinks.map((link) => (
          <a className="primary-button" href={link} target="_blank" rel="noreferrer" key={link}>Deschide WhatsApp</a>
        ))}
        {error && <p className="form-error">{error}</p>}

        <section className="handover-comments">
          <h3>Comentarii</h3>
          {current.comments.length ? (
            current.comments.map((entry) => (
              <p key={entry.id}>
                <span>{new Date(entry.createdAt).toLocaleString("ro-RO")}</span>
                {entry.body}
              </p>
            ))
          ) : (
            <p className="admin-empty-note">Nu sunt comentarii încă.</p>
          )}
        </section>

        <form
          className="handover-comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!comment.trim()) return;
            run("comment", async () => {
              await api.commentShiftHandoverItem(current.id, comment);
              setComment("");
            });
          }}
        >
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Adaugă un comentariu" rows={3} />
          <button className="primary-button" disabled={busy === "comment"}>Comentează</button>
        </form>
      </aside>
    </div>
  );
}
