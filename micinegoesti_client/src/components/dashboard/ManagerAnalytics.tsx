import { CalendarDays, Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { Order } from "../../api/types";
import { EmptyState, StatusBadge } from "./DashboardPrimitives";

export type DashboardPeriodPreset = "today" | "7days" | "30days" | "all" | "custom";

export type DashboardPeriod = {
  preset: DashboardPeriodPreset;
  start?: string;
  end?: string;
};

export type ManagerDashboardMetrics = {
  totalOrders: number;
  completedOrders: number;
  deliveredOrders: number;
  revenue: number;
  collectedRevenue: number;
  averageOrder: number;
  cancelledOrders: number;
  deliveryOrders: number;
  pickupOrders: number;
  completionRate: number;
  activeOrders: number;
  unpaidOrders: number;
  topItems: Array<[string, number]>;
};

type MetricKey =
  | "totalOrders"
  | "completedOrders"
  | "deliveredOrders"
  | "revenue"
  | "collectedRevenue"
  | "averageOrder"
  | "cancelledOrders";

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery"];
const EXCLUDED_REVENUE_STATUSES = ["cancelled", "failed", "refunded"];
const DASHBOARD_VIEW_KEY = "mdn_manager_dashboard_metrics_v1";
const DEFAULT_VISIBLE_METRICS: MetricKey[] = [
  "totalOrders",
  "completedOrders",
  "deliveredOrders",
  "revenue",
  "collectedRevenue",
  "averageOrder"
];

const periodOptions: Array<{ value: DashboardPeriodPreset; label: string }> = [
  { value: "today", label: "Astăzi" },
  { value: "7days", label: "Ultimele 7 zile" },
  { value: "30days", label: "Ultimele 30 de zile" },
  { value: "all", label: "Toată perioada" },
  { value: "custom", label: "Interval personalizat" }
];

const statusLabels: Record<string, string> = {
  pending: "Plasate",
  confirmed: "Confirmate",
  preparing: "În preparare",
  ready_for_pickup: "Gata de ridicare",
  out_for_delivery: "În livrare",
  completed: "Finalizate",
  cancelled: "Anulate",
  failed: "Eșuate",
  refunded: "Rambursate"
};

function localDayStart(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateInputToLocalDate(value?: string) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const result = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(result.getTime()) ? null : result;
}

function periodBounds(period: DashboardPeriod, now: Date) {
  const tomorrow = localDayStart(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (period.preset === "all") return { start: null, end: null };
  if (period.preset === "custom") {
    const start = dateInputToLocalDate(period.start);
    const end = dateInputToLocalDate(period.end);
    if (end) end.setDate(end.getDate() + 1);
    return { start, end };
  }

  const start = localDayStart(now);
  if (period.preset === "7days") start.setDate(start.getDate() - 6);
  if (period.preset === "30days") start.setDate(start.getDate() - 29);
  return { start, end: tomorrow };
}

export function filterOrdersByDashboardPeriod(orders: Order[], period: DashboardPeriod, now = new Date()) {
  const { start, end } = periodBounds(period, now);
  return orders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    if (start && createdAt < start) return false;
    if (end && createdAt >= end) return false;
    return true;
  });
}

export function buildManagerDashboardMetrics(orders: Order[]): ManagerDashboardMetrics {
  const completed = orders.filter((order) => order.status.code === "completed");
  const revenueOrders = orders.filter((order) => !EXCLUDED_REVENUE_STATUSES.includes(order.status.code));
  const collectedOrders = revenueOrders.filter((order) => order.paymentStatus === "paid");
  const itemCounts = new Map<string, number>();

  for (const order of revenueOrders) {
    for (const item of order.items) {
      itemCounts.set(item.name, (itemCounts.get(item.name) ?? 0) + item.quantity);
    }
  }

  const revenue = revenueOrders.reduce((sum, order) => sum + order.total, 0);
  return {
    totalOrders: orders.length,
    completedOrders: completed.length,
    deliveredOrders: completed.filter((order) => order.orderType === "delivery").length,
    revenue,
    collectedRevenue: collectedOrders.reduce((sum, order) => sum + order.total, 0),
    averageOrder: revenueOrders.length ? revenue / revenueOrders.length : 0,
    cancelledOrders: orders.filter((order) => EXCLUDED_REVENUE_STATUSES.includes(order.status.code)).length,
    deliveryOrders: orders.filter((order) => order.orderType === "delivery").length,
    pickupOrders: orders.filter((order) => order.orderType === "pickup").length,
    completionRate: orders.length ? (completed.length / orders.length) * 100 : 0,
    activeOrders: orders.filter((order) => ACTIVE_STATUSES.includes(order.status.code)).length,
    unpaidOrders: revenueOrders.filter((order) => order.paymentStatus !== "paid").length,
    topItems: [...itemCounts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5)
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatPeriodLabel(period: DashboardPeriod, now: Date) {
  if (period.preset === "all") return "toată perioada disponibilă";
  if (period.preset === "today") return "astăzi";
  if (period.preset === "7days") return "ultimele 7 zile, inclusiv astăzi";
  if (period.preset === "30days") return "ultimele 30 de zile, inclusiv astăzi";

  const { start, end } = periodBounds(period, now);
  const formatter = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
  if (start && end) {
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
    return `${formatter.format(start)} – ${formatter.format(inclusiveEnd)}`;
  }
  if (start) return `începând cu ${formatter.format(start)}`;
  if (end) {
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
    return `până la ${formatter.format(inclusiveEnd)}`;
  }
  return "intervalul personalizat";
}

function readVisibleMetrics() {
  try {
    const stored = JSON.parse(localStorage.getItem(DASHBOARD_VIEW_KEY) ?? "null");
    if (!Array.isArray(stored)) return DEFAULT_VISIBLE_METRICS;
    const valid = stored.filter((value): value is MetricKey =>
      DEFAULT_VISIBLE_METRICS.includes(value) || value === "cancelledOrders"
    );
    return valid.length ? valid : DEFAULT_VISIBLE_METRICS;
  } catch {
    return DEFAULT_VISIBLE_METRICS;
  }
}

export function ManagerAnalytics({ orders }: { orders: Order[] }) {
  const now = new Date();
  const today = formatDateKey(now);
  const [periodPreset, setPeriodPreset] = useState<DashboardPeriodPreset>("today");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [customizing, setCustomizing] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>(readVisibleMetrics);
  const period = useMemo<DashboardPeriod>(
    () => ({ preset: periodPreset, start: customStart, end: customEnd }),
    [customEnd, customStart, periodPreset]
  );
  const invalidCustomPeriod = periodPreset === "custom" && customStart && customEnd && customStart > customEnd;
  const filteredOrders = useMemo(
    () => invalidCustomPeriod ? [] : filterOrdersByDashboardPeriod(orders, period, now),
    [invalidCustomPeriod, orders, period]
  );
  const metrics = useMemo(() => buildManagerDashboardMetrics(filteredOrders), [filteredOrders]);

  const metricOptions: Array<{
    key: MetricKey;
    label: string;
    value: string | number;
    hint: string;
    tone: "neutral" | "brand" | "success" | "warning";
  }> = [
    { key: "totalOrders", label: "Comenzi", value: metrics.totalOrders, hint: "toate comenzile plasate", tone: "brand" },
    { key: "completedOrders", label: "Finalizate", value: metrics.completedOrders, hint: `${metrics.completionRate.toFixed(0)}% din total`, tone: "success" },
    { key: "deliveredOrders", label: "Livrate", value: metrics.deliveredOrders, hint: "comenzi cu livrare finalizată", tone: "success" },
    { key: "revenue", label: "Valoare comenzi", value: formatMoney(metrics.revenue), hint: "fără anulări și rambursări", tone: "brand" },
    { key: "collectedRevenue", label: "Încasat", value: formatMoney(metrics.collectedRevenue), hint: "plăți marcate ca încasate", tone: "success" },
    { key: "averageOrder", label: "Valoare medie", value: formatMoney(metrics.averageOrder), hint: "per comandă validă", tone: "neutral" },
    { key: "cancelledOrders", label: "Anulate / eșuate", value: metrics.cancelledOrders, hint: "inclusiv rambursări", tone: "warning" }
  ];
  const visibleMetricOptions = metricOptions.filter((metric) => visibleMetrics.includes(metric.key));

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredOrders.forEach((order) => counts.set(order.status.code, (counts.get(order.status.code) ?? 0) + 1));
    return [...counts.entries()].sort((first, second) => second[1] - first[1]);
  }, [filteredOrders]);

  const dailyRows = useMemo(() => {
    const rows = new Map<string, { orders: number; completed: number; delivered: number; revenue: number }>();
    for (const order of filteredOrders) {
      const date = new Date(order.createdAt);
      const key = formatDateKey(date);
      const row = rows.get(key) ?? { orders: 0, completed: 0, delivered: 0, revenue: 0 };
      row.orders += 1;
      if (order.status.code === "completed") {
        row.completed += 1;
        if (order.orderType === "delivery") row.delivered += 1;
      }
      if (!EXCLUDED_REVENUE_STATUSES.includes(order.status.code)) row.revenue += order.total;
      rows.set(key, row);
    }
    return [...rows.entries()].sort((first, second) => second[0].localeCompare(first[0]));
  }, [filteredOrders]);

  function toggleMetric(key: MetricKey) {
    setVisibleMetrics((current) => {
      const next = current.includes(key)
        ? current.length === 1 ? current : current.filter((metric) => metric !== key)
        : [...current, key];
      try {
        localStorage.setItem(DASHBOARD_VIEW_KEY, JSON.stringify(next));
      } catch {
        // The customized view still works for this page when storage is unavailable.
      }
      return next;
    });
  }

  return (
    <section className="manager-analytics" aria-labelledby="manager-analytics-title">
      <div className="manager-analytics-toolbar">
        <div>
          <span className="dashboard-eyebrow">Raport</span>
          <h3 id="manager-analytics-title">Performanță pe perioadă</h3>
          <p>
            Date pentru <strong>{formatPeriodLabel(period, now)}</strong> · {filteredOrders.length}{" "}
            {filteredOrders.length === 1 ? "comandă" : "comenzi"}
          </p>
        </div>
        <div className="manager-analytics-actions">
          <label className="dashboard-field manager-period-select">
            <span>Perioadă</span>
            <span className="dashboard-select-control">
              <CalendarDays aria-hidden="true" />
              <select
                value={periodPreset}
                onChange={(event) => setPeriodPreset(event.target.value as DashboardPeriodPreset)}
              >
                {periodOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </span>
          </label>
          <button
            type="button"
            className={customizing ? "secondary-button is-active" : "secondary-button"}
            aria-expanded={customizing}
            aria-controls="manager-dashboard-customization"
            onClick={() => setCustomizing((current) => !current)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Personalizează
          </button>
        </div>
      </div>

      {periodPreset === "custom" && (
        <div className="manager-custom-period">
          <label className="dashboard-field">
            <span>De la</span>
            <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
          </label>
          <label className="dashboard-field">
            <span>Până la</span>
            <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
          </label>
          {invalidCustomPeriod && <p role="alert">Data de început trebuie să fie înaintea datei de sfârșit.</p>}
        </div>
      )}

      {customizing && (
        <div id="manager-dashboard-customization" className="manager-metric-customizer">
          <div>
            <strong>Alege indicatorii afișați</strong>
            <span>Preferința este păstrată pe acest dispozitiv.</span>
          </div>
          <div className="manager-metric-options">
            {metricOptions.map((metric) => (
              <label key={metric.key}>
                <input
                  type="checkbox"
                  checked={visibleMetrics.includes(metric.key)}
                  onChange={() => toggleMetric(metric.key)}
                />
                <span><Check aria-hidden="true" />{metric.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="manager-kpi-grid">
        {visibleMetricOptions.map((metric) => (
          <article className={`manager-kpi-card is-${metric.tone}`} key={metric.key}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </article>
        ))}
      </div>

      <div className="manager-detail-grid">
        <section className="manager-breakdown-card" aria-labelledby="manager-order-breakdown">
          <div className="dashboard-section-heading">
            <div><span>Structură</span><h2 id="manager-order-breakdown">Tip și status</h2></div>
          </div>
          <div className="manager-order-types">
            <div><span>Livrare</span><strong>{metrics.deliveryOrders}</strong></div>
            <div><span>Ridicare</span><strong>{metrics.pickupOrders}</strong></div>
            <div><span>Active acum</span><strong>{metrics.activeOrders}</strong></div>
            <div><span>Neîncasate</span><strong>{metrics.unpaidOrders}</strong></div>
          </div>
          <div className="manager-status-list">
            {statusCounts.map(([status, count]) => (
              <div key={status}>
                <span>{statusLabels[status] ?? status}</span>
                <StatusBadge tone={status === "completed" ? "success" : EXCLUDED_REVENUE_STATUSES.includes(status) ? "danger" : "neutral"}>
                  {count}
                </StatusBadge>
              </div>
            ))}
            {!statusCounts.length && <span className="table-muted-text">Nu există statusuri în această perioadă.</span>}
          </div>
        </section>

        <section className="manager-breakdown-card" aria-labelledby="manager-top-products">
          <div className="dashboard-section-heading">
            <div><span>Produse</span><h2 id="manager-top-products">Cele mai comandate</h2></div>
          </div>
          {metrics.topItems.length ? (
            <ol className="dashboard-ranking">
              {metrics.topItems.map(([name, quantity]) => (
                <li key={name}><span>{name}</span><strong>{quantity} buc.</strong></li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Fără produse" description="Nu există produse în comenzile din perioada selectată." />
          )}
        </section>
      </div>

      <section className="dashboard-table-section manager-daily-performance" aria-labelledby="manager-daily-title">
        <div className="dashboard-section-heading">
          <div><span>Evoluție</span><h2 id="manager-daily-title">Performanță pe zile</h2></div>
          <StatusBadge>{dailyRows.length} {dailyRows.length === 1 ? "zi" : "zile"}</StatusBadge>
        </div>
        {dailyRows.length ? (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table manager-daily-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Comenzi</th>
                  <th scope="col">Finalizate</th>
                  <th scope="col">Livrate</th>
                  <th scope="col">Valoare comenzi</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map(([date, row]) => (
                  <tr key={date}>
                    <td data-label="Data"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}</strong></td>
                    <td data-label="Comenzi">{row.orders}</td>
                    <td data-label="Finalizate">{row.completed}</td>
                    <td data-label="Livrate">{row.delivered}</td>
                    <td data-label="Valoare comenzi"><strong className="product-table-price">{formatMoney(row.revenue)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nu există comenzi" description="Alege o altă perioadă pentru a vedea evoluția comenzilor." />
        )}
      </section>
    </section>
  );
}
