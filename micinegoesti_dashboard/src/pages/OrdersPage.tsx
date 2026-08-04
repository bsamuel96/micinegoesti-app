import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api/client";
import type { Order } from "../api/types";
import { OrderTracker } from "../components/OrderTracker";
import { useAuth } from "../context/AuthContext";

function shouldPollOrders(orders?: Order[]) {
  return Boolean(orders?.some((order) => !["completed", "cancelled", "failed", "refunded"].includes(order.status.code)));
}

export function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders(),
    enabled: Boolean(user && user.role !== "customer"),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => shouldPollOrders(query.state.data?.orders) ? 8000 : false
  });

  if (!user) {
    return (
      <section className="section-shell empty-state">
        <h1>Urmărește o comandă</h1>
        <p>Poți verifica statusul cu linkul primit după checkout sau cu numărul comenzii și telefonul.</p>
        <Link className="primary-button" to="/track">Verifică statusul</Link>
      </section>
    );
  }

  if (user.role === "customer") {
    return <Navigate to="/account" replace />;
  }

  return (
    <section className="section-shell">
      <div className="section-title">
        <span>Comenzi</span>
        <h1>{user.role === "deliverer" ? "Comenzi asignate" : "Comenzile mele"}</h1>
      </div>
      <div className="orders-list">
        {orders.data?.orders.map((order) => (
          <div key={order.id} className="order-row">
            <OrderTracker order={order} />
            {user.role === "deliverer" && order.paymentStatus !== "paid" && (
              <button
                className="primary-button"
                onClick={async () => {
                  await api.markPaid(order.id);
                  queryClient.invalidateQueries({ queryKey: ["orders"] });
                }}
              >
                Marchează plătită/livrată
              </button>
            )}
          </div>
        ))}
        {!orders.data?.orders.length && <p>Nu există comenzi încă.</p>}
      </div>
    </section>
  );
}
