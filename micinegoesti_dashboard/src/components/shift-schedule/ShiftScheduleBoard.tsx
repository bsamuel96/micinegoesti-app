import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Fragment } from "react";
import type { ShiftKey, ShiftSchedule, ShiftTemplate, User } from "../../api/types";

const shiftOrder: ShiftKey[] = ["shift_1", "shift_2"];

export function ShiftScheduleBoard({
  dates,
  schedules,
  templates,
  users,
  canManage,
  canConfirm,
  onConfirm,
  onEdit,
  onDelete
}: {
  dates: string[];
  schedules: ShiftSchedule[];
  templates: ShiftTemplate[];
  users: User[];
  canManage: boolean;
  canConfirm: (schedule: ShiftSchedule) => boolean;
  onConfirm: (schedule: ShiftSchedule) => void;
  onEdit: (schedule: ShiftSchedule) => void;
  onDelete: (schedule: ShiftSchedule) => void;
}) {
  const templateMap = new Map(templates.map((template) => [template.shiftKey, template]));
  const userMap = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="shift-schedule-board">
      <div className="schedule-board-grid" style={{ gridTemplateColumns: `150px repeat(${dates.length}, minmax(150px, 1fr))` }}>
        <div className="schedule-board-head">Tură</div>
        {dates.map((date) => (
          <div className="schedule-board-head" key={date}>
            {new Date(date).toLocaleDateString("ro-RO", { weekday: "short", day: "2-digit", month: "2-digit" })}
          </div>
        ))}
        {shiftOrder.map((shiftKey) => (
          <Fragment key={shiftKey}>
            <div className="schedule-shift-label" key={`${shiftKey}-label`}>
              <strong>{templateMap.get(shiftKey)?.label ?? shiftKey}</strong>
              <span>{templateMap.get(shiftKey)?.defaultStartTime ?? "--"} - {templateMap.get(shiftKey)?.defaultEndTime ?? "--"}</span>
            </div>
            {dates.map((date) => {
              const schedule = schedules.find((candidate) => candidate.scheduleDate.slice(0, 10) === date && candidate.shiftKey === shiftKey);
              return (
                <div className="schedule-cell" key={`${shiftKey}-${date}`}>
                  {schedule ? (
                    <article className={`schedule-card status-${schedule.status}`}>
                      <strong>{schedule.startTime || templateMap.get(shiftKey)?.defaultStartTime || "--"} - {schedule.endTime || templateMap.get(shiftKey)?.defaultEndTime || "--"}</strong>
                      <span>{schedule.assignedUserId ? userMap.get(schedule.assignedUserId)?.name || userMap.get(schedule.assignedUserId)?.email || "Personal" : "Neasignată"}</span>
                      {schedule.notes && <small>{schedule.notes}</small>}
                      <em>{schedule.status}</em>
                      <div className="schedule-card-actions">
                        {canConfirm(schedule) && schedule.status === "planned" && (
                          <button className="icon-button" onClick={() => onConfirm(schedule)} aria-label="Confirmă tura">
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button className="icon-button" onClick={() => onEdit(schedule)} aria-label="Editează tura">
                              <Pencil size={16} />
                            </button>
                            <button className="icon-button" onClick={() => onDelete(schedule)} aria-label="Șterge tura">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ) : (
                    <span className="schedule-empty">Liber</span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
