import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { CategoryTabs } from "../components/CategoryTabs";
import { ProductCard } from "../components/ProductCard";
import { ProductSkeletons } from "../components/Skeletons";
import { useCart } from "../context/CartContext";
import { EU_ALLERGENS } from "../lib/allergens";

const OFFER_SLUG = "oferta-zilei";

export function MenuPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("category") ?? undefined;
  const [active, setActive] = useState(initial);
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.categories() });
  const withOfferTab = categories.data
    ? {
        categories: categories.data.categories.some((category) => category.slug === OFFER_SLUG)
          ? categories.data.categories
          : [
              ...categories.data.categories,
              { id: OFFER_SLUG, slug: OFFER_SLUG, label: "Oferta zilei", sortOrder: 9999, isActive: true }
            ]
      }
    : undefined;

  useEffect(() => {
    if (!active && withOfferTab?.categories.length) setActive(withOfferTab.categories[0].slug);
  }, [active, withOfferTab]);

  const products = useQuery({
    queryKey: ["products", active],
    queryFn: () => (active === OFFER_SLUG ? api.products(undefined) : api.products(active)),
    enabled: Boolean(active)
  });

  const productsToRender =
    active === OFFER_SLUG
      ? getOfferProducts(products.data?.products ?? [])
      : (products.data?.products ?? []);

  function changeCategory(slug: string) {
    setActive(slug);
    setParams({ category: slug });
  }

  return (
    <section className="menu-page">
      <div className="section-shell compact">
        <div className="section-title">
          <span>Meniu</span>
          <h1>Alege preparatele preferate</h1>
        </div>
      </div>
      {withOfferTab && <CategoryTabs categories={withOfferTab.categories} active={active} onChange={changeCategory} />}
      <div className="section-shell">
        {products.isLoading ? (
          <ProductSkeletons />
        ) : (
          <div className={`product-grid${active === OFFER_SLUG ? " product-grid-offer" : ""}`}>
            {productsToRender.map((product) => (
              <ProductCard product={product} key={product.id} />
            ))}
          </div>
        )}
      </div>

      <section className="section-shell compact allergen-legend-wrap" aria-label="Legendă alergeni">
        <details className="allergen-legend">
          <summary>LEGENDĂ ALERGENI (UE)</summary>
          <ol>
            {EU_ALLERGENS.map((allergen) => (
              <li key={allergen.code}>
                <strong>{allergen.label}</strong>
                <span>{allergen.description}</span>
              </li>
            ))}
          </ol>
        </details>
      </section>

    </section>
  );
}

function getOfferProducts(products: Awaited<ReturnType<typeof api.products>>["products"]) {
  const explicitOffer = products.filter((product) =>
    product.categories.some((category) => category.slug === OFFER_SLUG || /oferta/i.test(category.slug) || /oferta/i.test(category.label))
  );

  if (explicitOffer.length) return explicitOffer;

  return products.filter((product) => product.isAvailable).slice(0, 12);
}
