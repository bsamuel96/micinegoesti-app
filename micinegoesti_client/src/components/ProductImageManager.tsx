import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Product } from "../api/types";

export const PRODUCT_IMAGE_MAX_IMAGES = 8;
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED = new Set(PRODUCT_IMAGE_ACCEPTED_TYPES);

export function ProductImageManager({ product, onDone }: { product: Product; onDone: () => void }) {
  const [files, setFiles] = useState<Array<{ file: File; preview: string; error?: string }>>([]);
  const [pending, setPending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const filesRef = useRef(files);
  const orderedImages = useMemo(() => [...product.images].sort((a, b) => a.sortOrder - b.sortOrder), [product.images]);
  const remainingSlots = Math.max(0, PRODUCT_IMAGE_MAX_IMAGES - product.images.length - files.length);
  const validFiles = files.filter((item) => !item.error);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  function select(selected: FileList | null) {
    if (!selected) return;
    const next = [...selected].slice(0, remainingSlots).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      error: !ACCEPTED.has(file.type)
        ? "Formatul imaginii nu este acceptat."
        : file.size > PRODUCT_IMAGE_MAX_BYTES
          ? "Imaginea depășește limita de 10 MB."
          : undefined
    }));
    setMessage("");
    setFiles((current) => [...current, ...next]);
    if (selected.length > remainingSlots) setMessage(`Poți încărca maximum ${PRODUCT_IMAGE_MAX_IMAGES} imagini.`);
  }

  async function upload() {
    const valid = files.filter((item) => !item.error);
    if (!valid.length) return;
    setPending(true);
    setMessage("");
    try {
      await api.uploadProductImages(product.id, valid.map((item) => item.file));
      valid.forEach((item) => URL.revokeObjectURL(item.preview));
      setFiles((current) => current.filter((item) => item.error));
      setMessage("Imaginile au fost încărcate.");
      onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Încărcarea imaginii a eșuat. Încearcă din nou.");
    } finally {
      setPending(false);
    }
  }

  async function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...orderedImages];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    await api.reorderProductImages(product.id, next.map((image) => image.id));
    onDone();
  }

  async function makePrimary(index: number) {
    if (index === 0) return;
    const next = [...orderedImages];
    const [primary] = next.splice(index, 1);
    if (!primary) return;
    await api.reorderProductImages(product.id, [primary, ...next].map((image) => image.id));
    onDone();
  }

  function removePending(index: number) {
    setFiles((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  return (
    <section className="product-image-manager product-media-manager" aria-busy={pending}>
      <div className="product-image-manager-head product-media-manager-head">
        <div>
          <h3>Imagini produs</h3>
          <p>Încarcă imagini JPG, PNG sau WEBP.</p>
          <p>Recomandat: imagini clare, centrate pe produs, maximum 10 MB per imagine.</p>
        </div>
        <span>{product.images.length + files.length}/{PRODUCT_IMAGE_MAX_IMAGES}</span>
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
          <input className="visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => select(event.target.files)} disabled={pending || remainingSlots === 0} />
        </label>

        {orderedImages.map((image, index) => (
          <article
            key={image.id}
            className="product-media-tile"
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/product-image-index", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData("text/product-image-index"));
              if (Number.isInteger(from)) void reorder(from, index);
            }}
          >
            <img src={image.thumbnailUrl || image.url} alt={image.alt || product.name} />
            {index === 0 ? (
              <b className="product-media-primary">Imagine principală</b>
            ) : (
              <button type="button" className="product-media-primary-action" onClick={() => makePrimary(index)} disabled={pending}>
                <Star aria-hidden="true" size={15} />
                Principală
              </button>
            )}
            <button type="button" className="product-media-delete" onClick={async () => {
                if (!window.confirm("Ștergi această imagine?")) return;
                await api.deleteProductImage(product.id, image.id);
                onDone();
              }} disabled={pending} aria-label={`Șterge imaginea ${index + 1}`}>
              <Trash2 size={28} />
            </button>
            <label className="product-media-alt">
              <span className="visually-hidden">Text alternativ pentru imaginea {index + 1}</span>
              <input
                aria-label={`Text alternativ pentru imaginea ${index + 1}`}
                defaultValue={image.alt ?? ""}
                placeholder="Text alternativ"
                onBlur={(event) => api.updateProductImage(product.id, image.id, event.target.value || null).catch(() => setMessage("Textul alternativ nu a putut fi salvat."))}
              />
            </label>
          </article>
        ))}
        {files.map((item, index) => (
          <article key={item.preview} className={`product-media-tile product-media-pending${item.error ? " has-error" : ""}`}>
            <img src={item.preview} alt="" />
            <b className="product-media-pending-badge">{item.error || "Pregătită"}</b>
            <button type="button" className="product-media-delete" onClick={() => removePending(index)} aria-label={`Elimină imaginea pregătită ${index + 1}`}>
              <Trash2 size={28} />
            </button>
          </article>
        ))}
      </div>
      {validFiles.length > 0 && <button type="button" className="primary-button product-media-upload-action" onClick={upload} disabled={pending}>{pending ? "Se încarcă…" : `Încarcă ${validFiles.length} ${validFiles.length === 1 ? "imagine" : "imagini"}`}</button>}
      {message && <p className="field-hint" role="status">{message}</p>}
    </section>
  );
}
