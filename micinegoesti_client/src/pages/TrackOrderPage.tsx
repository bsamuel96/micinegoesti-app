import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Order } from "../api/types";
import { OrderTracker } from "../components/OrderTracker";

type TrackingLookup =
  | { kind: "token"; token: string }
  | { kind: "manual"; orderId: number; phone: string };

function shouldPollOrder(order?: Order) {
  return Boolean(order && !["completed", "cancelled", "failed", "refunded"].includes(order.status.code));
}

export function TrackOrderPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [lookup, setLookup] = useState<TrackingLookup | null>(() => token ? { kind: "token", token } : null);
  const [formError, setFormError] = useState<string | null>(null);
  const trackedOrder = useQuery({
    queryKey: ["tracked-order", lookup],
    queryFn: () => {
      if (!lookup) throw new Error("Nu există o comandă de urmărit.");
      return lookup.kind === "token"
        ? api.trackOrderByToken(lookup.token)
        : api.trackOrder({ orderId: lookup.orderId, phone: lookup.phone });
    },
    enabled: Boolean(lookup),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => shouldPollOrder(query.state.data?.order) ? 8000 : false
  });
  const order = trackedOrder.data?.order ?? null;
  const error = formError ?? (trackedOrder.error instanceof Error ? trackedOrder.error.message : null);

  useEffect(() => {
    if (token) setLookup({ kind: "token", token });
  }, [token]);

  return (
    <section className="section-shell track-page">
      <div className="section-title">
        <span>Status comandă</span>
        <h1>Urmărește progresul</h1>
      </div>
      <form
        className="track-form"
        onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          const form = new FormData(event.currentTarget);
          const orderId = Number(form.get("orderId"));
          const phone = String(form.get("phone"));
          if (!Number.isFinite(orderId) || !phone.trim()) {
            setFormError("Completează numărul comenzii și telefonul.");
            return;
          }
          setLookup({ kind: "manual", orderId, phone });
        }}
      >
        <label>Număr comandă<input name="orderId" type="number" required /></label>
        <label>Telefon / WhatsApp<input name="phone" placeholder="+40..." required /></label>
        <button className="primary-button">Vezi status</button>
      </form>
      {trackedOrder.isPending && lookup && <p className="form-status">Actualizăm statusul comenzii...</p>}
      {error && <p className="form-error">{error}</p>}
      {order && <OrderTracker order={order} />}
    </section>
  );
}
