import { Bell, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { ShiftWhatsAppSubscriber } from "../../api/types";

export function HandoverSubscribersPanel({ onChanged }: { onChanged: () => void }) {
  const subscribers = useQuery({ queryKey: ["shift-handover-subscribers"], queryFn: () => api.shiftHandoverSubscribers() });

  async function refresh() {
    await subscribers.refetch();
    onChanged();
  }

  return (
    <section className="handover-subscribers-panel">
      <div className="handover-section-title">
        <span>WhatsApp</span>
        <h2>Abonați predare ture</h2>
      </div>
      <form
        className="handover-subscriber-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api.createShiftHandoverSubscriber({
            userId: null,
            displayName: String(form.get("displayName") || ""),
            whatsappNumber: String(form.get("whatsappNumber") || ""),
            shiftFilter: form.get("shiftFilter") as ShiftWhatsAppSubscriber["shiftFilter"],
            priorityFilter: form.get("priorityFilter") as ShiftWhatsAppSubscriber["priorityFilter"],
            enabled: form.get("enabled") === "on"
          });
          event.currentTarget.reset();
          await refresh();
        }}
      >
        <input name="displayName" placeholder="Nume" required />
        <input name="whatsappNumber" placeholder="+40..." required />
        <select name="shiftFilter" defaultValue="all">
          <option value="all">Toate turele</option>
          <option value="shift_1">Tura 1</option>
          <option value="shift_2">Tura 2</option>
        </select>
        <select name="priorityFilter" defaultValue="high_urgent">
          <option value="all">Toate prioritățile</option>
          <option value="high_urgent">Mare + urgentă</option>
          <option value="urgent_only">Doar urgentă</option>
        </select>
        <label className="checkbox-row"><input name="enabled" type="checkbox" defaultChecked /> Activ</label>
        <button className="primary-button"><Bell size={17} /> Adaugă</button>
      </form>

      <div className="handover-subscriber-list">
        {(subscribers.data?.subscribers ?? []).map((subscriber) => (
          <form
            key={subscriber.id}
            className="handover-subscriber-row"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await api.updateShiftHandoverSubscriber(subscriber.id, {
                displayName: String(form.get("displayName") || ""),
                whatsappNumber: String(form.get("whatsappNumber") || ""),
                shiftFilter: form.get("shiftFilter") as ShiftWhatsAppSubscriber["shiftFilter"],
                priorityFilter: form.get("priorityFilter") as ShiftWhatsAppSubscriber["priorityFilter"],
                enabled: form.get("enabled") === "on"
              });
              await refresh();
            }}
          >
            <input name="displayName" defaultValue={subscriber.displayName} />
            <input name="whatsappNumber" defaultValue={subscriber.whatsappNumber} />
            <select name="shiftFilter" defaultValue={subscriber.shiftFilter}>
              <option value="all">Toate</option>
              <option value="shift_1">Tura 1</option>
              <option value="shift_2">Tura 2</option>
            </select>
            <select name="priorityFilter" defaultValue={subscriber.priorityFilter}>
              <option value="all">Toate</option>
              <option value="high_urgent">Mare + urgentă</option>
              <option value="urgent_only">Urgentă</option>
            </select>
            <label className="checkbox-row"><input name="enabled" type="checkbox" defaultChecked={subscriber.enabled} /> Activ</label>
            <button className="secondary-button">Salvează</button>
            <button
              className="secondary-button danger-button"
              type="button"
              onClick={async () => {
                await api.deleteShiftHandoverSubscriber(subscriber.id);
                await refresh();
              }}
              aria-label="Șterge abonatul"
            >
              <Trash2 size={16} />
            </button>
          </form>
        ))}
        {!subscribers.data?.subscribers.length && <p className="admin-empty-note">Nu există abonați WhatsApp pentru predări.</p>}
      </div>
    </section>
  );
}
