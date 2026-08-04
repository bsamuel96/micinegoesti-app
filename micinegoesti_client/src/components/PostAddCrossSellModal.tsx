import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Minus, Plus, ShoppingBasket, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Product } from "../api/types";
import { useCart } from "../context/CartContext";
import { selectCrossSellProducts } from "../lib/crossSellProducts";
import { getProductCoverImage } from "../lib/productImages";

type PostAddCrossSellModalProps =
  | {
    context?: "post-add";
    addedProduct: Product;
    addedQuantity: number;
    onClose: () => void;
  }
  | {
    context: "cart";
    addedProduct?: never;
    addedQuantity?: never;
    onClose: () => void;
  };

const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function PostAddCrossSellModal(props: PostAddCrossSellModalProps) {
  const { onClose } = props;
  const addedProduct = props.context === "cart" ? undefined : props.addedProduct;
  const addedQuantity = props.context === "cart" ? 0 : props.addedQuantity;
  const isCartContext = !addedProduct;
  const navigate = useNavigate();
  const { lines, subtotal, add, update, remove } = useCart();
  const modalRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const productsQuery = useQuery({
    queryKey: ["post-add-cross-sell-products"],
    queryFn: () => api.products(undefined),
    staleTime: 60_000
  });

  const cartProductIds = useMemo(() => new Set(lines.map((line) => line.product.id)), [lines]);
  const cartProducts = useMemo(() => lines.map((line) => line.product), [lines]);
  const cartQuantity = useMemo(() => lines.reduce((total, line) => total + line.quantity, 0), [lines]);

  const recommendations = useMemo(
    () => selectCrossSellProducts({
      catalog: productsQuery.data?.products ?? [],
      sourceProducts: cartProducts.length ? cartProducts : addedProduct ? [addedProduct] : [],
      cartProductIds,
      maximum: 4
    }),
    [addedProduct, cartProductIds, cartProducts, productsQuery.data?.products]
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function addRecommendation(product: Product) {
    add(product, 1);
    setStatusMessage(`Produsul ${product.name} a fost adăugat în coș.`);
  }

  function continueToCheckout() {
    onClose();
    navigate("/checkout");
  }

  return createPortal(
    <div
      className="post-add-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={modalRef}
        className="post-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-add-modal-title"
      >
        <button
          ref={closeButtonRef}
          className="post-add-modal-close"
          type="button"
          aria-label="Închide recomandările"
          onClick={onClose}
        >
          <X aria-hidden="true" size={21} />
        </button>

        <div className="post-add-modal-content">
          {addedProduct ? (
            <aside className="post-add-product-summary" aria-label="Produs adăugat">
              <div className="post-add-product-status">
                <span>Disponibil</span>
                <span>Adăugat × {addedQuantity}</span>
              </div>
              <div className="post-add-product-image">
                <img src={getProductCoverImage(addedProduct)} alt="" />
              </div>
              <h3>{addedProduct.name}</h3>
              <p>{addedProduct.shortDescription || addedProduct.description || "Preparat proaspăt la comandă."}</p>
              <strong>{addedProduct.price.toFixed(2)} lei</strong>
              <div className="post-add-product-meta">
                <span>{addedProduct.isHouseSpecialty ? "Specialitatea casei" : addedProduct.categories[0]?.label || "Produs din meniu"}</span>
                <span>{addedProduct.images.length} {addedProduct.images.length === 1 ? "imagine" : "imagini"}</span>
              </div>
            </aside>
          ) : (
            <aside className="post-add-product-summary post-add-cart-summary" aria-label="Rezumatul coșului">
              <div className="post-add-product-status">
                <span>Coș activ</span>
                <span>{cartQuantity} {cartQuantity === 1 ? "produs" : "produse"}</span>
              </div>
              <div className="post-add-cart-preview" aria-hidden="true">
                {lines.slice(0, 4).map((line) => (
                  <img key={line.product.id} src={getProductCoverImage(line.product)} alt="" />
                ))}
              </div>
              <h3>Comanda ta</h3>
              <p>Recomandările sunt alese după produsele pe care le ai deja în coș.</p>
              <strong>{subtotal.toFixed(2)} lei</strong>
              <div className="post-add-product-meta">
                <span>{lines.length} {lines.length === 1 ? "preparat" : "preparate"}</span>
                <span>Subtotal</span>
              </div>
            </aside>
          )}

          <main className="post-add-recommendations">
            <header className="post-add-heading">
              <span className={`post-add-check${isCartContext ? " is-cart" : ""}`} aria-hidden="true">
                {isCartContext ? <Sparkles size={32} /> : <Check size={34} />}
              </span>
              <div>
                <h2 id="post-add-modal-title">{isCartContext ? "Completează comanda" : "Adăugat în coș!"}</h2>
                <p>
                  {addedProduct
                    ? <><strong>{addedProduct.name}</strong> a fost adăugat în comanda ta.</>
                    : "Am ales recomandări potrivite produselor din coșul tău."}
                </p>
              </div>
            </header>

            <section className="post-add-combo" aria-labelledby="post-add-combo-title">
              <div className="post-add-combo-heading">
                <span aria-hidden="true"><Plus size={25} /></span>
                <div>
                  <h3 id="post-add-combo-title">{isCartContext ? "Mai adaugi ceva?" : "Completezi masa?"}</h3>
                  <p>
                    {isCartContext
                      ? "Alege ceva potrivit înainte să mergi la finalizare."
                      : "Adaugă ceva în plus pentru combinația perfectă."}
                  </p>
                </div>
              </div>

              {productsQuery.isLoading ? (
                <div className="post-add-recommendation-loading" role="status">Se încarcă recomandările…</div>
              ) : productsQuery.isError ? (
                <div className="post-add-recommendation-error" role="alert">
                  Recomandările nu au putut fi încărcate. Coșul tău rămâne salvat.
                </div>
              ) : recommendations.length ? (
                <div className="post-add-recommendation-grid">
                  {recommendations.map((product) => (
                    <article className="post-add-recommendation-card" key={product.id}>
                      <img src={getProductCoverImage(product)} alt="" />
                      <div>
                        <h4>{product.name}</h4>
                        <p>{product.shortDescription || product.categories[0]?.label || "Recomandare"}</p>
                      </div>
                      <strong>{product.price.toFixed(2)} lei</strong>
                      <button
                        type="button"
                        aria-label={`Adaugă ${product.name} în coș`}
                        onClick={() => addRecommendation(product)}
                      >
                        <Plus aria-hidden="true" size={18} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="post-add-no-recommendations">Nu avem alte recomandări disponibile momentan.</p>
              )}
            </section>
            <div className="post-add-live-status" role="status" aria-live="polite">{statusMessage}</div>
          </main>

          <aside className="post-add-order" aria-label="Comanda ta">
            <header>
              <ShoppingBasket aria-hidden="true" size={20} />
              <h3>Comanda ta</h3>
            </header>
            <div className="post-add-order-lines">
              {lines.map((line) => (
                <article className="post-add-order-line" key={line.product.id}>
                  <img src={getProductCoverImage(line.product)} alt="" />
                  <div className="post-add-order-copy">
                    <strong>{line.product.name}</strong>
                    <small>{line.product.shortDescription || `${line.product.price.toFixed(2)} lei / buc.`}</small>
                    <div className="post-add-order-quantity" role="group" aria-label={`Cantitate ${line.product.name}`}>
                      <button
                        type="button"
                        aria-label={`Scade cantitatea pentru ${line.product.name}`}
                        onClick={() => update(line.product.id, line.quantity - 1)}
                      >
                        <Minus aria-hidden="true" size={14} />
                      </button>
                      <output aria-label={`Cantitate în coș: ${line.quantity}`}>{line.quantity}</output>
                      <button
                        type="button"
                        aria-label={`Crește cantitatea pentru ${line.product.name}`}
                        onClick={() => update(line.product.id, line.quantity + 1)}
                      >
                        <Plus aria-hidden="true" size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="post-add-order-price">
                    <strong>{(line.product.price * line.quantity).toFixed(2)} lei</strong>
                    <button
                      type="button"
                      aria-label={`Șterge ${line.product.name} din coș`}
                      onClick={() => remove(line.product.id)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="post-add-order-totals">
              <div><span>Subtotal</span><strong>{subtotal.toFixed(2)} lei</strong></div>
              <div><span>Total estimat</span><strong>{subtotal.toFixed(2)} lei</strong></div>
              <p>Costul livrării și reducerile se calculează la checkout.</p>
            </div>
          </aside>
        </div>

        <footer className="post-add-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            {isCartContext ? "Înapoi la coș" : "Continuă cumpărăturile"}
          </button>
          <button className="primary-button" type="button" onClick={continueToCheckout}>
            {isCartContext ? "Continuă la checkout" : "Vezi coșul și finalizează"}
            <ArrowRight aria-hidden="true" size={19} />
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
