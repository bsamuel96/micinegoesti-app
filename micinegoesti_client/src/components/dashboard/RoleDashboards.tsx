import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LocateFixed,
  MapPinned,
  MessageCircle,
  Navigation,
  PackageCheck,
  Phone,
  ReceiptText,
  RefreshCw,
  Truck,
  WalletCards,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type { Order, User } from "../../api/types";
import { deliveryDistanceKm, sortDeliveriesByDistance, type GeoCoordinates } from "../../lib/deliveryRoute";
import { LiveDeliveryMap } from "../LiveDeliveryMap";
import { DashboardPanelHeader, EmptyState, StatusBadge } from "./DashboardPrimitives";
import { ManagerAnalytics, buildManagerDashboardMetrics } from "./ManagerAnalytics";

const activeStatuses = ["pending", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery"];

export function buildDashboardMetrics(orders: Order[]) {
  const todayKey = new Date().toDateString();
  const today = orders.filter((order) => new Date(order.createdAt).toDateString() === todayKey);
  const metrics = buildManagerDashboardMetrics(today);
  return {
    todayOrders: today.length,
    activeOrders: orders.filter((order) => activeStatuses.includes(order.status.code)).length,
    revenue: metrics.revenue,
    unpaid: orders.filter((order) => order.paymentStatus !== "paid" && !["cancelled", "failed"].includes(order.status.code)).length,
    topItems: metrics.topItems.slice(0, 4)
  };
}

export function ManagerDashboard({
  orders,
  onSelect
}: {
  orders: Order[];
  users?: User[];
  onSelect: (order: Order) => void;
}) {
  const pending = orders.filter((order) => order.status.code === "pending").slice(0, 5);
  const deliveryQueue = orders.filter((order) => order.orderType === "delivery" && order.status.code === "out_for_delivery").slice(0, 5);

  return (
    <div className="role-dashboard">
      <DashboardPanelHeader
        eyebrow="Operațiuni"
        title="Privire de ansamblu"
        description="Analizează comenzile, livrările și încasările pe orice perioadă, apoi urmărește operațiunile active."
      />
      <ManagerAnalytics orders={orders} />
      <div className="manager-order-flow">
        <OrderQueueTable
          title="Comenzi noi"
          orders={pending}
          empty="Nu sunt comenzi noi în așteptarea bucătăriei."
          onSelect={onSelect}
        />
        <OrderQueueTable title="Trimise curierului" orders={deliveryQueue} empty="Comenzile trimise curierului vor apărea aici." onSelect={onSelect} />
      </div>
    </div>
  );
}

export function KitchenDashboard({ orders, onSelect }: { orders: Order[]; onSelect: (order: Order) => void }) {
  const queryClient = useQueryClient();
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertSetupMessage, setAlertSetupMessage] = useState("");
  const [latestArrival, setLatestArrival] = useState<Order | null>(null);
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const seenPendingIds = useRef(new Set<number>());
  const waiting = useMemo(() => orders.filter((order) => order.status.code === "pending"), [orders]);
  const preparing = useMemo(
    () => orders.filter((order) => ["confirmed", "preparing"].includes(order.status.code)),
    [orders]
  );
  const ready = useMemo(
    () => orders.filter((order) => ["ready_for_pickup", "out_for_delivery"].includes(order.status.code)),
    [orders]
  );
  const mutation = useMutation({
    mutationFn: async ({ order, action }: { order: Order; action: "confirm" | "complete" }) => {
      if (action === "confirm") {
        const response = await api.confirmKitchenOrder(order.id);
        return { ...response, action };
      }
      const response = await api.completeKitchenOrder(order.id);
      return { ...response, action, customerNotification: null };
    },
    onMutate: () => setActionNotice(null),
    onSuccess: async (response, variables) => {
      if (variables.action === "confirm") {
        const notification = response.customerNotification;
        setActionNotice({
          tone: notification?.status === "failed" ? "warning" : "success",
          message: notification?.message || `Comanda #${variables.order.id} a fost confirmată.`
        });
      } else if (response.order.orderType === "delivery") {
        setActionNotice({
          tone: "success",
          message: `Comanda #${variables.order.id} a fost predată curierului ${
            response.order.assignedDeliverer?.name || response.order.assignedDeliverer?.phone || "asignat"
          }.`
        });
      } else {
        setActionNotice({
          tone: "success",
          message: `Comanda #${variables.order.id} este gata de ridicare.`
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    }
  });

  useEffect(() => {
    const unseen = waiting.filter((order) => !seenPendingIds.current.has(order.id));
    waiting.forEach((order) => seenPendingIds.current.add(order.id));
    if (!unseen.length) return;

    const newest = unseen[0];
    setLatestArrival(newest);
    if (alertsEnabled) announceKitchenOrder(newest);
  }, [alertsEnabled, waiting]);

  const toggleAlerts = async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false);
      setAlertSetupMessage("Alertele sonore sunt oprite.");
      return;
    }

    let notificationPermission: NotificationPermission | "unsupported" = "unsupported";
    if ("Notification" in window) {
      notificationPermission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    }
    playKitchenAlertTone();
    setAlertsEnabled(true);
    setAlertSetupMessage(
      notificationPermission === "denied"
        ? "Sunetul este activ. Notificările de sistem sunt blocate în setările browserului."
        : notificationPermission === "granted"
          ? "Sunetul și notificările de sistem sunt active."
          : "Alertele sonore sunt active."
    );
  };

  const activeOrderId = mutation.isPending ? mutation.variables?.order.id : null;

  return (
    <div className="role-dashboard kitchen-dashboard">
      <DashboardPanelHeader
        eyebrow="Bucătărie"
        title="Comenzi în bucătărie"
        description="Confirmă comenzile noi, pregătește-le și predă-le către ridicare sau livrare."
        actions={
          <button
            className={alertsEnabled ? "secondary-button kitchen-alert-toggle is-enabled" : "secondary-button kitchen-alert-toggle"}
            type="button"
            aria-pressed={alertsEnabled}
            onClick={toggleAlerts}
          >
            {alertsEnabled ? <BellRing aria-hidden="true" /> : <BellOff aria-hidden="true" />}
            {alertsEnabled ? "Alerte active" : "Activează alertele"}
          </button>
        }
      />
      <div className="dashboard-live-region" aria-live="polite">{alertSetupMessage}</div>
      {waiting.length > 0 && (
        <section className="kitchen-arrival-alert" role="alert" aria-live="assertive">
          <span className="kitchen-arrival-icon"><Bell aria-hidden="true" /></span>
          <div>
            <strong>{waiting.length === 1 ? "Comandă nouă în așteptare" : `${waiting.length} comenzi noi în așteptare`}</strong>
            <p>
              {latestArrival
                ? `Cea mai nouă este comanda #${latestArrival.id}. Confirm-o pentru a anunța clientul.`
                : "Confirmă comenzile pentru a anunța clienții."}
            </p>
          </div>
        </section>
      )}
      <DashboardStatsTable rows={[
        { label: "De confirmat", value: waiting.length, tone: waiting.length ? "warning" : "neutral" },
        { label: "În preparare", value: preparing.length, tone: "brand" },
        { label: "Gata / plecate", value: ready.length, tone: "success" }
      ]} />

      <div className="kitchen-workflow-grid">
        <KitchenOrderStage
          eyebrow="Pasul 1"
          title="Comenzi noi"
          tone="warning"
          orders={waiting}
          onSelect={onSelect}
          empty="Nu sunt comenzi noi de confirmat."
          actionLabel="Confirmă comanda"
          activeOrderId={activeOrderId}
          onAction={(order) => mutation.mutate({ order, action: "confirm" })}
        />
        <KitchenOrderStage
          eyebrow="Pasul 2"
          title="În preparare"
          tone="brand"
          orders={preparing}
          onSelect={onSelect}
          empty="Nicio comandă în preparare."
          actionLabel="Marchează gata"
          activeOrderId={activeOrderId}
          onAction={(order) => mutation.mutate({ order, action: "complete" })}
        />
      </div>

      <KitchenOrderStage
        eyebrow="Pasul 3"
        title="Gata și predate"
        tone="success"
        orders={ready.slice(0, 5)}
        onSelect={onSelect}
        empty="Încă nu a ieșit nicio comandă din bucătărie."
      />

      <div
        className={`kitchen-action-notice${actionNotice ? ` is-${actionNotice.tone}` : ""}`}
        role={mutation.error ? "alert" : "status"}
        aria-live={mutation.error ? "assertive" : "polite"}
      >
        {mutation.error
          ? `Operațiunea a eșuat: ${mutation.error.message}`
          : actionNotice?.message || ""}
      </div>
    </div>
  );
}

function KitchenOrderStage({
  eyebrow,
  title,
  tone,
  orders,
  empty,
  onSelect,
  actionLabel,
  activeOrderId,
  onAction
}: {
  eyebrow: string;
  title: string;
  tone: "warning" | "brand" | "success";
  orders: Order[];
  empty: string;
  onSelect: (order: Order) => void;
  actionLabel?: string;
  activeOrderId?: number | null;
  onAction?: (order: Order) => void;
}) {
  const StageIcon = tone === "warning" ? CircleAlert : tone === "brand" ? Clock3 : PackageCheck;

  return (
    <section className={`kitchen-order-stage is-${tone}`} aria-labelledby={`kitchen-stage-${tone}`}>
      <div className="dashboard-section-heading kitchen-stage-heading">
        <div>
          <span>{eyebrow}</span>
          <h2 id={`kitchen-stage-${tone}`}>{title}</h2>
        </div>
        <StatusBadge tone={tone}>{orders.length}</StatusBadge>
      </div>

      {orders.length ? (
        <div className="kitchen-order-cards">
          {orders.map((order) => {
            const isActive = activeOrderId === order.id;
            return (
              <article className="kitchen-order-card" key={order.id}>
                <header>
                  <span className={`kitchen-order-stage-icon is-${tone}`}><StageIcon aria-hidden="true" /></span>
                  <button className="table-link-button" type="button" onClick={() => onSelect(order)}>
                    <strong>Comanda #{order.id}</strong>
                    <small>{relativeTime(order.createdAt)}</small>
                  </button>
                  <StatusBadge tone={order.orderType === "delivery" ? "brand" : "neutral"}>
                    {order.orderType === "delivery" ? "Livrare" : "Ridicare"}
                  </StatusBadge>
                </header>

                <div className="kitchen-order-customer">
                  <strong>{order.contactName}</strong>
                  <span>{order.address || order.deliveryLabel}</span>
                </div>

                <ul className="kitchen-order-items">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.quantity}×</strong>
                      <span>{item.name}</span>
                    </li>
                  ))}
                </ul>

                {order.notes && (
                  <p className="kitchen-order-note">
                    <CircleAlert aria-hidden="true" />
                    <span><strong>Observații:</strong> {order.notes}</span>
                  </p>
                )}

                {onAction && actionLabel ? (
                  <button
                    className="primary-button kitchen-order-action"
                    type="button"
                    disabled={activeOrderId != null}
                    onClick={() => onAction(order)}
                  >
                    {tone === "warning" ? <CheckCircle2 aria-hidden="true" /> : <PackageCheck aria-hidden="true" />}
                    {isActive ? "Se salvează…" : actionLabel}
                  </button>
                ) : (
                  <div className="kitchen-order-handoff">
                    {order.orderType === "delivery" ? <Truck aria-hidden="true" /> : <PackageCheck aria-hidden="true" />}
                    <span>
                      {order.orderType === "delivery"
                        ? `Curier: ${order.assignedDeliverer?.name || order.assignedDeliverer?.phone || "neasignat"}`
                        : "Așteaptă ridicarea clientului"}
                    </span>
                  </div>
                )}

                <button className="secondary-button kitchen-order-details" type="button" onClick={() => onSelect(order)}>
                  Vezi detalii
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Totul este în regulă" description={empty} />
      )}
    </section>
  );
}

export function DriverDashboard({
  orders,
  driverName,
  onRefresh,
  refreshing
}: {
  orders: Order[];
  driverName: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const queryClient = useQueryClient();
  const [workflow, setWorkflow] = useState<{ orderId: number; stage: DriverStage } | null>(null);
  const [paidOrderIds, setPaidOrderIds] = useState<Set<number>>(() => new Set());
  const active = useMemo(
    () => orders.filter((order) => order.orderType === "delivery" && order.status.code === "out_for_delivery"),
    [orders]
  );
  const persistedFocus = active.find((order) => order.courierArrivedAt) ?? active.find((order) => order.deliveryStartedAt) ?? null;
  const fallbackOrder = active.find((order) => order.id === workflow?.orderId) ?? persistedFocus ?? active[0] ?? null;
  const location = useCourierLocation(fallbackOrder?.id ?? null);
  const sortedActive = useMemo(
    () => sortDeliveriesByDistance(active, location.coordinates),
    [active, location.coordinates?.lat, location.coordinates?.lng]
  );
  const current = workflow
    ? sortedActive.find((order) => order.id === workflow.orderId) ?? sortedActive[0] ?? null
    : persistedFocus ?? sortedActive[0] ?? null;
  const stage: DriverStage = workflow && workflow.orderId === current?.id
    ? workflow.stage
    : current?.courierArrivedAt
      ? "arrived"
      : current?.deliveryStartedAt
        ? "en_route"
        : "details";
  const currentDistanceKm = current?.mapPin && location.coordinates
    ? deliveryDistanceKm(location.coordinates, current.mapPin)
    : current?.deliveryTracking?.distanceKm ?? null;
  const isPaid = Boolean(current && (current.paymentStatus === "paid" || paidOrderIds.has(current.id)));

  useEffect(() => {
    if (workflow && !active.some((order) => order.id === workflow.orderId)) setWorkflow(null);
  }, [active, workflow]);

  const paymentMutation = useMutation({
    mutationFn: (order: Order) => api.markPaid(order.id),
    onSuccess: async (_response, order) => {
      setPaidOrderIds((currentIds) => new Set(currentIds).add(order.id));
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    }
  });
  const stageMutation = useMutation({
    mutationFn: ({ order, stage: nextStage }: { order: Order; stage: Exclude<DriverStage, "details"> }) =>
      api.updateCourierDeliveryStage(order.id, nextStage),
    onSuccess: async (_response, variables) => {
      setWorkflow({ orderId: variables.order.id, stage: variables.stage });
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    }
  });
  const deliveryMutation = useMutation({
    mutationFn: ({ order, status }: { order: Order; status: "completed" | "failed" }) =>
      api.updateOrderStatus(order.id, status),
    onSuccess: async () => {
      setWorkflow(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    }
  });
  const actionError = stageMutation.error ?? paymentMutation.error ?? deliveryMutation.error;

  return (
    <div className="role-dashboard driver-dashboard">
      <header className="driver-focus-header">
        <div>
          <span>{driverName}</span>
          <strong>{current ? `Comanda #${current.id} · cea mai apropiată` : "Traseul este liber"}</strong>
        </div>
        <div className={`driver-location-chip is-${location.status}`}>
          <LocateFixed aria-hidden="true" />
          <span>{locationLabel(location.status)}</span>
        </div>
        <button className="dashboard-icon-button" type="button" aria-label="Actualizează comenzile" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : undefined} />
        </button>
      </header>

      {current ? (
        <DriverActiveDeliveryFlow
          order={current}
          stage={stage}
          courierLocation={location.coordinates}
          distanceKm={currentDistanceKm}
          locationAccuracy={location.accuracyMeters}
          isPaid={isPaid}
          pendingStage={stageMutation.isPending}
          pendingPayment={paymentMutation.isPending}
          pendingDelivery={deliveryMutation.isPending}
          onStart={() => stageMutation.mutate({ order: current, stage: "en_route" })}
          onArrive={() => stageMutation.mutate({ order: current, stage: "arrived" })}
          onMarkPaid={() => paymentMutation.mutate(current)}
          onComplete={() => deliveryMutation.mutate({ order: current, status: "completed" })}
          onFail={() => deliveryMutation.mutate({ order: current, status: "failed" })}
        />
      ) : (
        <EmptyState
          title="Nu ai livrări active"
          description="Comenzile noi care îți sunt asignate vor apărea automat aici."
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      <footer className="driver-focus-footer">
        <span>{Math.max(0, active.length - 1)} {active.length - 1 === 1 ? "comandă urmează" : "comenzi urmează"}</span>
        <strong>Următoarea oprire se recalculează automat după finalizare.</strong>
      </footer>
      <div className="dashboard-live-region" role={actionError ? "alert" : "status"} aria-live="polite">
        {actionError ? `Operațiunea a eșuat: ${actionError.message}` : location.syncError}
      </div>
    </div>
  );
}

type DriverStage = "details" | "en_route" | "arrived";

type CourierLocationState = {
  coordinates: GeoCoordinates | null;
  accuracyMeters: number | null;
  status: "locating" | "active" | "denied" | "unavailable";
  syncError: string;
};

function useCourierLocation(activeOrderId: number | null): CourierLocationState {
  const [state, setState] = useState<CourierLocationState>({
    coordinates: null,
    accuracyMeters: null,
    status: "locating",
    syncError: ""
  });
  const lastSentAtRef = useRef(0);
  const lastOrderIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((current) => ({ ...current, status: "unavailable" }));
      return;
    }

    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        const coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
        setState((current) => ({
          ...current,
          coordinates,
          accuracyMeters: position.coords.accuracy,
          status: "active"
        }));

        const now = Date.now();
        if (now - lastSentAtRef.current < 8_000 && lastOrderIdRef.current === activeOrderId) return;
        lastSentAtRef.current = now;
        lastOrderIdRef.current = activeOrderId;
        void api.updateCourierLocation({
          ...coordinates,
          accuracyMeters: position.coords.accuracy,
          heading: position.coords.heading,
          speedMps: position.coords.speed,
          activeOrderId
        }).then(
          () => setState((current) => ({ ...current, syncError: "" })),
          () => setState((current) => ({ ...current, syncError: "Poziția este activă local, dar nu s-a putut sincroniza cu clientul." }))
        );
      },
      (error) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"
        }));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeOrderId]);

  return state;
}

function locationLabel(status: CourierLocationState["status"]) {
  if (status === "active") return "Locație live";
  if (status === "denied") return "Locație blocată";
  if (status === "unavailable") return "GPS indisponibil";
  return "Caut poziția";
}

type DashboardStat = {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "brand" | "warning" | "success";
};

function DashboardStatsTable({ rows }: { rows: DashboardStat[] }) {
  return (
    <div className="admin-data-table-wrap">
      <table className="admin-data-table dashboard-summary-table">
        <thead>
          <tr>
            {rows.map((row) => <th scope="col" key={row.label}>{row.label}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            {rows.map((row) => (
              <td data-label={row.label} key={row.label}>
                <strong className={`dashboard-summary-value is-${row.tone ?? "neutral"}`}>{row.value}</strong>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OrderQueueTable({
  title,
  orders,
  empty,
  onSelect,
  renderActions
}: {
  title: string;
  orders: Order[];
  empty: string;
  onSelect: (order: Order) => void;
  renderActions?: (order: Order) => ReactNode;
}) {
  return (
    <section className="dashboard-table-section">
      <div className="dashboard-section-heading">
        <div><span>Comenzi</span><h2>{title}</h2></div>
        <StatusBadge>{orders.length}</StatusBadge>
      </div>
      {orders.length ? (
        <div className="admin-data-table-wrap">
          <table className="admin-data-table dashboard-orders-table">
            <thead>
              <tr>
                <th scope="col">Comandă</th>
                <th scope="col">Client</th>
                <th scope="col">Livrare</th>
                <th scope="col">Produse</th>
                <th scope="col">Status</th>
                <th scope="col">Total</th>
                <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td data-label="Comandă">
                    <button type="button" className="table-link-button" onClick={() => onSelect(order)}>
                      <strong>#{order.id}</strong>
                      <small>{relativeTime(order.createdAt)}</small>
                    </button>
                  </td>
                  <td data-label="Client">
                    <div className="table-identity">
                      <strong>{order.contactName}</strong>
                      <small>{order.phone}</small>
                    </div>
                  </td>
                  <td data-label="Livrare">
                    <div className="table-identity">
                      <strong>{order.orderType === "delivery" ? "Livrare" : "Ridicare"}</strong>
                      <small>{order.address || order.deliveryLabel}</small>
                    </div>
                  </td>
                  <td data-label="Produse"><span className="table-muted-text">{orderItemsSummary(order)}</span></td>
                  <td data-label="Status"><StatusBadge tone="brand">{order.status.label}</StatusBadge></td>
                  <td data-label="Total"><strong className="product-table-price">{order.total.toFixed(2)} lei</strong></td>
                  <td className="admin-data-table-actions">
                    <div className="table-action-group">
                      {renderActions?.(order) ?? <button className="secondary-button" type="button" onClick={() => onSelect(order)}>Detalii</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Totul este în regulă" description={empty} />}
    </section>
  );
}

function DriverActiveDeliveryFlow({
  order,
  stage,
  courierLocation,
  distanceKm,
  locationAccuracy,
  isPaid,
  pendingStage,
  pendingPayment,
  pendingDelivery,
  onStart,
  onArrive,
  onMarkPaid,
  onComplete,
  onFail
}: {
  order: Order;
  stage: DriverStage;
  courierLocation: GeoCoordinates | null;
  distanceKm: number | null;
  locationAccuracy: number | null;
  isPaid: boolean;
  pendingStage: boolean;
  pendingPayment: boolean;
  pendingDelivery: boolean;
  onStart: () => void;
  onArrive: () => void;
  onMarkPaid: () => void;
  onComplete: () => void;
  onFail: () => void;
}) {
  const whatsappUrl = customerWhatsAppUrl(order);
  const [confirmFailure, setConfirmFailure] = useState(false);
  const stageIndex = stage === "details" ? 1 : stage === "en_route" ? 2 : 3;

  return (
    <section className="driver-active-flow" aria-labelledby="driver-active-delivery-title">
      <div className="driver-flow-header">
        <div>
          <span className="dashboard-eyebrow">Livrarea în focus</span>
          <h2 id="driver-active-delivery-title">Comanda #{order.id}</h2>
        </div>
        <div className="driver-stage-meter" aria-label={`Pasul ${stageIndex} din 3`}>
          {[1, 2, 3].map((value) => <span className={value <= stageIndex ? "is-active" : ""} key={value}>{value}</span>)}
        </div>
      </div>

      {stage === "details" && (
        <div className="driver-stage-content driver-details-stage">
          <div className="driver-details-copy">
            <div className="driver-detail-card is-destination">
              <span>Client și destinație</span>
              <strong>{order.contactName}</strong>
              <p>{order.address || order.deliveryLabel}</p>
              {order.isOutsideDeliveryArea && <em>În afara zonei obișnuite de livrare</em>}
            </div>
            <div className="driver-detail-card">
              <span><ReceiptText aria-hidden="true" /> Produse</span>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}><strong>{item.quantity}×</strong><span>{item.name}</span></li>
                ))}
              </ul>
            </div>
            {order.notes && <div className="driver-detail-card is-note"><span>Instrucțiuni client</span><p>{order.notes}</p></div>}
            <div className="driver-payment-summary">
              <span>{isPaid ? "Achitat" : "De încasat"}</span>
              <strong>{isPaid ? "Plătită" : `${order.total.toFixed(2)} lei`}</strong>
            </div>
          </div>
          <div className="driver-details-map">
            {order.mapPin ? (
              <LiveDeliveryMap destination={order.mapPin} courierLocation={courierLocation} label="Poziția curierului și adresa clientului" />
            ) : (
              <div className="driver-map-missing"><MapPinned aria-hidden="true" /><span>Comanda nu are un pin exact.</span></div>
            )}
          </div>
          <div className="driver-stage-actions">
            <div className="driver-contact-actions">
              <a className="secondary-button" href={`tel:${order.phone}`}><Phone aria-hidden="true" /> Sună</a>
              {whatsappUrl && <a className="secondary-button" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp</a>}
            </div>
            <button className="primary-button driver-main-action" type="button" disabled={pendingStage} onClick={onStart}>
              <Navigation aria-hidden="true" /> {pendingStage ? "Se pornește…" : "Începe livrarea"}
            </button>
          </div>
        </div>
      )}

      {stage === "en_route" && (
        <div className="driver-stage-content driver-route-stage">
          <div className="driver-route-summary">
            <div><span>Destinație</span><strong>{order.address || order.deliveryLabel}</strong></div>
            <div>
              <span>Distanță în linie dreaptă</span>
              <strong>{distanceKm == null ? "Se calculează…" : distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</strong>
            </div>
          </div>
          {order.mapPin ? (
            <LiveDeliveryMap
              allowFullscreen
              destination={order.mapPin}
              courierLocation={courierLocation}
              label="Navigare internă spre client"
            />
          ) : (
            <div className="driver-map-missing"><MapPinned aria-hidden="true" /><span>Comanda nu are un pin exact.</span></div>
          )}
          <div className="driver-route-controls">
            <p><LocateFixed aria-hidden="true" /> Poziție live{locationAccuracy != null ? ` · precizie ±${Math.round(locationAccuracy)} m` : ""}</p>
            <a className="secondary-button" href={`tel:${order.phone}`}><Phone aria-hidden="true" /> Sună clientul</a>
            <button className="primary-button driver-main-action" type="button" disabled={pendingStage} onClick={onArrive}>
              <MapPinned aria-hidden="true" /> {pendingStage ? "Se confirmă…" : "Am ajuns la adresă"}
            </button>
          </div>
        </div>
      )}

      {stage === "arrived" && (
        <div className="driver-stage-content driver-arrived-stage">
          <div className="driver-arrival-heading">
            <CheckCircle2 aria-hidden="true" />
            <div><span>Sosire confirmată</span><strong>{order.contactName}</strong><p>{order.address || order.deliveryLabel}</p></div>
          </div>
          <div className={`driver-payment-card${isPaid ? " is-paid" : ""}`}>
            <WalletCards aria-hidden="true" />
            <div><span>{isPaid ? "Plată confirmată" : "Sumă de încasat"}</span><strong>{order.total.toFixed(2)} lei</strong></div>
            {isPaid ? (
              <StatusBadge tone="success">Plătită</StatusBadge>
            ) : (
              <button className="primary-button" type="button" disabled={pendingPayment || pendingDelivery} onClick={onMarkPaid}>
                {pendingPayment ? "Se salvează…" : "Marchează plătită"}
              </button>
            )}
          </div>
          <div className="driver-completion-actions">
            <button className="primary-button driver-main-action" type="button" disabled={!isPaid || pendingPayment || pendingDelivery} onClick={onComplete}>
              <PackageCheck aria-hidden="true" /> {pendingDelivery ? "Se finalizează…" : "Finalizează livrarea"}
            </button>
            {confirmFailure ? (
              <div className="driver-failure-confirm" role="alert">
                <span>Confirmi că livrarea nu a putut fi efectuată?</span>
                <button className="danger-button" type="button" disabled={pendingDelivery} onClick={onFail}>Da, marchează eșuată</button>
                <button className="secondary-button" type="button" onClick={() => setConfirmFailure(false)}>Înapoi</button>
              </div>
            ) : (
              <button className="secondary-button driver-failure-button" type="button" disabled={pendingDelivery} onClick={() => setConfirmFailure(true)}>
                <XCircle aria-hidden="true" /> Nu am putut livra
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function orderItemsSummary(order: Order) {
  return order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
}

function MutationNotice({ error, success }: { error: Error | null; success: boolean }) {
  return (
    <div className="dashboard-live-region" aria-live="polite" aria-atomic="true">
      {error ? `Operațiunea a eșuat: ${error.message}` : success ? "Operațiunea a fost salvată." : ""}
    </div>
  );
}

function customerWhatsAppUrl(order: Order) {
  const digits = order.phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Bună! Te contactez în legătură cu livrarea comenzii #${order.id} de la Mici de Negoești.`)}`;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "acum";
  if (minutes === 1) return "de 1 minut";
  if (minutes < 60) return `de ${minutes} minute`;
  const hours = Math.floor(minutes / 60);
  return `de ${hours} ${hours === 1 ? "oră" : "ore"}`;
}

function playKitchenAlertTone() {
  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1040, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.38);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // A visible order alert remains available when a browser blocks audio.
  }
}

function announceKitchenOrder(order: Order) {
  playKitchenAlertTone();
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    new Notification(`Comandă nouă #${order.id}`, {
      body: `${order.contactName}: ${orderItemsSummary(order)}`,
      tag: `kitchen-order-${order.id}`
    });
  } catch {
    // Some mobile browsers expose Notification but do not allow direct construction.
  }
}
