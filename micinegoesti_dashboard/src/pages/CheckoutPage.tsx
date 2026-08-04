import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Order, VoucherValidationResult } from "../api/types";
import { OrderTracker } from "../components/OrderTracker";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import type { Coordinates } from "../components/DeliveryLocationMap";

const DeliveryLocationMap = lazy(() => import("../components/DeliveryLocationMap"));

export function CheckoutPage() {
  const { lines, cartId, sessionId, subtotal, clear, refreshLastOrder } = useCart();
  const { user } = useAuth();
  const settings = useQuery({ queryKey: ["public-settings"], queryFn: () => api.publicSettings() });
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [address, setAddress] = useState("");
  const [addressResolving, setAddressResolving] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherValidationResult | null>(null);
  const [voucherError, setVoucherError] = useState("");
  const [voucherApplying, setVoucherApplying] = useState(false);

  const deliveryZones = settings.data?.settings.deliveryZones ?? [];
  const deliveryZoneKey = useMemo(() => deliveryZones.map((zone) => zone.id).join("|"), [deliveryZones]);
  const selectedZone = deliveryZones.find((zone) => zone.id === deliveryZoneId);
  const deliveryFee = orderType === "delivery" ? selectedZone?.price ?? settings.data?.settings.deliveryFee ?? 0 : 0;
  const displaySubtotal = appliedVoucher?.subtotal ?? subtotal;
  const displayDeliveryCost = appliedVoucher?.deliveryCost ?? deliveryFee;
  const total = appliedVoucher?.finalTotal ?? subtotal + deliveryFee;
  const deliveryEnabled = settings.data?.settings.deliveryEnabled !== false;
  const pickupEnabled = settings.data?.settings.pickupEnabled !== false;
  const minimumDeliveryOrderAmount = settings.data?.settings.minimumDeliveryOrderAmount ?? 0;
  const meetsDeliveryMinimum = orderType !== "delivery" || subtotal >= minimumDeliveryOrderAmount;
  const canSubmit =
    orderType !== "delivery" ||
    (
      meetsDeliveryMinimum &&
      deliveryZones.length > 0 &&
      Boolean(deliveryZoneId) &&
      Boolean(location) &&
      Boolean(address.trim()) &&
      !addressResolving
    );
  const voucherContextKey = useMemo(
    () => [
      orderType,
      deliveryZoneId,
      lines.map((line) => `${line.product.id}:${line.quantity}`).join("|")
    ].join("::"),
    [deliveryZoneId, lines, orderType]
  );

  useEffect(() => {
    if (!deliveryEnabled && pickupEnabled) setOrderType("pickup");
    if (deliveryEnabled && !pickupEnabled) setOrderType("delivery");
  }, [deliveryEnabled, pickupEnabled]);

  useEffect(() => {
    if (!deliveryZones.length) {
      if (deliveryZoneId) setDeliveryZoneId("");
      return;
    }

    if (!deliveryZoneId || !deliveryZones.some((zone) => zone.id === deliveryZoneId)) {
      setDeliveryZoneId(deliveryZones[0].id);
    }
  }, [deliveryZoneId, deliveryZoneKey, deliveryZones]);

  useEffect(() => {
    setAppliedVoucher(null);
    setVoucherError("");
  }, [voucherContextKey]);

  async function applyVoucher() {
    setVoucherError("");
    setVoucherApplying(true);
    try {
      const response = await api.validateVoucher({
        code: voucherCode,
        cartId: cartId ?? undefined,
        sessionId,
        items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        orderType,
        deliveryZoneId: orderType === "delivery" ? deliveryZoneId || undefined : undefined
      });
      setAppliedVoucher(response.voucher);
      setVoucherCode(response.voucher.code);
    } catch (caught) {
      setAppliedVoucher(null);
      setVoucherError(caught instanceof Error ? caught.message : "Voucherul nu a putut fi aplicat.");
    } finally {
      setVoucherApplying(false);
    }
  }

  if (order) {
    return (
      <section className="section-shell">
        <div className="section-title">
          <span>Mulțumim</span>
          <h1>Comanda ta e înregistrată</h1>
        </div>
        <OrderTracker order={order} />
      </section>
    );
  }

  if (!lines.length) {
    return (
      <section className="section-shell empty-state">
        <h1>Nu ai produse în coș</h1>
        <Link className="primary-button" to="/menu">Înapoi la meniu</Link>
      </section>
    );
  }

  return (
    <section className="section-shell checkout-page">
      <div className="section-title">
        <span>Checkout</span>
        <h1>Finalizează comanda</h1>
      </div>
      <form
        className="checkout-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const form = new FormData(event.currentTarget);

          try {
            const response = await api.checkout({
              cartId: cartId ?? undefined,
              sessionId,
              items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
              contact: {
                fullName: form.get("fullName"),
                phone: form.get("phone"),
                address: form.get("address") || undefined
              },
              orderType,
              deliveryZoneId: orderType === "delivery" ? deliveryZoneId || undefined : undefined,
              notes: form.get("notes") || undefined,
              voucherCode: appliedVoucher?.code ?? undefined,
              location: orderType === "delivery" ? location : undefined
            });
            clear();
            refreshLastOrder().catch(() => null);
            setOrder(response.order);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Nu am putut trimite comanda.");
          }
        }}
      >
        <div className="form-grid">
          <label>Nume complet<input name="fullName" defaultValue={user?.name ?? ""} required /></label>
          <label>Telefon / WhatsApp<input name="phone" defaultValue={user?.phone ?? ""} placeholder="+40..." required /></label>
          <fieldset className="order-type-toggle">
            <legend>Tip comandă</legend>
            <button
              type="button"
              className={orderType === "delivery" ? "active" : ""}
              disabled={!deliveryEnabled}
              onClick={() => setOrderType("delivery")}
            >
              Livrare
            </button>
            <button
              type="button"
              className={orderType === "pickup" ? "active" : ""}
              disabled={!pickupEnabled}
              onClick={() => setOrderType("pickup")}
            >
              Ridicare de la sediu
            </button>
          </fieldset>
          {orderType === "delivery" && (
            <>
              <label>
                Zonă livrare
                <select
                  value={deliveryZoneId}
                  onChange={(event) => setDeliveryZoneId(event.target.value)}
                  required={deliveryZones.length > 0}
                  disabled={settings.isLoading || deliveryZones.length === 0}
                >
                  {deliveryZones.length > 0 ? (
                    deliveryZones.map((zone) => (
                      <option value={zone.id} key={zone.id}>
                        {zone.name} · {zone.price.toFixed(2)} lei
                      </option>
                    ))
                  ) : settings.isLoading ? (
                    <option value="">Se încarcă zonele...</option>
                  ) : (
                    <option value="">Nu există zone active</option>
                  )}
                </select>
                {settings.isError && <span className="field-hint is-error">Nu am putut încărca zonele de livrare.</span>}
                {!settings.isLoading && !settings.isError && deliveryZones.length === 0 && (
                  <span className="field-hint is-error">Configurează zone active în Admin &gt; Zone livrare.</span>
                )}
                {minimumDeliveryOrderAmount > 0 && (
                  <span className={`field-hint${meetsDeliveryMinimum ? "" : " is-error"}`}>
                    {meetsDeliveryMinimum
                      ? `Comandă minimă pentru livrare: ${minimumDeliveryOrderAmount.toFixed(2)} lei în produse.`
                      : `Comanda minimă pentru livrare este ${minimumDeliveryOrderAmount.toFixed(2)} lei. Mai adaugă ${(minimumDeliveryOrderAmount - subtotal).toFixed(2)} lei în produse.`}
                  </span>
                )}
              </label>
              <label>
                Adresă completă
                <input
                  name="address"
                  placeholder="Alege pinul pentru completare automată"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                />
                <span className="field-hint">
                  Adresa este completată de pin. Poți adăuga manual blocul, scara, apartamentul sau interfonul.
                </span>
              </label>
              {settings.data?.settings.storeLocation && (
                <Suspense fallback={<div className="delivery-map-skeleton">Se încarcă harta…</div>}>
                  <DeliveryLocationMap
                    value={location}
                    storeLocation={settings.data.settings.storeLocation}
                    onLocationChange={(coordinates) => {
                      setLocation(coordinates);
                      setAddress("");
                    }}
                    onAddressResolved={setAddress}
                    onAddressResolutionChange={setAddressResolving}
                  />
                </Suspense>
              )}
            </>
          )}
          <label>Observații<textarea name="notes" rows={3} /></label>
          <div className="voucher-checkout-field">
            <label>
              Voucher
              <input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} placeholder="MICI-AB12CD34" />
            </label>
            <div className="voucher-checkout-actions">
              <button className="secondary-button" type="button" disabled={!voucherCode.trim() || voucherApplying} onClick={applyVoucher}>
                {voucherApplying ? "Se verifică..." : "Aplică"}
              </button>
              {appliedVoucher && (
                <button className="secondary-button" type="button" onClick={() => {
                  setAppliedVoucher(null);
                  setVoucherError("");
                }}>
                  Elimină
                </button>
              )}
            </div>
            {appliedVoucher && <p className="form-status">{appliedVoucher.message}</p>}
            {voucherError && <p className="form-error">{voucherError}</p>}
          </div>
        </div>
        <div className="order-total-box">
          <div><span>Produse</span><strong>{displaySubtotal.toFixed(2)} lei</strong></div>
          {appliedVoucher && <div><span>Voucher {appliedVoucher.code}</span><strong>-{appliedVoucher.discountAmount.toFixed(2)} lei</strong></div>}
          <div><span>{orderType === "delivery" ? selectedZone?.name ?? "Livrare" : "Ridicare de la sediu"}</span><strong>{displayDeliveryCost.toFixed(2)} lei</strong></div>
          <div><span>Total</span><strong>{total.toFixed(2)} lei</strong></div>
        </div>
        <button className="primary-button" disabled={!canSubmit || settings.isLoading}>
          {addressResolving ? "Se completează adresa…" : "Trimite comanda"}
        </button>
        {error && <p className="form-error">{error}</p>}
      </form>
    </section>
  );
}
