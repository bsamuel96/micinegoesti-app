import { CalendarDays, Copy, Plus, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ShiftKey, ShiftSchedule, ShiftTemplate } from "../api/types";
import { ShiftScheduleBoard } from "../components/shift-schedule/ShiftScheduleBoard";
import { ShiftScheduleList } from "../components/shift-schedule/ShiftScheduleList";
import { useAuth } from "../context/AuthContext";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextDays(count: number, startDate = new Date()) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dateOnly(date);
  });
}

export function ShiftSchedulePage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dates, setDates] = useState(() => nextDays(7));
  const [editing, setEditing] = useState<ShiftSchedule | null>(null);
  const canManage = user?.role === "admin" || user?.role === "store_manager";
  const from = dates[0];
  const to = dates[dates.length - 1];

  const me = useQuery({ queryKey: ["shift-handover-me"], queryFn: () => api.shiftHandoverMe() });
  const schedules = useQuery({ queryKey: ["shift-schedule", from, to], queryFn: () => api.shiftSchedule({ from, to }) });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api.users(), enabled: canManage });
  const templates = me.data?.templates ?? [];
  const operationalUsers = users.data?.users.filter((candidate) => candidate.role !== "customer" && candidate.isActive) ?? [];
  const myShiftKey = me.data?.profile?.shiftKey;
  const templateMap = useMemo(() => new Map(templates.map((template) => [template.shiftKey, template])), [templates]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["shift-schedule"] });
    queryClient.invalidateQueries({ queryKey: ["shift-handover-me"] });
  }

  function canConfirm(schedule: ShiftSchedule) {
    if (!user) return false;
    if (schedule.assignedUserId === user.id) return true;
    return Boolean(myShiftKey && schedule.shiftKey === myShiftKey);
  }

  async function saveSchedule(form: HTMLFormElement) {
    const data = new FormData(form);
    const payload = {
      scheduleDate: String(data.get("scheduleDate") || dates[0]),
      shiftKey: data.get("shiftKey") as ShiftKey,
      assignedUserId: String(data.get("assignedUserId") || "") || null,
      managerUserId: String(data.get("managerUserId") || "") || null,
      startTime: String(data.get("startTime") || "") || null,
      endTime: String(data.get("endTime") || "") || null,
      status: String(data.get("status") || "planned") as ShiftSchedule["status"],
      notes: String(data.get("notes") || "") || null
    };
    if (editing) await api.updateShiftSchedule(editing.id, payload);
    else await api.createShiftSchedule(payload);
    setEditing(null);
    form.reset();
    invalidate();
  }

  async function duplicatePreviousWeek() {
    const previousStart = new Date(dates[0]);
    previousStart.setDate(previousStart.getDate() - 7);
    const previousDates = nextDays(7, previousStart);
    const previous = await api.shiftSchedule({ from: previousDates[0], to: previousDates[previousDates.length - 1] });
    for (const schedule of previous.schedules) {
      const sourceDate = new Date(schedule.scheduleDate);
      sourceDate.setDate(sourceDate.getDate() + 7);
      await api.createShiftSchedule({
        ...schedule,
        id: undefined,
        scheduleDate: dateOnly(sourceDate),
        status: "planned"
      });
    }
    invalidate();
  }

  return (
    <section className={embedded ? "shift-page embedded" : "section-shell shift-page"}>
      <div className="shift-page-header">
        <div className="shift-brand-lockup">
          <img src="/assets/brand/cropped-LogoWebsite.png" alt="" />
          <div>
            <span>Program ture</span>
            <h1>Program ture</h1>
            <p>Următoarele 7 zile · {myShiftKey ? templateMap.get(myShiftKey)?.label : "toate turele"}</p>
          </div>
        </div>
        <div className="shift-page-actions">
          <button className="secondary-button" onClick={() => setDates(nextDays(7))}>
            <CalendarDays size={17} />
            Azi
          </button>
          {canManage && (
            <button className="secondary-button" onClick={duplicatePreviousWeek}>
              <Copy size={17} />
              Duplică săptămâna trecută
            </button>
          )}
        </div>
      </div>

      {canManage && (
        <form
          className="schedule-editor"
          onSubmit={(event) => {
            event.preventDefault();
            saveSchedule(event.currentTarget);
          }}
        >
          <h2>{editing ? "Editează tură" : "Adaugă tură"}</h2>
          <input name="scheduleDate" type="date" defaultValue={editing?.scheduleDate.slice(0, 10) ?? dates[0]} required />
          <select name="shiftKey" defaultValue={editing?.shiftKey ?? "shift_1"}>
            {templates.map((template) => (
              <option value={template.shiftKey} key={template.id}>{template.label}</option>
            ))}
          </select>
          <select name="assignedUserId" defaultValue={editing?.assignedUserId ?? ""}>
            <option value="">Fără utilizator</option>
            {operationalUsers.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>{candidate.name || candidate.email || candidate.phone || candidate.role}</option>
            ))}
          </select>
          <input name="startTime" placeholder="09:00" defaultValue={editing?.startTime ?? ""} />
          <input name="endTime" placeholder="17:00" defaultValue={editing?.endTime ?? ""} />
          <select name="status" defaultValue={editing?.status ?? "planned"}>
            <option value="planned">Planificată</option>
            <option value="confirmed">Confirmată</option>
            <option value="completed">Finalizată</option>
            <option value="cancelled">Anulată</option>
          </select>
          <input name="notes" placeholder="Note" defaultValue={editing?.notes ?? ""} />
          <button className="primary-button"><Save size={17} /> Salvează</button>
          {editing && <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Renunță</button>}
        </form>
      )}

      {canManage && (
        <div className="shift-template-editor">
          {templates.map((template) => (
            <TemplateForm template={template} key={template.id} onDone={invalidate} />
          ))}
        </div>
      )}

      <ShiftScheduleBoard
        dates={dates}
        schedules={schedules.data?.schedules ?? []}
        templates={templates}
        users={operationalUsers}
        canManage={canManage}
        canConfirm={canConfirm}
        onConfirm={async (schedule) => {
          await api.updateShiftSchedule(schedule.id, { status: "confirmed" });
          invalidate();
        }}
        onEdit={setEditing}
        onDelete={async (schedule) => {
          await api.deleteShiftSchedule(schedule.id);
          invalidate();
        }}
      />

      <ShiftScheduleList
        schedules={schedules.data?.schedules ?? []}
        templates={templates}
        users={operationalUsers}
        canConfirm={canConfirm}
        onConfirm={async (schedule) => {
          await api.updateShiftSchedule(schedule.id, { status: "confirmed" });
          invalidate();
        }}
      />
    </section>
  );
}

function TemplateForm({ template, onDone }: { template: ShiftTemplate; onDone: () => void }) {
  return (
    <form
      className="shift-template-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api.updateShiftTemplate(template.id, {
          label: String(form.get("label") || template.label),
          defaultStartTime: String(form.get("defaultStartTime") || "") || null,
          defaultEndTime: String(form.get("defaultEndTime") || "") || null,
          color: String(form.get("color") || "") || null,
          isActive: form.get("isActive") === "on"
        });
        onDone();
      }}
    >
      <strong>{template.shiftKey === "shift_1" ? "Tura 1" : "Tura 2"}</strong>
      <input name="label" defaultValue={template.label} />
      <input name="defaultStartTime" defaultValue={template.defaultStartTime ?? ""} placeholder="Start" />
      <input name="defaultEndTime" defaultValue={template.defaultEndTime ?? ""} placeholder="Final" />
      <input name="color" type="color" defaultValue={template.color ?? "#ff4d00"} />
      <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={template.isActive} /> Activă</label>
      <button className="secondary-button"><Plus size={16} /> Salvează</button>
    </form>
  );
}
