import { Info, Minus, Plus, ShoppingBasket, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Product } from "../api/types";
import { getProductCoverImage } from "../lib/productImages";
import { useCart } from "../context/CartContext";
import { allergenLabels } from "../lib/allergens";
import { PostAddCrossSellModal } from "./PostAddCrossSellModal";

type ProductCardProps = {
  product: Product;
  promptAfterAdd?: boolean;
};

type ProductCardBackView = "details" | null;

export function ProductCard({ product, promptAfterAdd = true }: ProductCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const detailsId = useId();
  const [backView, setBackView] = useState<ProductCardBackView>(null);
  const [addedQuantity, setAddedQuantity] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { add } = useCart();
  const imageUrl = getProductCoverImage(product);
  const allergenInfo = getProductAllergenInfo(product);
  const flipped = backView !== null;

  function increaseQuantity() {
    if (!product.isAvailable) return;
    setQuantity((current) => current + 1);
  }

  function decreaseQuantity() {
    setQuantity((current) => Math.max(0, current - 1));
  }

  function addSelectionToCart() {
    if (!product.isAvailable || quantity === 0) return;
    add(product, quantity);
    if (promptAfterAdd) setAddedQuantity(quantity);
    setQuantity(0);
  }

  function closeDetails() {
    setBackView(null);
  }

  const closePostAddModal = useCallback(() => setAddedQuantity(null), []);

  useEffect(() => {
    if (!flipped || !cardRef.current) return;

    const centerCard = () => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - (window.innerHeight / 2 - rect.height / 2);
      window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
    };

    const rafId = requestAnimationFrame(centerCard);
    const timeoutId = window.setTimeout(centerCard, 180);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [flipped]);

  useEffect(() => {
    if (!flipped) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setBackView(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [flipped]);

  return (
    <>
      <article
        ref={cardRef}
        className={`product-card${flipped ? " is-flipped" : ""}`}
      >
        {flipped && (
          <button
            type="button"
            className="product-card-close"
            onClick={closeDetails}
            aria-label="Închide cardul"
          >
            <X size={17} />
          </button>
        )}
        <div className="flip-inner">
          <div className={`flip-front${product.isAvailable ? "" : " is-disabled"}`}>
            <span className={`product-image ${imageLoaded ? "is-loaded" : ""}`}>
              <img src={imageUrl} alt={product.images?.[0]?.alt || product.name} width="420" height="320" loading="lazy" onLoad={() => setImageLoaded(true)} />
            </span>
            <span className="product-copy">
              <strong>{product.name}</strong>
              <small>{product.shortDescription || product.description || "Preparat proaspăt la comandă"}</small>
              <em>Descriere și alergeni</em>
            </span>
            <div className="product-card-footer">
              <span className="price">{product.price.toFixed(2)} lei</span>
              <div className="product-card-quantity" role="group" aria-label={`Cantitate ${product.name}`}>
                <button
                  type="button"
                  aria-label={`Elimină o porție de ${product.name}`}
                  disabled={quantity === 0}
                  onClick={decreaseQuantity}
                >
                  <Minus aria-hidden="true" size={18} />
                </button>
                <output aria-live="polite" aria-label={`Cantitate selectată: ${quantity}`}>
                  {quantity}
                </output>
                <button
                  type="button"
                  aria-label={`Adaugă o porție de ${product.name}`}
                  disabled={!product.isAvailable}
                  onClick={increaseQuantity}
                >
                  <Plus aria-hidden="true" size={18} />
                </button>
              </div>
              <button
                className="product-cart-button"
                type="button"
                aria-label={`Adaugă în coș ${product.name}`}
                title={quantity > 0 ? `Adaugă ${quantity} în coș` : "Selectează cantitatea"}
                disabled={!product.isAvailable || quantity === 0}
                onClick={addSelectionToCart}
              >
                <ShoppingBasket aria-hidden="true" size={19} />
              </button>
              <button
                className="product-info-button"
                type="button"
                aria-label={`Informații despre ${product.name}`}
                aria-controls={detailsId}
                aria-expanded={backView === "details"}
                title="Descriere și alergeni"
                onClick={() => setBackView("details")}
              >
                <Info aria-hidden="true" size={20} />
              </button>
            </div>
          </div>
          <div className="flip-back" id={detailsId}>
            <button className="flip-close" type="button" onClick={closeDetails} aria-label="Închide">
              <X size={18} />
            </button>
            <div className="product-information">
              <section className="product-description-details">
                <span>Descriere</span>
                <h3>{product.name}</h3>
                <p>{product.description || product.shortDescription || "Preparat proaspăt la comandă."}</p>
              </section>
              <section className="product-allergen-details">
                <h4>Alergeni (UE)</h4>
                {allergenInfo.allergens.length ? (
                  <ul>
                    {allergenInfo.allergens.map((allergen) => (
                      <li key={allergen.code}>
                        <strong>{allergen.code}. {allergen.label}</strong>
                        <small>{allergen.description}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {allergenInfo.specified
                      ? "Niciun alergen din lista UE nu este selectat pentru acest produs."
                      : "Informațiile despre alergeni nu au fost încă specificate. Întreabă personalul."}
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      </article>
      {addedQuantity !== null ? (
        <PostAddCrossSellModal
          addedProduct={product}
          addedQuantity={addedQuantity}
          onClose={closePostAddModal}
        />
      ) : null}
    </>
  );
}

export function getAllergensLabel(product: Product) {
  const allergenInfo = getProductAllergenInfo(product);
  if (!allergenInfo.specified) return "Alergeni (UE): nespecificați";
  if (!allergenInfo.allergens.length) return "Alergeni (UE): niciunul selectat";
  return `Alergeni (UE): ${allergenInfo.allergens.map((allergen) => allergen.label).join(", ")}`;
}

export function getProductAllergenInfo(product: Product) {
  if (Array.isArray(product.allergenCodes)) {
    return { specified: true, allergens: allergenLabels(product.allergenCodes) };
  }
  const source = `${product.name} ${product.shortDescription ?? ""} ${product.description ?? ""}`;
  const explicitList = source.match(/\((\s*\d+\s*(?:,\s*\d+\s*)*)\)/);
  if (explicitList?.[1]) {
    const codes = explicitList[1]
      .split(",")
      .map((code) => Number(code.trim()))
      .filter((code) => Number.isInteger(code));
    return { specified: true, allergens: allergenLabels(codes) };
  }

  const inferredCodes = ALLERGEN_RULES
    .filter((entry) => entry.test.test(source))
    .flatMap((entry) => entry.codes);
  return inferredCodes.length
    ? { specified: true, allergens: allergenLabels(inferredCodes) }
    : { specified: false, allergens: [] };
}

const ALLERGEN_RULES: Array<{ test: RegExp; codes: number[] }> = [
  { test: /crispy|aripioare|snitel/i, codes: [1, 3, 6, 7, 10] },
  { test: /cheeseburger/i, codes: [1, 3, 6, 7, 10, 11] },
  { test: /platou/i, codes: [1, 6, 10] },
  { test: /hamsie/i, codes: [1, 4] },
  { test: /macrou/i, codes: [4] },
  { test: /mustar/i, codes: [10] },
  { test: /maioneza|smantana|branza|cheddar/i, codes: [7] },
  { test: /barbeque|bbq|mujdei|ketchup|sweet\s*chilli/i, codes: [6] },
  { test: /paine|mamaliga|cartofi|papanasi|clatite/i, codes: [1] },
  { test: /bere|neumarkt|ciuc|corona|amstel|heineken|radler|strongbow|birra/i, codes: [1] },
  { test: /vin|whisky|jack\s*daniels|j&b|red\s*label|jagermeister|metaxa|alexandrion|palinca|vodka|gin|rom|muse|purcari|huniade/i, codes: [12] }
];
