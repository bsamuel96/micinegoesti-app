import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Hash,
  Images,
  Star
} from "lucide-react";
import type { Category, Product } from "../../api/types";
import { PRODUCT_IMAGE_FALLBACK } from "../../lib/productImages";

export type ProductPreviewDraft = {
  name: string;
  shortDescription: string;
  price: number | null;
  categorySlug: string;
  productCode: string;
  isHouseSpecialty: boolean;
  isAvailable: boolean;
  isPublished: boolean;
};

type ProductEditorPreviewProps = {
  product?: Product;
  categories: Category[];
  draft: ProductPreviewDraft;
  imageUrl?: string;
  onBack: () => void;
};

function formatProductDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function ProductEditorPreview({
  product,
  categories,
  draft,
  imageUrl,
  onBack
}: ProductEditorPreviewProps) {
  const category = categories.find((item) => item.slug === draft.categorySlug);
  const categoryLabel = category?.label ?? product?.categories[0]?.label ?? "Fără categorie";
  const displayName = draft.name.trim() || "Produs nou";
  const shortDescription = draft.shortDescription.trim() || "Adaugă gramajul sau descrierea scurtă.";
  const price = draft.price == null || !Number.isFinite(draft.price) ? "0,00" : draft.price.toFixed(2).replace(".", ",");

  return (
    <aside className="product-editor-preview" aria-label="Previzualizare produs">
      <button className="product-editor-back" type="button" autoFocus onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={20} />
        Înapoi la produse
      </button>

      <div className="product-editor-preview-scroll">
        <div className="product-editor-preview-status">
          <span className={draft.isAvailable ? "is-positive" : "is-muted"}>
            {draft.isAvailable ? "Disponibil" : "Indisponibil"}
          </span>
          <span className={draft.isPublished ? "is-public" : "is-muted"}>
            {draft.isPublished ? "Public" : "Ascuns"}
          </span>
        </div>

        <div className="product-editor-preview-image">
          <img src={imageUrl || PRODUCT_IMAGE_FALLBACK} alt="" />
        </div>

        <div className="product-editor-preview-heading">
          <h3>{displayName}</h3>
          <p>{shortDescription}</p>
          <strong>{price} lei</strong>
        </div>

        <dl className="product-editor-preview-meta">
          <div>
            <dt><Star aria-hidden="true" size={17} /> Specialitatea casei</dt>
            <dd>{draft.isHouseSpecialty ? "Da" : "Nu"}</dd>
          </div>
          <div>
            <dt><Images aria-hidden="true" size={17} /> Imagini</dt>
            <dd>{product?.images.length ?? (imageUrl ? 1 : 0)}</dd>
          </div>
          <div>
            <dt><Hash aria-hidden="true" size={17} /> Categorie</dt>
            <dd>{categoryLabel}</dd>
          </div>
          <div>
            <dt><Hash aria-hidden="true" size={17} /> Cod produs</dt>
            <dd>{draft.productCode.trim() || "—"}</dd>
          </div>
          {product && (
            <>
              <div>
                <dt><CalendarDays aria-hidden="true" size={17} /> Creat</dt>
                <dd>{formatProductDate(product.createdAt)}</dd>
              </div>
              <div>
                <dt><Clock3 aria-hidden="true" size={17} /> Actualizat</dt>
                <dd>{formatProductDate(product.updatedAt)}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="product-editor-preview-state">
          <div>
            <span className={`product-state-switch${draft.isAvailable ? " is-on" : ""}`} aria-hidden="true" />
            <p><strong>Disponibil pentru vânzare</strong><small>{draft.isAvailable ? "Produsul poate fi comandat." : "Produsul nu poate fi comandat."}</small></p>
          </div>
          <div>
            <span className={`product-state-switch${draft.isPublished ? " is-on" : ""}`} aria-hidden="true" />
            <p><strong>Vizibil în meniu</strong><small>{draft.isPublished ? "Produsul este afișat clienților." : "Produsul este ascuns clienților."}</small></p>
          </div>
        </div>
      </div>

    </aside>
  );
}
