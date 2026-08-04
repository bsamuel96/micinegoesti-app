import { Minus, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { getProductCoverImage } from "../lib/productImages";

export function CartPage() {
  const { lines, lastOrder, subtotal, update, remove, replace } = useCart();

  if (!lines.length) {
    return (
      <section className="section-shell empty-state">
        <h1>Coșul este gol</h1>
        <p>Alege ceva bun de pe grătar și revenim aici cu totalul.</p>
        <div className="hero-actions">
          <Link className="primary-button" to="/menu">Vezi meniul</Link>
          {lastOrder.length > 0 && (
            <button className="secondary-button" onClick={() => replace(lastOrder)}>
              Repetă ultima comandă
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell cart-page">
      <div className="section-title">
        <span>Coș</span>
        <h1>Comanda ta</h1>
      </div>
      <div className="cart-lines">
        {lines.map((line) => (
          <article key={line.product.id} className="cart-line">
            <img src={getProductCoverImage(line.product)} alt={line.product.name} width="96" height="96" loading="lazy" />
            <div>
              <strong>{line.product.name}</strong>
              <span>{line.product.price.toFixed(2)} lei</span>
            </div>
            <div className="qty-control compact">
              <button onClick={() => update(line.product.id, line.quantity - 1)} aria-label="Scade">
                <Minus size={16} />
              </button>
              <input value={line.quantity} onChange={(event) => update(line.product.id, Number(event.target.value) || 1)} />
              <button onClick={() => update(line.product.id, line.quantity + 1)} aria-label="Crește">
                <Plus size={16} />
              </button>
            </div>
            <strong>{(line.quantity * line.product.price).toFixed(2)} lei</strong>
            <button className="icon-button subtle" onClick={() => remove(line.product.id)} aria-label="Șterge">
              <Trash2 size={18} />
            </button>
          </article>
        ))}
      </div>
      <div className="checkout-bar">
        <div>
          <span>Subtotal</span>
          <strong>{subtotal.toFixed(2)} lei</strong>
        </div>
        <Link className="primary-button" to="/cart/upsell">Continuă cu recomandări</Link>
      </div>
    </section>
  );
}
