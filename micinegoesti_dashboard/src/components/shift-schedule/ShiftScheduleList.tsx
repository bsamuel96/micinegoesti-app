import { CheckCircle2 } from "lucide-react";
import type { ShiftSchedule, ShiftTemplate, User } from "../../api/types";

const statusLabels: Record<ShiftSchedule["status"], string> = {
  planned: "Planificată",
  confirmed: "Confirmată",
  completed: "Finalizată",
  cancelled: "Anulată"
};

export function ShiftScheduleList({
  schedules,
  templates,
  users,
  canConfirm,
  onConfirm
}: {
  schedules: ShiftSchedule[];
  templates: ShiftTemplate[];
  users: User[];
  canConfirm: (schedule: ShiftSchedule) => boolean;
  onConfirm: (schedule: ShiftSchedule) => void;
}) {
  const templateMap = new Map(templates.map((template) => [template.shiftKey, template]));
  const userMap = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="shift-schedule-list">
      {schedules.map((schedule) => (
        <article className={`schedule-list-card status-${schedule.status}`} key={schedule.id}>
          <div>
            <span>{new Date(schedule.scheduleDate).toLocaleDateString("ro-RO", { weekday: "long", day: "2-digit", month: "short" })}</span>
            <h3>{templateMap.get(schedule.shiftKey)?.label ?? schedule.shiftKey}</h3>
          </div>
          <p>{schedule.startTime || templateMap.get(schedule.shiftKey)?.defaultStartTime || "--"} - {schedule.endTime || templateMap.get(schedule.shiftKey)?.defaultEndTime || "--"}</p>
          <p>{schedule.assignedUserId ? userMap.get(schedule.assignedUserId)?.name || userMap.get(schedule.assignedUserId)?.email || "Personal asignat" : "Neasignată"}</p>
          {schedule.notes && <small>{schedule.notes}</small>}
          <strong>{statusLabels[schedule.status]}</strong>
          {canConfirm(schedule) && schedule.status === "planned" && (
            <button className="primary-button" onClick={() => onConfirm(schedule)}>
              <CheckCircle2 size={17} />
              Confirmă
            </button>
          )}
        </article>
      ))}
      {!schedules.length && <p className="admin-empty-note">Nu sunt ture planificate în intervalul ales.</p>}
    </div>
  );
}
