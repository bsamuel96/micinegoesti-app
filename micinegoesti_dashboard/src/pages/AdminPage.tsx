import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Images,
  Info,
  List,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Category, DeliveryZone, Order, User } from "../api/types";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { getDashboardSections } from "../components/dashboard/dashboardNavigation";
import {
  ConfirmActionDialog,
  DashboardPanelHeader,
  DashboardPanelTabs,
  EmptyState,
  StatusBadge
} from "../components/dashboard/DashboardPrimitives";
import { DriverDashboard, KitchenDashboard, ManagerDashboard } from "../components/dashboard/RoleDashboards";
import { useAuth } from "../context/AuthContext";
import {
  ProductImageManager,
  PRODUCT_IMAGE_ACCEPTED_TYPES,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_IMAGES
} from "../components/ProductImageManager";
import { ProductEditorPreview, type ProductPreviewDraft } from "../components/admin/ProductEditorPreview";
import { EU_ALLERGENS } from "../lib/allergens";
import { getProductCoverImage } from "../lib/productImages";
import { VouchersPanel } from "./VouchersPanel";

const STOREFRONT_URL = (import.meta.env.VITE_STOREFRONT_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "");

const statuses = [
  ["pending", "Comandă plasată"],
  ["confirmed", "Confirmată"],
  ["preparing", "În preparare"],
  ["ready_for_pickup", "Gata de ridicare"],
  ["out_for_delivery", "În livrare"],
  ["completed", "Finalizată"],
  ["cancelled", "Anulată"],
  ["failed", "Eșuată"],
  ["refunded", "Rambursată"]
] as const;

const adminRoleLabels: Partial<Record<User["role"], string>> = {
  admin: "Administrator",
  store_manager: "Manager magazin",
  kitchen: "Bucătărie",
  deliverer: "Curier",
  customer: "Client"
};

export function AdminPage({ initialSection = "dashboard" }: { initialSection?: string }) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [dashboardParams, setDashboardParams] = useSearchParams();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  const canManageCatalog = user?.role === "admin" || user?.role === "store_manager";
  const canManageOrders = user?.role === "admin" || user?.role === "store_manager" || user?.role === "kitchen";
  const canViewOrders = user?.role === "admin" || user?.role === "store_manager" || user?.role === "kitchen" || user?.role === "deliverer";
  const canAssignDeliverers = user?.role === "admin" || user?.role === "store_manager";
  const canViewOpsUsers = user?.role === "admin" || user?.role === "store_manager";
  const isAdmin = user?.role === "admin";

  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => api.orders(),
    enabled: canViewOrders,
    retry: 1,
    refetchOnWindowFocus: false,
    // A server outage should not keep issuing requests every few seconds. Staff can
    // retry explicitly, and normal polling resumes as soon as a request succeeds.
    refetchInterval: (query) => query.state.status === "error" ? false : 8000
  });
  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => api.products(undefined, undefined, true, true),
    enabled: canManageCatalog,
    retry: 1,
    refetchOnWindowFocus: false
  });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.categories(), enabled: canManageCatalog });
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.settings(), enabled: isAdmin });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api.users(), enabled: canViewOpsUsers });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    queryClient.invalidateQueries({ queryKey: ["public-settings"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const filteredProducts = useMemo(() => {
    return products.data?.products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  }, [products.data, search]);
  const adminTabs = getDashboardSections(user?.role ?? "customer");
  const firstEnabledTab = adminTabs[0]?.key ?? "dashboard";
  const requestedTab = dashboardParams.get("section") || initialSection;
  const tab = adminTabs.some((item) => item.key === requestedTab) ? requestedTab : firstEnabledTab;

  function changeDashboardSection(nextSection: string) {
    setSelectedOrder(null);
    setDashboardParams((current) => {
      const next = new URLSearchParams(current);
      if (nextSection === "dashboard") next.delete("section");
      else next.set("section", nextSection);
      if (nextSection !== "products") {
        next.delete("product");
        next.delete("productMode");
        next.delete("productCategory");
        next.delete("productView");
      }
      return next;
    });
  }

  if (!user) return null;

  return (
    <DashboardShell
      sections={adminTabs}
      activeSection={tab}
      user={user}
      onSectionChange={changeDashboardSection}
      onLogout={logout}
    >
          {tab === "dashboard" && (orders.isError
            ? <OperationalDataError resource="comenzile" onRetry={() => orders.refetch()} retrying={orders.isFetching} />
            : (
            user.role === "kitchen"
              ? <KitchenDashboard orders={orders.data?.orders ?? []} onSelect={setSelectedOrder} />
              : user.role === "deliverer"
                ? <DriverDashboard
                    orders={orders.data?.orders ?? []}
                    driverName={user.name || user.phone}
                    onRefresh={() => orders.refetch()}
                    refreshing={orders.isFetching}
                  />
                : <ManagerDashboard orders={orders.data?.orders ?? []} users={users.data?.users ?? []} onSelect={setSelectedOrder} />
            )
          )}
          {tab === "orders" && (orders.isError
            ? <OperationalDataError resource="comenzile" onRetry={() => orders.refetch()} retrying={orders.isFetching} />
            : (
            <OrdersBoard
              orders={orders.data?.orders ?? []}
              users={users.data?.users ?? []}
              canUpdateStatus={canManageOrders}
              canAssignDeliverers={canAssignDeliverers}
              role={user?.role}
              onSelect={setSelectedOrder}
              onDone={invalidate}
            />
            )
          )}
          {tab === "products" && canManageCatalog && (products.isError
            ? <OperationalDataError resource="produsele" onRetry={() => products.refetch()} retrying={products.isFetching} />
            : (
            <ProductsPanel
              products={filteredProducts}
              catalogProducts={products.data?.products ?? []}
              categories={categories.data?.categories ?? []}
              search={search}
              onSearch={setSearch}
              onDone={invalidate}
            />
            )
          )}
          {tab === "categories" && canManageCatalog && <CategoriesPanel categories={categories.data?.categories ?? []} onDone={invalidate} />}
          {tab === "users" && isAdmin && <UsersPanel users={users.data?.users ?? []} onDone={invalidate} />}
          {tab === "vouchers" && isAdmin && <VouchersPanel users={users.data?.users ?? []} />}
          {tab === "delivery-zones" && isAdmin && <DeliveryZonesPanel settings={settings.data?.settings ?? {}} onDone={invalidate} />}
          {tab === "settings" && isAdmin && <SettingsPanel settings={settings.data?.settings ?? {}} onDone={invalidate} />}
      {selectedOrder && <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </DashboardShell>
  );
}

function OperationalDataError({
  resource,
  onRetry,
  retrying
}: {
  resource: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="dashboard-request-error" role="alert" aria-live="assertive">
      <EmptyState
        title={`Nu putem încărca ${resource}`}
        description="Verifică conexiunea și încearcă din nou. Dacă problema persistă, anunță administratorul."
        onRefresh={onRetry}
        refreshing={retrying}
      />
    </section>
  );
}

function OrdersBoard({
  orders,
  users,
  canUpdateStatus,
  canAssignDeliverers,
  role,
  onSelect,
  onDone
}: {
  orders: Order[];
  users: User[];
  canUpdateStatus: boolean;
  canAssignDeliverers: boolean;
  role?: User["role"];
  onSelect: (order: Order) => void;
  onDone: () => void;
}) {
  const visibleStatuses = statusesForRole(role);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [completionOrder, setCompletionOrder] = useState<Order | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ action, orderId, value }: { action: "status" | "assign" | "paid"; orderId: number; value?: string }) => {
      if (action === "paid") return api.markPaid(orderId);
      if (action === "assign") return api.assignOrder(orderId, value ?? "");
      return api.updateOrderStatus(orderId, value ?? "");
    },
    onSuccess: async () => {
      setCompletionOrder(null);
      onDone();
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    }
  });
  const visibleOrders = orders.filter((order) =>
    visibleStatuses.some(([code]) => code === order.status.code) && (statusFilter === "all" || order.status.code === statusFilter)
  );
  const deliverers = users.filter((candidate) => candidate.role === "deliverer");

  return (
    <div className="orders-panel management-panel">
      <DashboardPanelHeader
        eyebrow="Operațiuni"
        title="Comenzi existente"
        description="Urmărește comenzile într-un singur tabel și actualizează rapid statusul sau curierul."
        actions={<label className="orders-status-filter dashboard-field">
          <span>Afișează comenzile</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Toate stările</option>
            {visibleStatuses.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
          </select>
        </label>}
      />

      <section className="management-list-section">
        <div className="admin-data-table-wrap">
          <table className="admin-data-table orders-table">
            <thead>
              <tr>
                <th scope="col">Comandă</th>
                <th scope="col">Client</th>
                <th scope="col">Livrare</th>
                <th scope="col">Produse</th>
                <th scope="col">Status</th>
                <th scope="col">Curier</th>
                <th scope="col">Total</th>
                <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <OrderTableRow
                  key={order.id}
                  order={order}
                  role={role}
                  deliverers={deliverers}
                  canUpdateStatus={canUpdateStatus}
                  canAssignDeliverers={canAssignDeliverers}
                  pending={mutation.isPending}
                  onSelect={onSelect}
                  onUpdateStatus={(value) => mutation.mutate({ action: "status", orderId: order.id, value })}
                  onAssignDeliverer={(value) => mutation.mutate({ action: "assign", orderId: order.id, value })}
                  onMarkPaid={() => mutation.mutate({ action: "paid", orderId: order.id })}
                  onComplete={() => setCompletionOrder(order)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!visibleOrders.length && <EmptyState title="Nu sunt comenzi de afișat" description="Schimbă filtrul de status sau așteaptă următoarea comandă." />}
        <p className="products-count" aria-live="polite">{visibleOrders.length} {visibleOrders.length === 1 ? "comandă afișată" : "comenzi afișate"}</p>
      </section>
      <div className="dashboard-live-region" aria-live="polite">{mutation.error ? `Operațiunea a eșuat: ${mutation.error.message}` : ""}</div>
      <ConfirmActionDialog
        open={Boolean(completionOrder)}
        title={`Finalizezi comanda #${completionOrder?.id ?? ""}?`}
        description={completionOrder?.paymentStatus !== "paid" ? "Atenție: plata este încă marcată ca neîncasată." : "Comanda va fi marcată ca livrată."}
        confirmLabel="Marchează livrată"
        pending={mutation.isPending}
        onCancel={() => setCompletionOrder(null)}
        onConfirm={() => completionOrder && mutation.mutate({ action: "status", orderId: completionOrder.id, value: "completed" })}
      />
    </div>
  );
}

function OrderTableRow({
  order,
  role,
  deliverers,
  canUpdateStatus,
  canAssignDeliverers,
  pending,
  onSelect,
  onUpdateStatus,
  onAssignDeliverer,
  onMarkPaid,
  onComplete
}: {
  order: Order;
  role?: User["role"];
  deliverers: User[];
  canUpdateStatus: boolean;
  canAssignDeliverers: boolean;
  pending: boolean;
  onSelect: (order: Order) => void;
  onUpdateStatus: (value: string) => void;
  onAssignDeliverer: (value: string) => void;
  onMarkPaid: () => void;
  onComplete: () => void;
}) {
  return (
    <tr>
      <td data-label="Comandă">
        <button type="button" className="table-link-button" onClick={() => onSelect(order)}>
          <strong>#{order.id}</strong>
          <small>{new Date(order.createdAt).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
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
          <small>{order.address || order.deliveryLabel}{order.isOutsideDeliveryArea ? " · în afara zonei" : ""}</small>
        </div>
      </td>
      <td data-label="Produse"><span className="table-muted-text">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</span></td>
      <td data-label="Status">
        {canUpdateStatus ? (
          <label className="dashboard-field compact-table-field">
            <span className="visually-hidden">Starea comenzii #{order.id}</span>
            <select value={order.status.code} disabled={pending} onChange={(event) => onUpdateStatus(event.target.value)}>
              {statusOptionsForOrder(order, role).map(([statusCode, statusLabel]) => <option value={statusCode} key={statusCode}>{statusLabel}</option>)}
            </select>
          </label>
        ) : (
          <StatusBadge tone="brand">{order.status.label}</StatusBadge>
        )}
      </td>
      <td data-label="Curier">
        {canAssignDeliverers && order.orderType === "delivery" ? (
          <label className="dashboard-field compact-table-field">
            <span className="visually-hidden">Curier asignat comenzii #{order.id}</span>
            <select value={order.assignedDeliverer?.id ?? ""} disabled={pending} onChange={(event) => event.target.value && onAssignDeliverer(event.target.value)}>
              <option value="">Selectează curierul</option>
              {deliverers.map((deliverer) => <option value={deliverer.id} key={deliverer.id}>{deliverer.name ?? deliverer.phone}</option>)}
            </select>
          </label>
        ) : (
          <span className="table-muted-text">{order.assignedDeliverer?.name || order.assignedDeliverer?.phone || (order.orderType === "delivery" ? "Neasignat" : "Ridicare")}</span>
        )}
      </td>
      <td data-label="Total">
        <div className="table-identity">
          <strong className="product-table-price">{order.total.toFixed(2)} lei</strong>
          {order.discountAmount > 0 && <small>Voucher {order.voucherCode}: -{order.discountAmount.toFixed(2)} lei</small>}
          <StatusBadge tone={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "Plătită" : "Neplătită"}</StatusBadge>
        </div>
      </td>
      <td className="admin-data-table-actions">
        <div className="table-action-group">
          <button className="secondary-button" type="button" onClick={() => onSelect(order)}>Detalii</button>
          {role === "deliverer" && order.paymentStatus !== "paid" && (
            <button className="secondary-button" type="button" disabled={pending} onClick={onMarkPaid}>Marchează plătită</button>
          )}
          {role === "deliverer" && order.status.code === "out_for_delivery" && (
            <button className="primary-button" type="button" disabled={pending} onClick={onComplete}>Marchează livrată</button>
          )}
        </div>
      </td>
    </tr>
  );
}

function statusesForRole(role?: User["role"]) {
  if (role === "kitchen") {
    return statuses.filter(([code]) => ["pending", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery"].includes(code));
  }
  if (role === "deliverer") return statuses.filter(([code]) => ["out_for_delivery", "completed", "failed"].includes(code));
  return statuses;
}

function statusOptionsForOrder(order: Order, role?: User["role"]) {
  if (role !== "kitchen") return statuses;

  const next =
    order.status.code === "pending"
      ? "confirmed"
      : order.status.code === "confirmed"
      ? "preparing"
      : order.status.code === "preparing"
        ? order.orderType === "pickup" ? "ready_for_pickup" : "out_for_delivery"
        : order.status.code;

  const codes = [order.status.code, next];
  return statuses.filter(([code]) => codes.includes(code));
}

function OrderDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const mapsUrl = order.mapUrl || (order.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}` : null);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer" role="dialog" aria-modal="true" aria-labelledby="order-drawer-title" onClick={(event) => event.stopPropagation()}>
        <header className="order-drawer-header">
          <div><span>Detalii comandă</span><h2 id="order-drawer-title">Comanda #{order.id}</h2></div>
          <button type="button" className="modal-close" aria-label="Închide detaliile comenzii" autoFocus onClick={onClose}>×</button>
        </header>
        <div className="order-drawer-badges">
          <StatusBadge tone="brand">{order.status.label}</StatusBadge>
          <StatusBadge tone={order.paymentStatus === "paid" ? "success" : "warning"}>{order.paymentStatus === "paid" ? "Plătită" : "Neplătită"}</StatusBadge>
        </div>
        <section className="order-drawer-section">
          <h3>Client și livrare</h3>
          <p><strong>{order.contactName}</strong></p>
          <p><a href={`tel:${order.phone}`}>{order.phone}</a></p>
          <p>{order.deliveryLabel}{order.address ? ` · ${order.address}` : ""}</p>
          {order.assignedDeliverer && <p><strong>Curier:</strong> {order.assignedDeliverer.name || order.assignedDeliverer.phone}</p>}
        </section>
        {order.isOutsideDeliveryArea && (
          <p className="dashboard-inline-alert">
            Locația este în afara zonei obișnuite de livrare
            {order.deliveryDistanceKm != null ? ` · aproximativ ${order.deliveryDistanceKm.toFixed(1)} km` : ""}.
          </p>
        )}
        {order.mapPin && (
          <p>
            Coordonate: {order.mapPin.lat.toFixed(6)}, {order.mapPin.lng.toFixed(6)}
            {order.mapUrl && <> · <a href={order.mapUrl} target="_blank" rel="noreferrer">Deschide harta</a></>}
          </p>
        )}
        {order.notes && <div className="driver-notes"><strong>Observații</strong><p>{order.notes}</p></div>}
        <section className="order-summary">
          <h3>Produse</h3>
          {order.items.map((item) => (
            <div key={item.id}><span>{item.name}</span><strong>x{item.quantity}</strong></div>
          ))}
          <div><span>Subtotal produse</span><strong>{order.subtotal.toFixed(2)} lei</strong></div>
          {order.discountAmount > 0 && <div><span>Voucher {order.voucherCode}</span><strong>-{order.discountAmount.toFixed(2)} lei</strong></div>}
          <div><span>Livrare</span><strong>{order.deliveryCost.toFixed(2)} lei</strong></div>
          <div className="summary-total"><span>Total</span><strong>{order.total.toFixed(2)} lei</strong></div>
        </section>
        <div className="order-drawer-actions">
          <a className="secondary-button" href={`tel:${order.phone}`}>Sună clientul</a>
          {order.whatsappUrl && <a className="secondary-button" href={order.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>}
          {mapsUrl && <a className="primary-button" href={mapsUrl} target="_blank" rel="noreferrer">Deschide în hartă</a>}
        </div>
        <section><h3>Istoric status</h3>
          <div className="status-history">
            {(order.statusHistory ?? order.statusLog).map((entry) => (
              <p key={entry.id}>{entry.toStatus.label} · {new Date(entry.createdAt).toLocaleString("ro-RO")}{entry.note ? ` · ${entry.note}` : ""}</p>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

export function ProductsPanel({
  products,
  catalogProducts = products,
  categories,
  search,
  onSearch,
  onDone
}: {
  products: Awaited<ReturnType<typeof api.products>>["products"];
  catalogProducts?: Awaited<ReturnType<typeof api.products>>["products"];
  categories: Category[];
  search: string;
  onSearch: (value: string) => void;
  onDone: () => void;
}) {
  const [workspaceParams, setWorkspaceParams] = useSearchParams();
  const section: "list" | "trash" = workspaceParams.get("productView") === "trash" ? "trash" : "list";
  const editingProductId = workspaceParams.get("product");
  const creationCategorySlug = workspaceParams.get("productMode") === "create"
    ? workspaceParams.get("productCategory") ?? ""
    : null;
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [localOrders, setLocalOrders] = useState<Record<string, string[]>>({});
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [dragTargetKey, setDragTargetKey] = useState<string | null>(null);
  const activeProducts = products.filter((product) => !product.isTrashed);
  const trashedProducts = products.filter((product) => product.isTrashed);
  const sectionProducts = section === "trash" ? trashedProducts : activeProducts;
  const visibleProducts = sectionProducts.filter((product) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "uncategorized") return product.categories.length === 0;
    return product.categories.some((category) => category.slug === categoryFilter);
  });
  const categoryOptions = [...categories]
    .filter((category) => category.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label, "ro"));
  const hasUncategorizedProducts = sectionProducts.some((product) => product.categories.length === 0);
  const sectionTitle = section === "trash" ? "Coș produse" : "Produse existente";
  const sectionDescription = section === "trash"
    ? "Produsele șterse nu apar clienților și pot fi restaurate de aici."
    : "Vezi rapid prețurile, disponibilitatea și starea publicării.";
  const canReorder = section === "list" && categoryFilter === "all" && !search.trim();
  const groups = groupProductsByCategory(visibleProducts, categories).map((group) => {
    const localOrder = localOrders[group.key];
    if (!localOrder) return group;
    const productsById = new Map(group.products.map((product) => [product.id, product]));
    const orderedProducts = localOrder
      .map((id) => productsById.get(id))
      .filter((product): product is AdminProduct => Boolean(product));
    const orderedIds = new Set(orderedProducts.map((product) => product.id));
    return {
      ...group,
      products: [...orderedProducts, ...group.products.filter((product) => !orderedIds.has(product.id))]
    };
  });
  const reorderMutation = useMutation({
    mutationFn: ({ productIds }: { categoryKey: string; productIds: string[] }) => api.reorderProducts(productIds),
    onSuccess: onDone,
    onError: (_error, variables) => {
      setLocalOrders((current) => {
        const next = { ...current };
        delete next[variables.categoryKey];
        return next;
      });
    }
  });

  function updateWorkspaceParams(update: (params: URLSearchParams) => void) {
    setWorkspaceParams((current) => {
      const next = new URLSearchParams(current);
      next.set("section", "products");
      update(next);
      return next;
    });
  }

  function openSection(nextSection: "list" | "trash") {
    updateWorkspaceParams((next) => {
      if (nextSection === "trash") next.set("productView", "trash");
      else next.delete("productView");
      next.delete("product");
      next.delete("productMode");
      next.delete("productCategory");
    });
    setCategoryFilter("all");
  }

  function openCreate(categorySlug = "") {
    updateWorkspaceParams((next) => {
      next.delete("product");
      next.delete("productView");
      next.set("productMode", "create");
      if (categorySlug) next.set("productCategory", categorySlug);
      else next.delete("productCategory");
    });
  }

  function toggleProductEditor(productId: string) {
    updateWorkspaceParams((next) => {
      next.delete("productMode");
      next.delete("productCategory");
      next.delete("productView");
      if (editingProductId === productId) next.delete("product");
      else next.set("product", productId);
    });
  }

  function closeProductWorkspace() {
    updateWorkspaceParams((next) => {
      next.delete("product");
      next.delete("productMode");
      next.delete("productCategory");
    });
  }

  function dropProduct(
    group: ReturnType<typeof groupProductsByCategory>[number],
    targetProductId: string | null,
    event: DragEvent<HTMLElement>
  ) {
    event.preventDefault();
    const sourceProductId = event.dataTransfer.getData("text/plain") || draggedProductId;
    const currentIds = group.products.map((product) => product.id);
    const sourceIndex = sourceProductId ? currentIds.indexOf(sourceProductId) : -1;
    if (sourceIndex < 0) return;

    const nextIds = [...currentIds];
    const [movedId] = nextIds.splice(sourceIndex, 1);
    if (targetProductId) {
      const originalTargetIndex = currentIds.indexOf(targetProductId);
      nextIds.splice(Math.min(originalTargetIndex, nextIds.length), 0, movedId);
    } else {
      nextIds.push(movedId);
    }
    setDraggedProductId(null);
    setDragTargetKey(null);
    if (nextIds.every((id, index) => id === currentIds[index])) return;
    setLocalOrders((current) => ({ ...current, [group.key]: nextIds }));
    reorderMutation.mutate({ categoryKey: group.key, productIds: nextIds });
  }

  return (
    <div className="products-panel">
      <DashboardPanelHeader
        eyebrow="Catalog"
        title={sectionTitle}
        description={sectionDescription}
        actions={
          <DashboardPanelTabs
            label="Secțiuni produse"
            value={creationCategorySlug !== null ? "create" : section}
            options={[
              { value: "list", label: "Produse existente", icon: <List aria-hidden="true" size={19} /> },
              { value: "create", label: "Adaugă produs", icon: <Plus aria-hidden="true" size={19} /> },
              { value: "trash", label: `Coș produse (${trashedProducts.length})`, icon: <Trash2 aria-hidden="true" size={19} /> }
            ]}
            onChange={(nextSection) => nextSection === "create" ? openCreate() : openSection(nextSection)}
          />
        }
      />

      <section className="products-list-section" aria-labelledby="products-list-title">
          <div className="products-list-filters">
            <label className="dashboard-field admin-search"><span>Caută în produse</span>
              <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Scrie numele produsului" type="search" />
            </label>
            <label className="dashboard-field products-category-filter">
              <span>Filtrează după categorie</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Toate categoriile</option>
                {categoryOptions.map((category) => (
                  <option value={category.slug} key={category.slug}>{category.label}</option>
                ))}
                {hasUncategorizedProducts && <option value="uncategorized">Fără categorie</option>}
              </select>
            </label>
          </div>
          {visibleProducts.length ? (
            <div className="products-category-groups">
              {groups.map((group) => (
                <section className="products-category-section" key={group.key} aria-labelledby={`products-category-${group.key}`}>
                  <div className="products-category-heading">
                    <div className="products-category-title">
                      <span>Categorie</span>
                      <h3 id={`products-category-${group.key}`}>{group.label}</h3>
                    </div>
                    <div className="products-category-heading-actions">
                      <StatusBadge>{group.products.length}</StatusBadge>
                    </div>
                  </div>
                  <div className="products-card-grid">
                    {group.products.map((product) => (
                      <ProductCatalogCard
                        key={product.id}
                        product={product}
                        products={catalogProducts}
                        categories={categories}
                        editing={section === "list" && editingProductId === product.id}
                        dragging={draggedProductId === product.id}
                        dropTarget={dragTargetKey === product.id}
                        dragEnabled={canReorder && !reorderMutation.isPending}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", product.id);
                          setDraggedProductId(product.id);
                        }}
                        onDragOver={(event) => {
                          if (!canReorder || !draggedProductId || draggedProductId === product.id) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragTargetKey(product.id);
                        }}
                        onDrop={(event) => dropProduct(group, product.id, event)}
                        onDragEnd={() => {
                          setDraggedProductId(null);
                          setDragTargetKey(null);
                        }}
                        onToggleEdit={() => toggleProductEditor(product.id)}
                        onDone={onDone}
                      />
                    ))}
                    {section === "list" && group.key !== "fara-categorie" && (
                      <button
                        className={`product-add-card${dragTargetKey === `${group.key}:end` ? " is-drop-target" : ""}`}
                        type="button"
                        aria-label={`Adaugă produs în ${group.label}`}
                        onClick={() => openCreate(group.key)}
                        onDragOver={(event) => {
                          if (!canReorder || !draggedProductId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragTargetKey(`${group.key}:end`);
                        }}
                        onDrop={(event) => dropProduct(group, null, event)}
                      >
                        <span><Plus aria-hidden="true" size={26} /></span>
                        <strong>Adaugă produs</strong>
                        <small>{group.label}</small>
                      </button>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              title={section === "trash" ? "Coșul de produse este gol" : "Nu am găsit produse"}
              description={section === "trash"
                ? "Produsele șterse vor apărea aici și vor putea fi restaurate."
                : "Schimbă termenul de căutare, categoria selectată sau adaugă un produs nou."}
            />
          )}
          <p className="products-count" aria-live="polite">{visibleProducts.length} {visibleProducts.length === 1 ? "produs afișat" : "produse afișate"}</p>
      </section>
      {creationCategorySlug !== null && (
        <ProductCreateDialog
          products={catalogProducts}
          categories={categories}
          initialCategorySlug={creationCategorySlug}
          onClose={closeProductWorkspace}
          onDone={() => {
            onDone();
            closeProductWorkspace();
          }}
        />
      )}
    </div>
  );
}

function ProductCatalogCard({
  product,
  products,
  categories,
  editing,
  dragging,
  dropTarget,
  dragEnabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleEdit,
  onDone
}: {
  product: Awaited<ReturnType<typeof api.products>>["products"][number];
  products: Awaited<ReturnType<typeof api.products>>["products"];
  categories: Category[];
  editing: boolean;
  dragging: boolean;
  dropTarget: boolean;
  dragEnabled: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onToggleEdit: () => void;
  onDone: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mutation = useMutation({
    mutationFn: async (action: "trash" | "restore") => {
      if (action === "restore") {
        await api.restoreProduct(product.id);
      } else {
        await api.trashProduct(product.id);
      }
    },
    onSuccess: () => {
      setConfirmDelete(false);
      onDone();
    }
  });
  const trashed = Boolean(product.isTrashed);

  return (
    <article
      className={`product-catalog-card${editing ? " is-editing" : ""}${dragging ? " is-dragging" : ""}${dropTarget ? " is-drop-target" : ""}`}
      aria-label={product.name}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="product-catalog-media">
        <img src={getProductCoverImage(product)} alt="" width="320" height="240" />
        {!trashed && dragEnabled && (
          <button
            className="product-drag-handle"
            type="button"
            draggable
            aria-label={`Mută ${product.name}`}
            title="Trage pentru reordonare"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <GripVertical aria-hidden="true" size={19} />
          </button>
        )}
        <div className="product-catalog-badges">
          {trashed ? (
            <StatusBadge tone="danger">În coș</StatusBadge>
          ) : (
            <>
              <StatusBadge tone={product.isAvailable ? "success" : "warning"}>{product.isAvailable ? "Disponibil" : "Indisponibil"}</StatusBadge>
              <StatusBadge tone={product.isPublished ? "brand" : "neutral"}>{product.isPublished ? "Public" : "Ascuns"}</StatusBadge>
            </>
          )}
        </div>
      </div>
      <div className="product-catalog-body">
        <div className="product-catalog-title-row">
          <div>
            <h4>{product.name}</h4>
            <p>{product.shortDescription || product.description || "Fără descriere scurtă"}</p>
          </div>
          <strong className="product-table-price">{product.price.toFixed(2)} lei</strong>
        </div>
        <div className="product-catalog-meta">
          <span>{product.categories.length ? product.categories.map((category) => category.label).join(", ") : "Fără categorie"}</span>
          <span>{trashed && product.trashedAt
            ? `Șters ${new Date(product.trashedAt).toLocaleDateString("ro-RO")}`
            : `${product.images.length} ${product.images.length === 1 ? "imagine" : "imagini"}`}</span>
        </div>
        {trashed ? (
          <button
            className="primary-button"
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("restore")}
          >
            <ArchiveRestore aria-hidden="true" size={18} />
            {mutation.isPending ? "Se restaurează…" : "Restaurează"}
          </button>
        ) : (
          <div className="product-catalog-actions">
            <button className={editing ? "secondary-button" : "primary-button"} type="button" aria-expanded={editing} onClick={onToggleEdit}>
              {editing ? <X aria-hidden="true" size={18} /> : <Pencil aria-hidden="true" size={18} />}
              {editing ? "Închide" : "Editează"}
            </button>
            <button
              className="secondary-button danger-button"
              type="button"
              aria-label={`Șterge ${product.name}`}
              disabled={mutation.isPending}
              onClick={() => {
                mutation.reset();
                setConfirmDelete(true);
              }}
            >
              <Trash2 aria-hidden="true" size={18} />
              Șterge
            </button>
          </div>
        )}
        <div className="dashboard-live-region" aria-live="polite">
          {mutation.error ? `Operațiunea a eșuat: ${mutation.error.message}` : ""}
        </div>
      </div>
      {editing && (
        <ProductEditDialog
          product={product}
          products={products}
          categories={categories}
          onClose={onToggleEdit}
          onArchive={() => {
            onToggleEdit();
            mutation.reset();
            setConfirmDelete(true);
          }}
          onDone={onDone}
        />
      )}
      <ConfirmActionDialog
        open={confirmDelete}
        title={`Ștergi produsul „${product.name}”?`}
        description={(
          <>
            <p>Produsul va dispărea din meniul clienților și va putea fi restaurat din Coș produse.</p>
            {mutation.error && (
              <p className="dashboard-dialog-error" role="alert">
                Ștergerea a eșuat: {mutation.error.message}
              </p>
            )}
          </>
        )}
        confirmLabel="Mută în coș"
        danger
        pending={mutation.isPending}
        onCancel={() => {
          mutation.reset();
          setConfirmDelete(false);
        }}
        onConfirm={() => mutation.mutate("trash")}
      />
    </article>
  );
}

function ProductEditDialog({
  product,
  products,
  categories,
  onClose,
  onArchive,
  onDone
}: {
  product: AdminProduct;
  products: AdminProduct[];
  categories: Category[];
  onClose: () => void;
  onArchive: () => void;
  onDone: () => void;
}) {
  const titleId = `product-edit-title-${product.id}`;

  useProductDialogBehavior(onClose);

  return createPortal(
    <div
      className="product-edit-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="product-edit-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <ProductEditor
          product={product}
          products={products}
          categories={categories}
          titleId={titleId}
          onClose={onClose}
          onArchive={onArchive}
          onDone={onDone}
        />
      </section>
    </div>,
    document.body
  );
}

function ProductCreateDialog({
  products,
  categories,
  initialCategorySlug,
  onClose,
  onDone
}: {
  products: AdminProduct[];
  categories: Category[];
  initialCategorySlug: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const titleId = "product-create-title";

  useProductDialogBehavior(onClose);

  return createPortal(
    <div
      className="product-edit-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="product-edit-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <ProductForm
          products={products}
          categories={categories}
          initialCategorySlug={initialCategorySlug}
          titleId={titleId}
          onClose={onClose}
          onDone={onDone}
        />
      </section>
    </div>,
    document.body
  );
}

function useProductDialogBehavior(onClose: () => void) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
}

function ProductEditor({
  product,
  products,
  categories,
  titleId,
  onClose,
  onArchive,
  onDone
}: {
  product: Awaited<ReturnType<typeof api.products>>["products"][number];
  products: Awaited<ReturnType<typeof api.products>>["products"];
  categories: Category[];
  titleId: string;
  onClose: () => void;
  onArchive: () => void;
  onDone: () => void;
}) {
  const formId = `product-editor-form-${product.id}`;
  const [tab, setTab] = useState<ProductFormTab>("description");
  const [preview, setPreview] = useState<ProductPreviewDraft>(() => productPreviewDraft(product));
  const mutation = useMutation({
    mutationFn: (payload: unknown) => api.updateProduct(product.id, payload),
    onSuccess: onDone
  });

  return (
    <div className="product-editor product-details-shell product-workspace">
      <ProductEditorPreview
        product={product}
        categories={categories}
        draft={preview}
        imageUrl={getProductCoverImage(product)}
        onBack={onClose}
      />
      <section className="product-workspace-main">
        <header className="product-workspace-heading">
          <div>
            <span>Editează produsul</span>
            <h2 id={titleId}>{preview.name || product.name}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Închide editarea produsului" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <ProductDetailsTabs active={tab} onChange={setTab} />
        <div className="product-workspace-scroll">
          <form
            id={formId}
            className="product-editor-form product-details-form product-details-panel"
            hidden={tab === "images"}
            onChange={(event) => setPreview(productPreviewFromForm(event.currentTarget))}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const categorySlug = String(form.get("categorySlug") || "");
              mutation.mutate({
                name: form.get("name"),
                description: form.get("description") || null,
                price: Number(form.get("price")),
                shortDescription: form.get("shortDescription") || null,
                productCode: form.get("productCode") || null,
                isHouseSpecialty: form.get("isHouseSpecialty") === "on",
                allergenCodes: selectedAllergenCodes(form),
                sortOrder: optionalInteger(form.get("sortOrder")) ?? 0,
                categorySlugs: categorySlug ? [categorySlug] : [],
                crossSellProductIds: selectedCrossSellProductIds(form),
                isPublished: form.get("isPublished") === "on",
                isAvailable: form.get("isAvailable") === "on"
              });
            }}
          >
            <ProductDetailsFields product={product} products={products} categories={categories} activeTab={tab} />
          </form>
          <div
            id="product-panel-images"
            className="product-details-panel product-images-panel"
            role="tabpanel"
            aria-labelledby="product-tab-images"
            hidden={tab !== "images"}
          >
            <ProductImageManager product={product} onDone={onDone} />
          </div>
          <div className={`product-workspace-message${mutation.error ? " is-error" : ""}`} role={mutation.error ? "alert" : "status"} aria-live="polite">
            {mutation.error ? `Salvarea a eșuat: ${mutation.error.message}` : mutation.isSuccess ? "Produsul a fost actualizat." : ""}
          </div>
        </div>
        <ProductDetailsActions
          formId={formId}
          pending={mutation.isPending}
          label="Salvează modificările"
          pendingLabel="Se salvează…"
          onCancel={onClose}
          onArchive={onArchive}
        />
      </section>
    </div>
  );
}

function ProductForm({
  products,
  categories,
  initialCategorySlug,
  titleId,
  onClose,
  onDone
}: {
  products: AdminProduct[];
  categories: Category[];
  initialCategorySlug?: string;
  titleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const formId = "product-create-form";
  const [tab, setTab] = useState<ProductFormTab>("description");
  const [draftImages, setDraftImages] = useState<Array<{ file: File; preview: string; error?: string }>>([]);
  const [preview, setPreview] = useState<ProductPreviewDraft>(() => productPreviewDraft(undefined, initialCategorySlug));
  const mutation = useMutation({
    mutationFn: async ({ payload, files }: { payload: unknown; files: File[] }) => {
      const created = await api.createProduct(payload);
      if (files.length) {
        try {
          await api.uploadProductImages(created.product.id, files);
        } catch (error) {
          onDone();
          throw new Error(`Produsul a fost creat, dar imaginile nu au fost încărcate: ${error instanceof Error ? error.message : "încearcă din nou"}`);
        }
      }
      return created;
    },
    onSuccess: onDone
  });
  return (
    <div className="product-editor product-details-shell product-workspace">
      <ProductEditorPreview
        categories={categories}
        draft={preview}
        imageUrl={draftImages.find((item) => !item.error)?.preview}
        onBack={onClose}
      />
      <section className="product-workspace-main">
        <header className="product-workspace-heading">
          <div>
            <span>Produs nou</span>
            <h2 id={titleId}>{preview.name || "Adaugă produs nou"}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Închide adăugarea produsului" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <ProductDetailsTabs active={tab} onChange={setTab} />
        <div className="product-workspace-scroll">
          <form
            id={formId}
            className="product-editor-form product-details-form product-details-panel"
            hidden={tab === "images"}
            onChange={(event) => setPreview(productPreviewFromForm(event.currentTarget))}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const categorySlug = String(form.get("categorySlug") || "");
              const payload = {
                name: form.get("name"),
                description: form.get("description") || null,
                price: Number(form.get("price")),
                shortDescription: form.get("shortDescription") || null,
                productCode: form.get("productCode") || null,
                isHouseSpecialty: form.get("isHouseSpecialty") === "on",
                allergenCodes: selectedAllergenCodes(form),
                sortOrder: optionalInteger(form.get("sortOrder")) ?? 0,
                isAvailable: form.get("isAvailable") === "on",
                isPublished: form.get("isPublished") === "on",
                categorySlugs: categorySlug ? [categorySlug] : [],
                crossSellProductIds: selectedCrossSellProductIds(form)
              };
              mutation.mutate({ payload, files: draftImages.filter((item) => !item.error).map((item) => item.file) });
            }}
          >
            <ProductDetailsFields products={products} categories={categories} activeTab={tab} initialCategorySlug={initialCategorySlug} />
          </form>
          <div
            id="product-panel-images"
            className="product-details-panel product-images-panel"
            role="tabpanel"
            aria-labelledby="product-tab-images"
            hidden={tab !== "images"}
          >
            <ProductDraftImagePicker files={draftImages} onFilesChange={setDraftImages} />
          </div>
          <div className={`product-workspace-message${mutation.error ? " is-error" : ""}`} role={mutation.error ? "alert" : "status"} aria-live="polite">
            {mutation.error ? `Nu am putut salva produsul: ${mutation.error.message}` : ""}
          </div>
        </div>
        <ProductDetailsActions
          formId={formId}
          pending={mutation.isPending}
          label="Adaugă produs"
          pendingLabel="Se creează…"
          onCancel={onClose}
        />
      </section>
    </div>
  );
}

type AdminProduct = Awaited<ReturnType<typeof api.products>>["products"][number];
type ProductFormTab = "description" | "allergens" | "images" | "cross-sells";
type ProductDraftImage = { file: File; preview: string; error?: string };

function productPreviewDraft(product?: AdminProduct, initialCategorySlug = ""): ProductPreviewDraft {
  return {
    name: product?.name ?? "",
    shortDescription: product?.shortDescription ?? "",
    price: product?.price ?? null,
    categorySlug: productCategorySlug(product) || initialCategorySlug,
    productCode: product?.productCode ?? "",
    isHouseSpecialty: product?.isHouseSpecialty ?? false,
    isAvailable: product?.isAvailable ?? true,
    isPublished: product?.isPublished ?? true
  };
}

function productPreviewFromForm(formElement: HTMLFormElement): ProductPreviewDraft {
  const form = new FormData(formElement);
  const rawPrice = String(form.get("price") ?? "").trim();
  const parsedPrice = rawPrice ? Number(rawPrice) : null;

  return {
    name: String(form.get("name") ?? ""),
    shortDescription: String(form.get("shortDescription") ?? ""),
    price: parsedPrice != null && Number.isFinite(parsedPrice) ? parsedPrice : null,
    categorySlug: String(form.get("categorySlug") ?? ""),
    productCode: String(form.get("productCode") ?? ""),
    isHouseSpecialty: form.get("isHouseSpecialty") === "on",
    isAvailable: form.get("isAvailable") === "on",
    isPublished: form.get("isPublished") === "on"
  };
}

function selectedAllergenCodes(form: FormData) {
  return EU_ALLERGENS
    .filter((allergen) => form.get(`allergen-${allergen.code}`) === "on")
    .map((allergen) => allergen.code);
}

function selectedCrossSellProductIds(form: FormData) {
  return [...new Set(form.getAll("crossSellProductIds").map((value) => String(value)).filter(Boolean))];
}

function optionalInteger(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function productCategorySlug(product?: AdminProduct) {
  return product?.categories[0]?.slug ?? "";
}

function productDetailedDescription(product?: AdminProduct) {
  const description = product?.description?.trim();
  if (!description) return "";
  const shortDescription = product?.shortDescription?.trim();
  return description === shortDescription ? "" : product?.description ?? "";
}

function groupProductsByCategory(products: AdminProduct[], categories: Category[]) {
  const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));
  const groups = new Map<string, { key: string; label: string; sortOrder: number; products: AdminProduct[] }>();

  products.forEach((product) => {
    const productCategory = product.categories[0];
    const category = productCategory ? categoriesBySlug.get(productCategory.slug) ?? productCategory : null;
    const key = category?.slug || "fara-categorie";

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: category?.label ?? "Fără categorie",
        sortOrder: category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        products: []
      });
    }

    groups.get(key)?.products.push(product);
  });

  return [...groups.values()]
    .sort((first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label, "ro"))
    .map((group) => ({
      ...group,
      products: [...group.products].sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, "ro"))
    }));
}

function ProductDetailsTabs({ active, onChange }: { active: ProductFormTab; onChange: (tab: ProductFormTab) => void }) {
  const tabs: Array<{ key: ProductFormTab; label: string; icon: ReactNode }> = [
    { key: "description", label: "Informații de bază", icon: <Info aria-hidden="true" size={20} /> },
    { key: "allergens", label: "Ingrediente & alergeni", icon: <ShieldAlert aria-hidden="true" size={20} /> },
    { key: "cross-sells", label: "Recomandări", icon: <Sparkles aria-hidden="true" size={20} /> },
    { key: "images", label: "Imagini & publicare", icon: <Images aria-hidden="true" size={20} /> }
  ];

  return (
    <div className="product-details-tabs" role="tablist" aria-label="Secțiuni produs">
      {tabs.map((tab) => (
        <button
          id={`product-tab-${tab.key}`}
          key={tab.key}
          type="button"
          role="tab"
          aria-controls={`product-panel-${tab.key}`}
          aria-selected={active === tab.key}
          className={active === tab.key ? "is-active" : ""}
          onClick={() => onChange(tab.key)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function ProductDetailsFields({
  product,
  products,
  categories,
  activeTab,
  initialCategorySlug = ""
}: {
  product?: AdminProduct;
  products: AdminProduct[];
  categories: Category[];
  activeTab: ProductFormTab;
  initialCategorySlug?: string;
}) {
  const selectedCategory = productCategorySlug(product) || initialCategorySlug;

  return (
    <>
      <div
        id="product-panel-description"
        className="product-details-tab-content product-basic-information-tab"
        role="tabpanel"
        aria-labelledby="product-tab-description"
        hidden={activeTab !== "description"}
      >
        <header className="product-tab-intro">
          <h3>Informații de bază</h3>
          <p>Gestionează informațiile principale, prețul și felul în care produsul apare în meniu.</p>
        </header>

        <ProductDetailsSection title="Descrierea produsului">
          <label className="product-detail-field">
            <span>Nume produs *</span>
            <input name="name" autoComplete="off" defaultValue={product?.name ?? ""} placeholder="Nume" required />
          </label>
          <label className="product-detail-field product-detail-wide">
            <span>Descriere detaliată</span>
            <textarea name="description" rows={6} defaultValue={productDetailedDescription(product)} placeholder="Scrie descrierea produsului" />
          </label>
        </ProductDetailsSection>

        <ProductDetailsSection title="Specificații">
          <label className="product-detail-field">
            <span>Descriere scurtă / gramaj</span>
            <input name="shortDescription" defaultValue={product?.shortDescription ?? ""} placeholder="ex. 4 mici, cartofi, muștar" />
          </label>
          <label className="product-detail-field">
            <span>Ordine afișare</span>
            <input name="sortOrder" type="number" inputMode="numeric" defaultValue={product?.sortOrder ?? 0} placeholder="0" />
            <small>Numerele mai mici apar primele în meniu.</small>
          </label>
          <label className="product-detail-field">
            <span>Cod produs (opțional)</span>
            <input name="productCode" autoComplete="off" maxLength={40} defaultValue={product?.productCode ?? ""} placeholder="ex. MICI-PVO-90" />
            <small>Cod intern folosit pentru identificare.</small>
          </label>
        </ProductDetailsSection>

        <ProductDetailsSection title="Colecție">
          <label className="product-detail-field product-detail-wide">
            <span>Categorie *</span>
            <select name="categorySlug" defaultValue={selectedCategory} required={categories.length > 0}>
              <option value="">Alege categoria</option>
              {categories.map((category) => (
                <option value={category.slug} key={category.slug}>{category.label}</option>
              ))}
            </select>
          </label>
        </ProductDetailsSection>

        <ProductDetailsSection title="Preț">
          <label className="product-detail-field product-detail-wide">
            <span>Preț *</span>
            <input name="price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={product?.price ?? ""} placeholder="0.00" required />
          </label>
        </ProductDetailsSection>

        <ProductDetailsSection title="Disponibilitate">
          <ProductAvailabilityToggle name="isAvailable" defaultChecked={product?.isAvailable ?? true} label="Acest produs este disponibil pentru vânzare" />
          <ProductAvailabilityToggle name="isPublished" defaultChecked={product?.isPublished ?? true} label="Acest produs este vizibil în meniu" />
          <ProductAvailabilityToggle name="isHouseSpecialty" defaultChecked={product?.isHouseSpecialty ?? false} label="Marchează produsul ca specialitatea casei" />
        </ProductDetailsSection>
      </div>

      <div
        id="product-panel-allergens"
        className="product-details-tab-content product-allergens-tab"
        role="tabpanel"
        aria-labelledby="product-tab-allergens"
        hidden={activeTab !== "allergens"}
      >
        <header className="product-tab-intro">
          <h3>Ingrediente & alergeni</h3>
          <p>Selectează clar alergenii care trebuie afișați clientului.</p>
        </header>
        <ProductDetailsSection title="Alergeni">
          <fieldset className="allergen-checkboxes" aria-describedby="allergen-help">
            <legend>Legendă alergeni (UE)</legend>
            <p id="allergen-help">Bifează alergenii prezenți în produs. Debifează un alergen pentru a-l elimina din meniul public.</p>
            <div className="allergen-checkbox-grid">
              {EU_ALLERGENS.map((allergen) => (
                <label key={allergen.code}>
                  <input
                    name={`allergen-${allergen.code}`}
                    type="checkbox"
                    defaultChecked={product?.allergenCodes?.includes(allergen.code) ?? false}
                  />
                  <span><strong>{allergen.code}. {allergen.label}</strong><small>{allergen.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        </ProductDetailsSection>
      </div>

      <div
        id="product-panel-cross-sells"
        className="product-details-tab-content product-cross-sells-tab"
        role="tabpanel"
        aria-labelledby="product-tab-cross-sells"
        hidden={activeTab !== "cross-sells"}
      >
        <header className="product-tab-intro">
          <h3>Produse recomandate</h3>
          <p>Alege produsele care vor fi sugerate clientului împreună cu acest produs.</p>
        </header>
        <ProductDetailsSection title="Recomandări">
          <ProductCrossSellSelector product={product} products={products} categories={categories} />
        </ProductDetailsSection>
      </div>
    </>
  );
}

function ProductCrossSellSelector({
  product,
  products,
  categories
}: {
  product?: AdminProduct;
  products: AdminProduct[];
  categories: Category[];
}) {
  const candidates = useMemo(
    () => products
      .filter((candidate) => !candidate.isTrashed && candidate.id !== product?.id)
      .sort((first, second) =>
        (first.categories[0]?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (second.categories[0]?.sortOrder ?? Number.MAX_SAFE_INTEGER)
        || first.sortOrder - second.sortOrder
        || first.name.localeCompare(second.name, "ro")
      ),
    [product?.id, products]
  );
  const categoryGroups = useMemo(() => {
    const sortedCategories = [...categories]
      .sort((first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label, "ro"));
    const knownSlugs = new Set(sortedCategories.map((category) => category.slug));
    const groups = sortedCategories.map((category) => ({
      key: category.slug,
      label: category.label,
      products: candidates.filter((candidate) => candidate.categories[0]?.slug === category.slug)
    }));
    const extraCategories = new Map<string, Category>();

    candidates.forEach((candidate) => {
      const category = candidate.categories[0];
      if (category && !knownSlugs.has(category.slug)) extraCategories.set(category.slug, category);
    });

    extraCategories.forEach((category) => {
      groups.push({
        key: category.slug,
        label: category.label,
        products: candidates.filter((candidate) => candidate.categories[0]?.slug === category.slug)
      });
    });

    const uncategorized = candidates.filter((candidate) => candidate.categories.length === 0);
    if (uncategorized.length) {
      groups.push({ key: "uncategorized", label: "Fără categorie", products: uncategorized });
    }

    return groups;
  }, [candidates, categories]);

  return (
    <fieldset className="cross-sell-selector" aria-describedby="cross-sell-help">
      <legend>Produse recomandate</legend>
      <p id="cross-sell-help">
        Bifează produsele care vor fi recomandate clientului când acest produs se află în coș.
      </p>
      <div className="cross-sell-category-groups">
        {categoryGroups.map((group) => (
          <section className="cross-sell-category-group" key={group.key}>
            <header>
              <h4>{group.label}</h4>
              <span>{group.products.length} {group.products.length === 1 ? "produs" : "produse"}</span>
            </header>
            {group.products.length > 0 ? (
              <div className="cross-sell-checkbox-grid">
                {group.products.map((candidate) => (
                  <label key={candidate.id}>
                    <input
                      name="crossSellProductIds"
                      type="checkbox"
                      value={candidate.id}
                      defaultChecked={product?.crossSellProductIds?.includes(candidate.id) ?? false}
                    />
                    <img src={getProductCoverImage(candidate)} alt="" width="52" height="52" />
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.price.toFixed(2)} lei</small>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="cross-sell-category-empty">Nu există produse disponibile în această categorie.</p>
            )}
          </section>
        ))}
      </div>
      {!categoryGroups.length && (
        <p className="cross-sell-empty">Adaugă încă un produs pentru a-l putea selecta ca recomandare.</p>
      )}
    </fieldset>
  );
}

function ProductDetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="product-details-section">
      <h3>{title}</h3>
      <div className="product-details-section-fields">{children}</div>
    </section>
  );
}

function ProductAvailabilityToggle({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="product-availability-toggle">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} />
      <span aria-hidden="true"><Check size={18} /></span>
      <strong>{label}</strong>
    </label>
  );
}

function ProductDetailsActions({
  formId,
  pending,
  label,
  pendingLabel,
  onCancel,
  onArchive
}: {
  formId: string;
  pending: boolean;
  label: string;
  pendingLabel: string;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  return (
    <div className={`product-details-actions${onArchive ? " has-archive-action" : ""}`}>
      {onArchive && (
        <button className="secondary-button danger-button product-archive-button" type="button" disabled={pending} onClick={onArchive}>
          <Trash2 aria-hidden="true" size={18} />
          Mută în coș produse
        </button>
      )}
      <button className="secondary-button" type="button" disabled={pending} onClick={onCancel}>
        Anulează
      </button>
      <button className="primary-button product-save-button" type="submit" form={formId} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

function ProductDraftImagePicker({
  files,
  onFilesChange
}: {
  files: ProductDraftImage[];
  onFilesChange: (files: ProductDraftImage[]) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const filesRef = useRef(files);
  const remainingSlots = Math.max(0, PRODUCT_IMAGE_MAX_IMAGES - files.length);
  const accepted = useMemo(() => new Set(PRODUCT_IMAGE_ACCEPTED_TYPES), []);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  function select(selected: FileList | null) {
    if (!selected) return;
    const next = [...selected].slice(0, remainingSlots).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      error: !accepted.has(file.type)
        ? "Formatul imaginii nu este acceptat."
        : file.size > PRODUCT_IMAGE_MAX_BYTES
          ? "Imaginea depășește limita de 10 MB."
          : undefined
    }));
    setMessage(selected.length > remainingSlots ? `Poți încărca maximum ${PRODUCT_IMAGE_MAX_IMAGES} imagini.` : "");
    onFilesChange([...files, ...next]);
  }

  function remove(index: number) {
    const removed = files[index];
    if (removed) URL.revokeObjectURL(removed.preview);
    onFilesChange(files.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <section className="product-image-manager product-media-manager product-draft-images">
      <div className="product-image-manager-head product-media-manager-head">
        <div>
          <h3>Imagini produs</h3>
          <p>Încarcă imagini JPG, PNG sau WEBP.</p>
          <p>Imaginile sunt încărcate după salvarea produsului.</p>
        </div>
        <span>{files.length}/{PRODUCT_IMAGE_MAX_IMAGES}</span>
      </div>

      <div className="product-image-list product-media-grid">
        <label
          className={`product-image-drop product-media-upload${dragActive ? " is-dragging" : ""}${remainingSlots === 0 ? " is-disabled" : ""}`}
          onDragEnter={() => setDragActive(true)}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            select(event.dataTransfer.files);
          }}
        >
          <ImagePlus size={30} />
          <span><strong>Click pentru upload</strong><em>sau trage aici</em></span>
          <small>{remainingSlots > 0 ? `${remainingSlots} ${remainingSlots === 1 ? "loc liber" : "locuri libere"}` : "Galerie completă"}</small>
          <input className="visually-hidden" type="file" multiple accept={PRODUCT_IMAGE_ACCEPTED_TYPES.join(",")} onChange={(event) => select(event.target.files)} disabled={remainingSlots === 0} />
        </label>

        {files.map((item, index) => (
          <article key={item.preview} className={`product-media-tile product-media-pending${item.error ? " has-error" : ""}`}>
            <img src={item.preview} alt="" />
            <b className="product-media-pending-badge">{item.error || "Pregătită"}</b>
            <button type="button" className="product-media-delete" onClick={() => remove(index)} aria-label={`Elimină imaginea pregătită ${index + 1}`}>
              <Trash2 size={28} />
            </button>
          </article>
        ))}
      </div>
      {message && <p className="field-hint" role="status">{message}</p>}
    </section>
  );
}

export function CategoriesPanel({ categories, onDone }: { categories: Category[]; onDone: () => void }) {
  const [section, setSection] = useState<"list" | "create">("list");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<string | null>(null);
  const sortedCategories = useMemo(
    () => [...categories].sort((first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label, "ro")),
    [categories]
  );
  const orderedCategories = useMemo(() => {
    if (!localOrder) return sortedCategories;
    const categoriesById = new Map(sortedCategories.map((category) => [category.id, category]));
    const locallyOrdered = localOrder
      .map((id) => categoriesById.get(id))
      .filter((category): category is Category => Boolean(category));
    const locallyOrderedIds = new Set(locallyOrdered.map((category) => category.id));
    return [...locallyOrdered, ...sortedCategories.filter((category) => !locallyOrderedIds.has(category.id))];
  }, [localOrder, sortedCategories]);
  const reorderMutation = useMutation({
    mutationFn: (categoryIds: string[]) => api.reorderCategories(categoryIds),
    onSuccess: onDone,
    onError: () => {
      setLocalOrder(null);
      onDone();
    }
  });

  function persistCategoryOrder(nextIds: string[]) {
    const currentIds = orderedCategories.map((category) => category.id);
    if (nextIds.every((id, index) => id === currentIds[index])) return;
    setLocalOrder(nextIds);
    reorderMutation.mutate(nextIds);
  }

  function dropCategory(targetCategoryId: string, event: DragEvent<HTMLTableRowElement>) {
    event.preventDefault();
    const sourceCategoryId = event.dataTransfer.getData("text/plain") || draggedCategoryId;
    const currentIds = orderedCategories.map((category) => category.id);
    const sourceIndex = sourceCategoryId ? currentIds.indexOf(sourceCategoryId) : -1;
    const targetIndex = currentIds.indexOf(targetCategoryId);
    setDraggedCategoryId(null);
    setDropTargetCategoryId(null);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const nextIds = [...currentIds];
    const [movedId] = nextIds.splice(sourceIndex, 1);
    nextIds.splice(Math.min(targetIndex, nextIds.length), 0, movedId);
    persistCategoryOrder(nextIds);
  }

  function moveCategory(categoryId: string, direction: -1 | 1) {
    const currentIds = orderedCategories.map((category) => category.id);
    const currentIndex = currentIds.indexOf(categoryId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentIds.length) return;
    const nextIds = [...currentIds];
    [nextIds[currentIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[currentIndex]];
    persistCategoryOrder(nextIds);
  }

  return (
    <div className="categories-panel">
      <DashboardPanelHeader
        eyebrow="Catalog"
        title={section === "list" ? "Categorii existente" : "Adaugă categorie nouă"}
        description={section === "list"
          ? "Organizează meniul și controlează ordinea în care apar categoriile."
          : "Creează o categorie nouă pentru produsele din meniu."}
        actions={
          <DashboardPanelTabs
            label="Secțiuni categorii"
            value={section}
            options={[
              { value: "list", label: "Categorii existente", icon: <List aria-hidden="true" size={19} /> },
              { value: "create", label: "Adaugă categorie", icon: <Plus aria-hidden="true" size={19} /> }
            ]}
            onChange={setSection}
          />
        }
      />

      {section === "create" ? (
        <section className="category-create-section">
          <CategoryForm onDone={() => {
            onDone();
            setSection("list");
          }} />
        </section>
      ) : (
        <section>
          {categories.length > 0 && (
            <p className="category-order-help" id="category-order-help">
              Trage categoriile de mâner pentru a le ordona. Din tastatură, focalizează mânerul și folosește săgețile sus sau jos.
            </p>
          )}
          <div className="categories-table-wrap">
            <table className="categories-table">
              <thead>
                <tr>
                  <th scope="col">Categorie</th>
                  <th scope="col">Identificator</th>
                  <th scope="col">Poziție</th>
                  <th scope="col">Stare</th>
                  <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
                </tr>
              </thead>
              <tbody>
                {orderedCategories.map((category, index) => (
                  <CategoryTableRows
                    key={category.id}
                    category={category}
                    displayPosition={index + 1}
                    editing={editingCategoryId === category.id}
                    dragging={draggedCategoryId === category.id}
                    dropTarget={dropTargetCategoryId === category.id}
                    dragDisabled={reorderMutation.isPending || categories.length < 2}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", category.id);
                      setDraggedCategoryId(category.id);
                    }}
                    onDragOver={(event) => {
                      if (reorderMutation.isPending || !draggedCategoryId || draggedCategoryId === category.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetCategoryId(category.id);
                    }}
                    onDrop={(event) => dropCategory(category.id, event)}
                    onDragEnd={() => {
                      setDraggedCategoryId(null);
                      setDropTargetCategoryId(null);
                    }}
                    onKeyboardMove={(direction) => moveCategory(category.id, direction)}
                    onToggleEdit={() => setEditingCategoryId((current) => current === category.id ? null : category.id)}
                    onDone={onDone}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!categories.length && <EmptyState title="Nu există categorii" description="Adaugă prima categorie pentru a organiza produsele." />}
          <div className="dashboard-live-region" aria-live="polite">
            {reorderMutation.isPending
              ? "Se salvează ordinea categoriilor…"
              : reorderMutation.error
                ? `Ordinea nu a putut fi salvată: ${reorderMutation.error.message}`
                : reorderMutation.isSuccess
                  ? "Ordinea categoriilor a fost salvată."
                  : ""}
          </div>
          <p className="products-count" aria-live="polite">{categories.length} {categories.length === 1 ? "categorie afișată" : "categorii afișate"}</p>
        </section>
      )}
    </div>
  );
}

function CategoryTableRows({
  category,
  displayPosition,
  editing,
  dragging,
  dropTarget,
  dragDisabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyboardMove,
  onToggleEdit,
  onDone
}: {
  category: Category;
  displayPosition: number;
  editing: boolean;
  dragging: boolean;
  dropTarget: boolean;
  dragDisabled: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
  onDrop: (event: DragEvent<HTMLTableRowElement>) => void;
  onDragEnd: () => void;
  onKeyboardMove: (direction: -1 | 1) => void;
  onToggleEdit: () => void;
  onDone: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (payload: unknown) => api.updateCategory(category.id, payload),
    onSuccess: onDone
  });

  return (
    <>
      <tr
        className={`${editing ? "is-editing" : ""}${dragging ? " is-dragging" : ""}${dropTarget ? " is-drop-target" : ""}`}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <td data-label="Categorie">
          <div className="category-name-with-drag">
            <button
              className="category-drag-handle"
              type="button"
              draggable={!dragDisabled}
              disabled={dragDisabled}
              aria-describedby="category-order-help"
              aria-label={`Mută ${category.label}`}
              title="Trage pentru reordonare sau folosește săgețile sus/jos"
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                onKeyboardMove(event.key === "ArrowUp" ? -1 : 1);
              }}
            >
              <GripVertical aria-hidden="true" size={19} />
            </button>
            <strong className="category-table-name">{category.label}</strong>
          </div>
        </td>
        <td data-label="Identificator"><code className="category-table-slug">{category.slug}</code></td>
        <td data-label="Poziție"><strong className="category-table-order">{displayPosition}</strong></td>
        <td data-label="Stare"><StatusBadge tone={category.isActive ? "success" : "warning"}>{category.isActive ? "Activă" : "Inactivă"}</StatusBadge></td>
        <td className="category-table-actions">
          <button className={editing ? "secondary-button" : "primary-button"} type="button" aria-expanded={editing} onClick={onToggleEdit}>
            {editing ? <X aria-hidden="true" size={18} /> : <Pencil aria-hidden="true" size={18} />}
            {editing ? "Închide" : "Editează"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="category-editor-row">
          <td colSpan={5}>
            <form
              className="category-editor-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                mutation.mutate({
                  label: form.get("label"),
                  sortOrder: Number(form.get("sortOrder")),
                  isActive: form.get("isActive") === "on"
                });
              }}
            >
              <div className="product-editor-heading"><h3>Editează categoria</h3><p>Actualizează numele, ordinea și vizibilitatea categoriei.</p></div>
              <label className="dashboard-field"><span>Numele categoriei</span><input name="label" defaultValue={category.label} required /></label>
              <label className="dashboard-field"><span>Ordine afișare</span><input name="sortOrder" type="number" inputMode="numeric" defaultValue={category.sortOrder} required /></label>
              <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={category.isActive} /> Categorie activă</label>
              <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Se salvează…" : "Salvează modificările"}</button>
              <div className="dashboard-live-region" aria-live="polite">{mutation.error ? `Salvarea a eșuat: ${mutation.error.message}` : mutation.isSuccess ? "Categoria a fost actualizată." : ""}</div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function CategoryForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      className="admin-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api.createCategory({ label: form.get("label"), sortOrder: Number(form.get("sortOrder") || 99) });
        event.currentTarget.reset();
        onDone();
      }}
    >
      <h3>Categorie nouă</h3>
      <label className="dashboard-field"><span>Numele categoriei</span><input name="label" required /></label>
      <label className="dashboard-field"><span>Ordine afișare</span><input name="sortOrder" type="number" inputMode="numeric" /></label>
      <button className="primary-button">Adaugă categorie</button>
    </form>
  );
}

function UsersPanel({ users, onDone }: { users: User[]; onDone: () => void }) {
  const [section, setSection] = useState<"list" | "create">("list");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [inviteUser, setInviteUser] = useState<User | null>(null);
  const [copied, setCopied] = useState(false);

  const visibleUsers = users.filter((managedUser) => managedUser.role !== "shift_staff");
  const invite = inviteUser ? buildInvite(inviteUser) : null;

  return (
    <div className="management-panel users-admin">
      <DashboardPanelHeader
        eyebrow="Administrare"
        title={section === "list" ? "Personal existent" : "Adaugă persoană nouă"}
        description={section === "list"
          ? "Gestionează rolurile și accesul pentru echipă."
          : "Creează un cont și pregătește invitația de conectare."}
        actions={
          <DashboardPanelTabs
            label="Secțiuni personal"
            value={section}
            options={[
              { value: "list", label: "Personal existent", icon: <List aria-hidden="true" size={19} /> },
              { value: "create", label: "Adaugă persoană", icon: <Plus aria-hidden="true" size={19} /> }
            ]}
            onChange={setSection}
          />
        }
      />

      {section === "create" ? (
        <section className="management-create-section" aria-labelledby="user-create-title">
          <UserCreateForm
            onCreated={(createdUser) => {
              setInviteUser(createdUser);
              setCopied(false);
              setSection("list");
              onDone();
            }}
          />
        </section>
      ) : (
        <section className="management-list-section">
          {invite && (
            <div className="invite-box management-invite-box">
              <strong>Invitație pregătită</strong>
              <p>{inviteUser?.name || inviteUser?.email || inviteUser?.phone}</p>
              <input readOnly value={invite.loginUrl} />
              <div className="invite-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={async () => {
                    await copyText(invite.loginUrl);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copiat" : "Copiază link"}
                </button>
                <a className="primary-button" href={invite.whatsappUrl} target="_blank" rel="noreferrer">Trimite pe WhatsApp</a>
              </div>
            </div>
          )}
          <div className="admin-data-table-wrap">
            <table className="admin-data-table users-table">
              <thead>
                <tr>
                  <th scope="col">Utilizator</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Contact</th>
                  <th scope="col">Stare</th>
                  <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((managedUser) => (
                  <UserTableRows
                    key={managedUser.id}
                    managedUser={managedUser}
                    editing={editingUserId === managedUser.id}
                    onToggleEdit={() => setEditingUserId((current) => current === managedUser.id ? null : managedUser.id)}
                    onCloseEdit={() => setEditingUserId(null)}
                    onInvite={() => {
                      setInviteUser(managedUser);
                      setCopied(false);
                    }}
                    onDone={onDone}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!visibleUsers.length && <EmptyState title="Nu există utilizatori" description="Adaugă prima persoană pentru a configura accesul în panou." />}
          <p className="products-count" aria-live="polite">{visibleUsers.length} {visibleUsers.length === 1 ? "utilizator afișat" : "utilizatori afișați"}</p>
        </section>
      )}
    </div>
  );
}

function UserCreateForm({ onCreated }: { onCreated: (user: User) => void }) {
  const [newUserRole, setNewUserRole] = useState<User["role"]>("store_manager");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: unknown) => api.createUser(payload)
  });

  const isStaffRole = newUserRole !== "customer";

  return (
    <form
      className="admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const phone = String(form.get("phone") || "").trim();
        const email = String(form.get("email") || "").trim();
        mutation.mutate({
          phone: phone || undefined,
          name: String(form.get("name") || ""),
          email: email || undefined,
          role: form.get("role") as User["role"],
          password: String(form.get("password") || "") || undefined,
          isActive: form.get("isActive") === "on"
        }, {
          onSuccess: (response) => {
            formElement.reset();
            setNewUserRole("store_manager");
            setShowCreatePassword(false);
            onCreated(response.user);
          }
        });
      }}
    >
      <h3 id="user-create-title">Creează / invită utilizator</h3>
      <label className="dashboard-field"><span>Telefon</span><input name="phone" type="tel" autoComplete="tel" placeholder={isStaffRole ? "Opțional pentru personal" : "+40…"} required={!isStaffRole} /></label>
      <label className="dashboard-field"><span>Nume complet</span><input name="name" autoComplete="name" /></label>
      <label className="dashboard-field"><span>Adresă de email</span><input name="email" type="email" autoComplete="email" placeholder={isStaffRole ? "Obligatorie pentru personal" : "Opțională"} required={isStaffRole} /></label>
      {isStaffRole && (
        <label className="dashboard-field"><span>Parolă inițială</span><div className="password-field">
          <input name="password" type={showCreatePassword ? "text" : "password"} placeholder="Parolă staff" required minLength={6} />
          <button className="icon-button password-toggle" type="button" onClick={() => setShowCreatePassword((value) => !value)} aria-label={showCreatePassword ? "Ascunde parola" : "Arată parola"}>
            {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div></label>
      )}
      <label className="dashboard-field"><span>Rol</span><select
        name="role"
        value={newUserRole}
        onChange={(event) => setNewUserRole(event.target.value as User["role"])}
      >
        <option value="customer">Client</option>
        <option value="admin">Administrator</option>
        <option value="store_manager">Manager magazin</option>
        <option value="kitchen">Bucătărie</option>
        <option value="deliverer">Curier</option>
      </select></label>
      <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked /> Activ</label>
      <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Se creează…" : "Creează utilizator"}</button>
      <div className="dashboard-live-region" aria-live="polite">{mutation.error ? `Crearea a eșuat: ${mutation.error.message}` : ""}</div>
    </form>
  );
}

function UserTableRows({
  managedUser,
  editing,
  onToggleEdit,
  onCloseEdit,
  onInvite,
  onDone
}: {
  managedUser: User;
  editing: boolean;
  onToggleEdit: () => void;
  onCloseEdit: () => void;
  onInvite: () => void;
  onDone: () => void;
}) {
  const [showEditPasswords, setShowEditPasswords] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: Partial<User> & {
      password?: string;
    }) => api.updateUser(managedUser.id, payload),
    onSuccess: () => {
      onDone();
      onCloseEdit();
      setShowEditPasswords(false);
    }
  });

  const contact = [managedUser.email, managedUser.phone].filter(Boolean).join(" · ") || "Fără contact";

  return (
    <>
      <tr className={editing ? "is-editing" : ""}>
        <td data-label="Utilizator">
          <div className="table-identity">
            <strong>{managedUser.name || "Utilizator fără nume"}</strong>
            <small>{contact}</small>
          </div>
        </td>
        <td data-label="Rol"><StatusBadge tone={toneForUserRole(managedUser.role)}>{adminRoleLabels[managedUser.role] ?? "Personal"}</StatusBadge></td>
        <td data-label="Contact"><span className="table-muted-text">{contact}</span></td>
        <td data-label="Stare"><StatusBadge tone={managedUser.isActive ? "success" : "warning"}>{managedUser.isActive ? "Activ" : "Inactiv"}</StatusBadge></td>
        <td className="admin-data-table-actions">
          <div className="table-action-group">
            <button className={editing ? "secondary-button" : "primary-button"} type="button" aria-expanded={editing} onClick={onToggleEdit}>
              {editing ? <X aria-hidden="true" size={18} /> : <Pencil aria-hidden="true" size={18} />}
              {editing ? "Închide" : "Editează"}
            </button>
            <button className="secondary-button" type="button" onClick={onInvite}>Invită</button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="admin-editor-row">
          <td colSpan={5}>
            <form
              className="admin-inline-editor user-editor-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                mutation.mutate({
                  name: String(form.get("name") || ""),
                  email: String(form.get("email") || ""),
                  role: form.get("role") as User["role"],
                  password: String(form.get("password") || "") || undefined,
                  isActive: form.get("isActive") === "on"
                });
              }}
            >
              <div className="product-editor-heading"><h3>Editează utilizatorul</h3><p>Actualizează rolul, datele de contact și accesul în panou.</p></div>
              <label className="dashboard-field"><span>Nume complet</span><input name="name" defaultValue={managedUser.name ?? ""} /></label>
              <label className="dashboard-field"><span>Adresă de email</span><input name="email" type="email" defaultValue={managedUser.email ?? ""} placeholder="Email intern opțional" /></label>
              {managedUser.role !== "customer" && (
                <label className="dashboard-field"><span>Parolă nouă</span><div className="password-field compact-password-field">
                  <input name="password" type={showEditPasswords ? "text" : "password"} placeholder="Parolă nouă" minLength={6} />
                  <button className="icon-button password-toggle" type="button" onClick={() => setShowEditPasswords((value) => !value)} aria-label={showEditPasswords ? "Ascunde parola" : "Arată parola"}>
                    {showEditPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div></label>
              )}
              <label className="dashboard-field"><span>Rol</span><select name="role" defaultValue={managedUser.role}>
                <option value="customer">Client</option>
                <option value="admin">Administrator</option>
                <option value="store_manager">Manager magazin</option>
                <option value="kitchen">Bucătărie</option>
                <option value="deliverer">Curier</option>
              </select></label>
              <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={managedUser.isActive} /> Activ</label>
              <div className="editor-button-row">
                <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Se salvează…" : "Salvează modificările"}</button>
              </div>
              <div className="dashboard-live-region" aria-live="polite">{mutation.error ? `Salvarea a eșuat: ${mutation.error.message}` : mutation.isSuccess ? "Utilizatorul a fost actualizat." : ""}</div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function toneForUserRole(role: User["role"]): "neutral" | "brand" | "warning" | "success" | "danger" {
  if (role === "admin") return "brand";
  if (role === "store_manager") return "success";
  if (role === "customer") return "neutral";
  return "warning";
}

function buildInvite(user: User) {
  const returnTo = user.role === "customer" ? "/account" : "/admin";
  const loginPath = user.role === "customer" ? "/login" : "/admin-login";
  const phoneParam = user.role === "customer" && user.phone ? `&phone=${encodeURIComponent(user.phone)}` : "";
  const origin = user.role === "customer" ? STOREFRONT_URL : window.location.origin;
  const loginUrl = `${origin}${loginPath}?returnTo=${encodeURIComponent(returnTo)}${phoneParam}`;
  const loginHint = user.role === "customer" ? "cu numărul tău de telefon" : `cu emailul ${user.email || user.phone || "setat de admin"} și parola primită`;
  const text = `Ai fost invitat în Mici de Negoești. Intră aici ${loginHint}: ${loginUrl}`;
  const digits = (user.phone || "").replace(/\D/g, "");

  return {
    loginUrl,
    whatsappUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
  };
}

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
  }
}

function parseAdminDeliveryZones(raw?: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((zone, index) => ({
        id: String(zone.id || `zone-${index + 1}`),
        name: String(zone.name || `Zona ${index + 1}`),
        price: Number.isFinite(Number(zone.price)) && Number(zone.price) >= 0 ? Number(zone.price) : 0,
        isActive: zone.isActive !== false,
        sortOrder: Number.isFinite(Number(zone.sortOrder)) ? Number(zone.sortOrder) : index,
        description: zone.description ? String(zone.description) : null
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function zoneIdFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "zona"}-${Date.now().toString(36)}`;
}

export function DeliveryZonesPanel({ settings, onDone }: { settings: Record<string, string>; onDone: () => void }) {
  const zones = parseAdminDeliveryZones(settings.deliveryZones);
  const [minimumDeliveryOrderAmount, setMinimumDeliveryOrderAmount] = useState(
    String(Math.max(0, Number(settings.minimumDeliveryOrderAmount) || 0))
  );
  const [section, setSection] = useState<"list" | "create">("list");
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneToDelete, setZoneToDelete] = useState<DeliveryZone | null>(null);
  const [feedback, setFeedback] = useState("");
  const mutation = useMutation({
    mutationFn: (nextZones: DeliveryZone[]) => api.updateSettings({ deliveryZones: JSON.stringify(nextZones) }),
    onSuccess: () => {
      setFeedback("Zonele de livrare au fost actualizate.");
      setZoneToDelete(null);
      onDone();
    },
    onError: (error) => setFeedback(`Salvarea a eșuat: ${error.message}`)
  });
  const minimumMutation = useMutation({
    mutationFn: (amount: number) => api.updateSettings({ minimumDeliveryOrderAmount: String(amount) }),
    onSuccess: () => {
      setFeedback("Pragul minim pentru livrare a fost actualizat.");
      onDone();
    },
    onError: (error) => setFeedback(`Salvarea pragului a eșuat: ${error.message}`)
  });

  useEffect(() => {
    setMinimumDeliveryOrderAmount(String(Math.max(0, Number(settings.minimumDeliveryOrderAmount) || 0)));
  }, [settings.minimumDeliveryOrderAmount]);

  async function saveZones(nextZones: DeliveryZone[]) {
    await mutation.mutateAsync(nextZones);
  }

  return (
    <div className="management-panel delivery-zones-panel">
      <DashboardPanelHeader
        eyebrow="Administrare"
        title={section === "list" ? "Zone de livrare existente" : "Adaugă zonă nouă"}
        description={section === "list"
          ? "Controlează prețurile, ordinea și vizibilitatea zonelor de livrare."
          : "Definește o zonă nouă pentru opțiunile afișate la checkout."}
        actions={
          <DashboardPanelTabs
            label="Secțiuni zone de livrare"
            value={section}
            options={[
              { value: "list", label: "Zone existente", icon: <List aria-hidden="true" size={19} /> },
              { value: "create", label: "Adaugă zonă", icon: <Plus aria-hidden="true" size={19} /> }
            ]}
            onChange={setSection}
          />
        }
      />

      {section === "create" ? (
        <section className="management-create-section" aria-labelledby="delivery-zone-create-title">
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const form = new FormData(formElement);
              const name = String(form.get("name") || "").trim();
              if (!name) return;
              try {
                await saveZones([
                  ...zones,
                  {
                    id: zoneIdFromName(name),
                    name,
                    price: Number(form.get("price") || 0),
                    description: String(form.get("description") || ""),
                    sortOrder: Number(form.get("sortOrder") || zones.length),
                    isActive: true
                  }
                ]);
                formElement.reset();
                setSection("list");
              } catch {
                // Mutation feedback is rendered in the live region below.
              }
            }}
          >
            <div><span className="dashboard-eyebrow">Configurare</span><h3 id="delivery-zone-create-title">Adaugă zonă</h3><p className="dashboard-helper">Definește opțiunile afișate clientului la livrare.</p></div>
            <label className="dashboard-field"><span>Numele zonei</span><input name="name" placeholder="Exemplu: Negoești și împrejurimi" required /></label>
            <label className="dashboard-field"><span>Preț livrare</span><input name="price" type="number" inputMode="decimal" step="0.01" min="0" required /><small>Valoare în lei.</small></label>
            <label className="dashboard-field"><span>Detalii</span><textarea name="description" rows={3} placeholder="Repere sau localități incluse" /></label>
            <label className="dashboard-field"><span>Ordine afișare</span><input name="sortOrder" type="number" inputMode="numeric" /><small>Numerele mai mici apar primele.</small></label>
            <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Se salvează…" : "Adaugă zonă"}</button>
          </form>
        </section>
      ) : (
        <section className="management-list-section">
          <form
            className="admin-form delivery-policy-form"
            onSubmit={(event) => {
              event.preventDefault();
              const amount = Number(minimumDeliveryOrderAmount);
              if (!Number.isFinite(amount) || amount < 0) return;
              minimumMutation.mutate(Math.round(amount * 100) / 100);
            }}
          >
            <div>
              <span className="dashboard-eyebrow">Regulă checkout</span>
              <h3>Comandă minimă pentru livrare</h3>
              <p className="dashboard-helper">Se verifică subtotalul produselor, înainte de voucher și fără taxa de livrare. Valoarea 0 dezactivează pragul.</p>
            </div>
            <label className="dashboard-field">
              <span>Comandă minimă pentru livrare</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={minimumDeliveryOrderAmount}
                onChange={(event) => setMinimumDeliveryOrderAmount(event.target.value)}
                required
              />
              <small>Valoare în lei.</small>
            </label>
            <button className="primary-button" disabled={minimumMutation.isPending}>
              {minimumMutation.isPending ? "Se salvează…" : "Salvează pragul"}
            </button>
          </form>
          <div className="admin-data-table-wrap">
            <table className="admin-data-table delivery-zones-table">
              <thead>
                <tr>
                  <th scope="col">Zonă</th>
                  <th scope="col">Preț</th>
                  <th scope="col">Detalii</th>
                  <th scope="col">Ordine</th>
                  <th scope="col">Stare</th>
                  <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <DeliveryZoneTableRows
                    key={zone.id}
                    zone={zone}
                    zones={zones}
                    editing={editingZoneId === zone.id}
                    pending={mutation.isPending}
                    onToggleEdit={() => setEditingZoneId((current) => current === zone.id ? null : zone.id)}
                    onCloseEdit={() => setEditingZoneId(null)}
                    onDelete={() => setZoneToDelete(zone)}
                    onSave={saveZones}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!zones.length && <EmptyState title="Nu există zone de livrare" description="Adaugă prima zonă folosind formularul." />}
          <p className="products-count" aria-live="polite">{zones.length} {zones.length === 1 ? "zonă afișată" : "zone afișate"}</p>
        </section>
      )}
      <div className="dashboard-live-region" aria-live="polite">{feedback}</div>
      <ConfirmActionDialog
        open={Boolean(zoneToDelete)}
        title="Ștergi zona de livrare?"
        description={<>Zona <strong>{zoneToDelete?.name}</strong> nu va mai putea fi selectată la comenzile noi.</>}
        confirmLabel="Șterge zona"
        danger
        pending={mutation.isPending}
        onCancel={() => setZoneToDelete(null)}
        onConfirm={() => zoneToDelete && mutation.mutate(zones.filter((candidate) => candidate.id !== zoneToDelete.id))}
      />
    </div>
  );
}

function DeliveryZoneTableRows({
  zone,
  zones,
  editing,
  pending,
  onToggleEdit,
  onCloseEdit,
  onDelete,
  onSave
}: {
  zone: DeliveryZone;
  zones: DeliveryZone[];
  editing: boolean;
  pending: boolean;
  onToggleEdit: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  onSave: (nextZones: DeliveryZone[]) => Promise<void>;
}) {
  return (
    <>
      <tr className={editing ? "is-editing" : ""}>
        <td data-label="Zonă"><strong className="category-table-name">{zone.name}</strong></td>
        <td data-label="Preț"><strong className="product-table-price">{zone.price.toFixed(2)} lei</strong></td>
        <td data-label="Detalii"><span className="table-muted-text">{zone.description || "Fără detalii"}</span></td>
        <td data-label="Ordine"><strong className="category-table-order">{zone.sortOrder}</strong></td>
        <td data-label="Stare"><StatusBadge tone={zone.isActive ? "success" : "warning"}>{zone.isActive ? "Activă" : "Inactivă"}</StatusBadge></td>
        <td className="admin-data-table-actions">
          <div className="table-action-group">
            <button className={editing ? "secondary-button" : "primary-button"} type="button" aria-expanded={editing} onClick={onToggleEdit}>
              {editing ? <X aria-hidden="true" size={18} /> : <Pencil aria-hidden="true" size={18} />}
              {editing ? "Închide" : "Editează"}
            </button>
            <button className="secondary-button danger-button" type="button" disabled={pending} onClick={onDelete}>Șterge</button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="admin-editor-row">
          <td colSpan={6}>
            <form
              className="admin-inline-editor delivery-zone-editor-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  await onSave(
                    zones.map((candidate) =>
                      candidate.id === zone.id
                        ? {
                            ...candidate,
                            name: String(form.get("name") || ""),
                            price: Number(form.get("price") || 0),
                            description: String(form.get("description") || ""),
                            sortOrder: Number(form.get("sortOrder") || 0),
                            isActive: form.get("isActive") === "on"
                          }
                        : candidate
                    )
                  );
                  onCloseEdit();
                } catch {
                  // Mutation feedback is rendered in the panel live region.
                }
              }}
            >
              <div className="product-editor-heading"><h3>Editează zona</h3><p>Actualizează numele, prețul și vizibilitatea zonei de livrare.</p></div>
              <label className="dashboard-field"><span>Numele zonei</span><input name="name" defaultValue={zone.name} /></label>
              <label className="dashboard-field"><span>Preț livrare</span><input name="price" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={zone.price} /></label>
              <label className="dashboard-field editor-span-full"><span>Detalii</span><textarea name="description" rows={3} defaultValue={zone.description ?? ""} /></label>
              <label className="dashboard-field"><span>Ordine afișare</span><input name="sortOrder" type="number" inputMode="numeric" defaultValue={zone.sortOrder} /></label>
              <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={zone.isActive} /> Activă</label>
              <div className="editor-button-row">
                <button className="primary-button" disabled={pending}>{pending ? "Se salvează…" : "Salvează modificările"}</button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

type SettingsGroup = "delivery" | "whatsapp" | "schedule" | "checkout";

type SettingsStatus = {
  label: string;
  tone: "neutral" | "brand" | "warning" | "success" | "danger";
};

function SettingsPanel({ settings, onDone }: { settings: Record<string, string>; onDone: () => void }) {
  const [editingGroup, setEditingGroup] = useState<SettingsGroup | null>(null);
  const rows = settingsRows(settings);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, string>) => api.updateSettings(payload),
    onSuccess: () => {
      onDone();
      setEditingGroup(null);
    }
  });

  return (
    <div className="management-panel settings-panel">
      <DashboardPanelHeader
        eyebrow="Administrare"
        title="Setări existente"
        description="Verifică și modifică setările restaurantului din rândurile de mai jos."
      />

      <section className="management-list-section">
        <div className="admin-data-table-wrap">
          <table className="admin-data-table settings-table">
            <thead>
              <tr>
                <th scope="col">Setare</th>
                <th scope="col">Grup</th>
                <th scope="col">Valoare curentă</th>
                <th scope="col">Stare</th>
                <th scope="col"><span className="visually-hidden">Acțiuni</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SettingsTableRows
                  key={row.group}
                  row={row}
                  settings={settings}
                  editing={editingGroup === row.group}
                  pending={mutation.isPending}
                  error={mutation.error}
                  onToggleEdit={() => setEditingGroup((current) => current === row.group ? null : row.group)}
                  onSave={(payload) => mutation.mutate(payload)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="products-count" aria-live="polite">{rows.length} grupuri de setări afișate</p>
      </section>
    </div>
  );
}

function SettingsTableRows({
  row,
  settings,
  editing,
  pending,
  error,
  onToggleEdit,
  onSave
}: {
  row: ReturnType<typeof settingsRows>[number];
  settings: Record<string, string>;
  editing: boolean;
  pending: boolean;
  error: Error | null;
  onToggleEdit: () => void;
  onSave: (payload: Record<string, string>) => void;
}) {
  return (
    <>
      <tr className={editing ? "is-editing" : ""}>
        <td data-label="Setare">
          <div className="table-identity">
            <strong>{row.title}</strong>
            <small>{row.description}</small>
          </div>
        </td>
        <td data-label="Grup"><span className="table-muted-text">{row.scope}</span></td>
        <td data-label="Valoare curentă"><span className="table-muted-text">{row.value}</span></td>
        <td data-label="Stare">
          <div className="setting-badge-stack">
            {row.statuses.map((status) => <StatusBadge key={status.label} tone={status.tone}>{status.label}</StatusBadge>)}
          </div>
        </td>
        <td className="admin-data-table-actions">
          <button className={editing ? "secondary-button" : "primary-button"} type="button" aria-expanded={editing} onClick={onToggleEdit}>
            {editing ? <X aria-hidden="true" size={18} /> : <Pencil aria-hidden="true" size={18} />}
            {editing ? "Închide" : "Editează"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="admin-editor-row">
          <td colSpan={5}>
            <SettingsGroupEditor
              group={row.group}
              settings={settings}
              pending={pending}
              error={error}
              onSave={onSave}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function SettingsGroupEditor({
  group,
  settings,
  pending,
  error,
  onSave
}: {
  group: SettingsGroup;
  settings: Record<string, string>;
  pending: boolean;
  error: Error | null;
  onSave: (payload: Record<string, string>) => void;
}) {
  if (group === "delivery") {
    return (
      <form
        className="admin-inline-editor settings-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({
            deliveryFee: String(form.get("deliveryFee") || "0"),
            deliveryEnabled: form.get("deliveryEnabled") === "on" ? "true" : "false",
            pickupEnabled: form.get("pickupEnabled") === "on" ? "true" : "false"
          });
        }}
      >
        <div className="product-editor-heading"><h3>Editează livrarea</h3><p>Setează taxa simplă și canalele disponibile pentru clienți.</p></div>
        <label className="dashboard-field"><span>Cost livrare simplu</span><input name="deliveryFee" type="number" step="0.01" defaultValue={settings.deliveryFee ?? "7"} /></label>
        <label className="checkbox-row"><input name="deliveryEnabled" type="checkbox" defaultChecked={settings.deliveryEnabled !== "false"} /> Livrare activă</label>
        <label className="checkbox-row"><input name="pickupEnabled" type="checkbox" defaultChecked={settings.pickupEnabled !== "false"} /> Ridicare activă</label>
        <SettingsEditorActions pending={pending} error={error} />
      </form>
    );
  }

  if (group === "whatsapp") {
    return (
      <form
        className="admin-inline-editor settings-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({
            whatsappStoreNumber: String(form.get("whatsappStoreNumber") || ""),
            whatsappSenderNumber: String(form.get("whatsappSenderNumber") || "")
          });
        }}
      >
        <div className="product-editor-heading"><h3>Editează WhatsApp</h3><p>Actualizează numerele folosite pentru notificări și trimitere prin API.</p></div>
        <label className="dashboard-field"><span>Număr WhatsApp pentru notificări comenzi</span><input name="whatsappStoreNumber" placeholder="+40..." defaultValue={settings.whatsappStoreNumber ?? ""} /></label>
        <label className="dashboard-field"><span>Număr WhatsApp sender/API</span><input name="whatsappSenderNumber" defaultValue={settings.whatsappSenderNumber ?? ""} /></label>
        <SettingsEditorActions pending={pending} error={error} />
      </form>
    );
  }

  if (group === "schedule") {
    return (
      <form
        className="admin-inline-editor settings-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({ restaurantSchedule: String(form.get("restaurantSchedule") || "") });
        }}
      >
        <div className="product-editor-heading"><h3>Editează programul</h3><p>Salvează programul afișat clienților pe site.</p></div>
        <label className="dashboard-field editor-span-full"><span>Program</span><input name="restaurantSchedule" defaultValue={settings.restaurantSchedule ?? ""} /></label>
        <SettingsEditorActions pending={pending} error={error} />
      </form>
    );
  }

  return (
    <form
      className="admin-inline-editor settings-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          paymentCashEnabled: form.get("paymentCashEnabled") === "on" ? "true" : "false",
          pwaInstallPrompt: form.get("pwaInstallPrompt") === "on" ? "true" : "false"
        });
      }}
    >
      <div className="product-editor-heading"><h3>Editează plățile și aplicația</h3><p>Controlează plata cash și promptul de instalare PWA.</p></div>
      <label className="checkbox-row"><input name="paymentCashEnabled" type="checkbox" defaultChecked={settings.paymentCashEnabled !== "false"} /> Plată cash activă</label>
      <label className="checkbox-row"><input name="pwaInstallPrompt" type="checkbox" defaultChecked={settings.pwaInstallPrompt !== "false"} /> Afișează prompt instalare PWA</label>
      <SettingsEditorActions pending={pending} error={error} />
    </form>
  );
}

function SettingsEditorActions({ pending, error }: { pending: boolean; error: Error | null }) {
  return (
    <>
      <div className="editor-button-row">
        <button className="primary-button" disabled={pending}>{pending ? "Se salvează…" : "Salvează modificările"}</button>
      </div>
      <div className="dashboard-live-region" aria-live="polite">{error ? `Salvarea a eșuat: ${error.message}` : ""}</div>
    </>
  );
}

function settingsRows(settings: Record<string, string>) {
  return [
    {
      group: "delivery" as const,
      title: "Livrare și ridicare",
      description: "Taxa simplă și disponibilitatea canalelor de comandă.",
      scope: "Comenzi",
      value: `${Number(settings.deliveryFee ?? "7").toFixed(2)} lei`,
      statuses: [
        booleanStatus("Livrare", settings.deliveryEnabled !== "false"),
        booleanStatus("Ridicare", settings.pickupEnabled !== "false")
      ]
    },
    {
      group: "whatsapp" as const,
      title: "WhatsApp",
      description: "Numerele folosite pentru notificări și sender/API.",
      scope: "Notificări",
      value: compactSettingValues([settings.whatsappStoreNumber, settings.whatsappSenderNumber]),
      statuses: [booleanStatus("Configurat", Boolean(settings.whatsappStoreNumber || settings.whatsappSenderNumber))]
    },
    {
      group: "schedule" as const,
      title: "Program restaurant",
      description: "Programul afișat clienților.",
      scope: "Afișare",
      value: formatRestaurantSchedule(settings.restaurantSchedule),
      statuses: [booleanStatus("Public", Boolean(settings.restaurantSchedule))]
    },
    {
      group: "checkout" as const,
      title: "Plăți și aplicație",
      description: "Opțiuni pentru checkout și instalarea aplicației.",
      scope: "Checkout",
      value: "Cash și PWA",
      statuses: [
        booleanStatus("Cash", settings.paymentCashEnabled !== "false"),
        booleanStatus("PWA", settings.pwaInstallPrompt !== "false")
      ]
    }
  ];
}

function booleanStatus(label: string, active: boolean): SettingsStatus {
  return {
    label: `${label}: ${active ? "activ" : "inactiv"}`,
    tone: active ? "success" : "warning"
  };
}

function compactSettingValues(values: Array<string | undefined>) {
  const visibleValues = values.map((value) => value?.trim()).filter(Boolean);
  return visibleValues.length ? visibleValues.join(" · ") : "Neconfigurat";
}

function formatRestaurantSchedule(raw?: string) {
  if (!raw?.trim()) return "Neconfigurat";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const mondaySaturday = typeof parsed.mondaySaturday === "string" ? parsed.mondaySaturday : null;
      const sunday = typeof parsed.sunday === "string" ? parsed.sunday : null;
      if (mondaySaturday || sunday) {
        return [mondaySaturday ? `L-S ${mondaySaturday}` : null, sunday ? `D ${sunday}` : null].filter(Boolean).join(" · ");
      }
    }
  } catch {
    return raw;
  }
  return raw;
}
