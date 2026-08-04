import { MapPinned, Navigation, PackageCheck, UserRound } from "lucide-react";
import type { Order } from "../api/types";
import { GrillRunnerGame } from "./GrillRunnerGame";
import { LiveDeliveryMap } from "./LiveDeliveryMap";

function ordersAheadLabel(order: Order) {
  const ahead = order.deliveryTracking?.ordersAhead ?? 0;
  if (order.deliveryType !== "delivery") return "Nu se aplică";
  if (order.status.code === "completed") return "Comanda a fost livrată";
  if (!order.assignedDeliverer && !order.deliveryTracking?.driverName) return "Curier neasignat încă";
  if (ahead === 0) return "Tu ești următoarea livrare";
  if (ahead === 1) return "1 comandă înaintea ta";
  return `${ahead} comenzi înaintea ta`;
}

function driverName(order: Order) {
  return order.deliveryTracking?.driverName || order.assignedDeliverer?.name || order.assignedDeliverer?.phone || "Curier neasignat";
}

function routeProgressWidth(order: Order) {
  const route = order.deliveryTracking;
  if (!route?.routePosition || !route.routeSize) return "0%";
  return `${Math.max(10, Math.min(100, (route.routePosition / route.routeSize) * 100))}%`;
}

export function OrderTracker({ order }: { order: Order }) {
  const isTerminalProblem = order.currentStepIndex < 0;
  const etaCopy =
    order.deliveryType === "pickup"
      ? "Îți pregătim comanda pentru ridicare."
      : "Ținem comanda în mișcare până ajunge la tine.";
  const route = order.deliveryTracking;

  return (
    <section className="tracker-panel waiting-experience">
      <div className="tracker-head">
        <div>
          <span>Comandă #{order.orderNumber ?? order.id}</span>
          <p>{etaCopy}</p>
        </div>
        <strong>{order.status.label}</strong>
      </div>
      {order.deliveryType === "delivery" && (
        <section className="customer-route-status" aria-label="Status livrare">
          <div className="customer-route-current">
            <span>Status</span>
            <strong>{order.status.label}</strong>
            <p>{route?.locationLabel ?? "Curierul apare aici după ce restaurantul trimite comanda."}</p>
          </div>
          <dl className="customer-route-grid">
            <div>
              <dt><UserRound aria-hidden="true" size={17} /> Curier</dt>
              <dd>{driverName(order)}</dd>
            </div>
            <div>
              <dt><Navigation aria-hidden="true" size={17} /> Unde este</dt>
              <dd>{route?.locationLabel ?? "În restaurant"}</dd>
            </div>
            <div>
              <dt><PackageCheck aria-hidden="true" size={17} /> Înaintea ta</dt>
              <dd>{ordersAheadLabel(order)}</dd>
            </div>
          </dl>
          {route?.routePosition && route.routeSize > 0 && (
            <div className="customer-route-meter" aria-label={`Oprirea ${route.routePosition} din ${route.routeSize}`}>
              <div><span style={{ width: routeProgressWidth(order) }} /></div>
              <p><MapPinned aria-hidden="true" size={16} /> Oprirea {route.routePosition} din {route.routeSize}</p>
            </div>
          )}
          {order.mapPin && route?.courierLocation && order.status.code === "out_for_delivery" && (
            <div className="customer-live-delivery">
              <div>
                <strong>Curier live pe hartă</strong>
                <span>
                  {route.distanceKm == null
                    ? "Poziția se actualizează automat."
                    : route.distanceKm < 1
                      ? `La aproximativ ${Math.round(route.distanceKm * 1000)} m în linie dreaptă.`
                      : `La aproximativ ${route.distanceKm.toFixed(1)} km în linie dreaptă.`}
                </span>
              </div>
              <LiveDeliveryMap
                compact
                allowFullscreen
                destination={order.mapPin}
                courierLocation={route.courierLocation}
                label="Poziția live a curierului"
              />
            </div>
          )}
        </section>
      )}
      {isTerminalProblem ? (
        <div className="tracker-alert">Această comandă are statusul: {order.status.label}.</div>
      ) : (
        <div className="tracker-steps">
          {order.steps.map((step, index) => (
            <div
              key={step.code}
              className={`tracker-step ${index <= order.currentStepIndex ? "is-done" : ""} ${
                index === order.currentStepIndex ? "is-current" : ""
              }`}
            >
              <span>{index + 1}</span>
              <p>{step.label}</p>
            </div>
          ))}
        </div>
      )}
      {order.isOutsideDeliveryArea && (
        <div className="tracker-alert">
          Locația este în afara zonei obișnuite de livrare. Echipa va confirma disponibilitatea și eventualele detalii de livrare.
          {order.deliveryDistanceKm != null ? ` Distanță aproximativă: ${order.deliveryDistanceKm.toFixed(1)} km.` : ""}
        </div>
      )}
      <div className="order-summary">
        <div>
          <span>Tip comandă</span>
          <strong>{order.deliveryLabel}</strong>
        </div>
        {order.address && (
          <div>
            <span>Adresă</span>
            <strong>{order.address}</strong>
          </div>
        )}
        {order.items.map((item) => (
          <div key={item.id}>
            <span>{item.name}</span>
            <strong>x{item.quantity}</strong>
          </div>
        ))}
        <div>
          <span>Subtotal produse</span>
          <strong>{order.subtotal.toFixed(2)} lei</strong>
        </div>
        {order.discountAmount > 0 && (
          <div>
            <span>Voucher {order.voucherCode}</span>
            <strong>-{order.discountAmount.toFixed(2)} lei</strong>
          </div>
        )}
        <div>
          <span>{order.deliveryLabel}</span>
          <strong>{order.deliveryCost.toFixed(2)} lei</strong>
        </div>
        <div className="summary-total">
          <span>Total</span>
          <strong>{order.total.toFixed(2)} lei</strong>
        </div>
        <div>
          <span>Plată</span>
          <strong>{order.paymentStatus === "paid" ? "Plătită" : "Neplătită"}</strong>
        </div>
      </div>
      <div className="tracker-actions">
        {order.whatsappUrl && (
          <a className="primary-button" href={order.whatsappUrl} target="_blank" rel="noreferrer">
            Trimite pe WhatsApp
          </a>
        )}
        {order.trackingUrl && (
          <a className="secondary-button" href={order.trackingUrl}>
            Link status
          </a>
        )}
      </div>
      <GrillRunnerGame showHomeButton={false} title="Aștepți comanda" subtitle="Poți juca până vine comanda." />
    </section>
  );
}
