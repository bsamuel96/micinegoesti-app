import { Camera, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { ShiftHandoverCategory, ShiftKey, ShiftPriority, ShiftTemplate, UserShiftProfile } from "../../api/types";

const categories: Array<{ value: ShiftHandoverCategory; label: string }> = [
  { value: "cleaning", label: "Curățenie" },
  { value: "stock", label: "Stoc lipsă" },
  { value: "equipment", label: "Problemă echipament" },
  { value: "customer_issue", label: "Problemă client" },
  { value: "food_quality", label: "Calitate mâncare" },
  { value: "safety", label: "Siguranță" },
  { value: "handover", label: "Predare generală" },
  { value: "staff", label: "Personal" },
  { value: "other", label: "Altceva" }
];

const priorities: Array<{ value: ShiftPriority; label: string }> = [
  { value: "low", label: "Mică" },
  { value: "normal", label: "Normală" },
  { value: "high", label: "Mare" },
  { value: "urgent", label: "Urgentă" }
];

const locations = ["Bucătărie", "Grill", "Bar", "Sală", "Terasă", "Depozit", "Frigidere", "Casă", "Baie", "Alt loc"];

type PhotoDraft = {
  file: File;
  caption: string;
  previewUrl: string;
};

export function HandoverForm({
  profile,
  templates,
  canManage,
  onCreated
}: {
  profile: UserShiftProfile | null;
  templates: ShiftTemplate[];
  canManage: boolean;
  onCreated: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [manualLinks, setManualLinks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photosRef = useRef<PhotoDraft[]>([]);
  const defaultShift = profile?.shiftKey ?? "shift_1";
  const templateByKey = useMemo(() => new Map(templates.map((template) => [template.shiftKey, template])), [templates]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotos((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        file,
        caption: "",
        previewUrl: URL.createObjectURL(file)
      }))
    ]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  return (
    <form
      className="handover-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setManualLinks([]);
        setSubmitting(true);
        try {
          const form = new FormData(event.currentTarget);
          form.delete("photos");
          photos.forEach((photo) => form.append("photos", photo.file, photo.file.name));
          form.set("captions", JSON.stringify(photos.map((photo) => photo.caption)));
          const response = await api.createShiftHandoverItem(form);
          const links = response.whatsapp?.results.map((result) => result.waMeUrl).filter(Boolean) as string[] | undefined;
          setManualLinks(links ?? []);
          photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
          setPhotos([]);
          event.currentTarget.reset();
          onCreated();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Nu am putut salva predarea.");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="handover-form-head">
        <div>
          <span>Feedback ture</span>
          <h2>Adaugă predare</h2>
        </div>
        <button className="primary-button" disabled={submitting}>
          <Send size={18} />
          {submitting ? "Se trimite..." : "Trimite"}
        </button>
      </div>

      <div className="handover-form-grid">
        <label>
          Sursa
          <select name="sourceShiftKey" defaultValue={defaultShift} disabled={!canManage}>
            {templates.map((template) => (
              <option value={template.shiftKey} key={template.shiftKey}>{template.label}</option>
            ))}
          </select>
          {!canManage && <input type="hidden" name="sourceShiftKey" value={defaultShift} />}
        </label>

        <label>
          Pentru
          <select name="targetShiftKey" defaultValue={defaultShift === "shift_1" ? "shift_2" : "shift_1"}>
            {templates.map((template) => (
              <option value={template.shiftKey} key={template.shiftKey}>{template.label}</option>
            ))}
            <option value="">Ambele ture / general</option>
          </select>
        </label>

        <label>
          Categorie
          <select name="category" defaultValue="handover">
            {categories.map((category) => (
              <option value={category.value} key={category.value}>{category.label}</option>
            ))}
          </select>
        </label>

        <label>
          Prioritate
          <select name="priority" defaultValue="normal">
            {priorities.map((priority) => (
              <option value={priority.value} key={priority.value}>{priority.label}</option>
            ))}
          </select>
        </label>

        <label>
          Loc
          <select name="locationLabel" defaultValue="Bucătărie">
            {locations.map((location) => (
              <option value={location} key={location}>{location}</option>
            ))}
          </select>
        </label>

        <label>
          WhatsApp opțional
          <input name="notifyWhatsAppNumber" placeholder="+40..." inputMode="tel" />
        </label>
      </div>

      <label>
        Titlu
        <input name="title" placeholder="Ex: Frigiderul mic nu răcește" required minLength={3} />
      </label>

      <label>
        Detalii
        <textarea name="description" rows={4} placeholder="Ce trebuie să știe tura următoare?" />
      </label>

      <label className="photo-upload-control">
        <Camera size={20} />
        <span>Adaugă poze</span>
        <input type="file" accept="image/*,.heic,.heif" multiple capture="environment" onChange={(event) => addPhotos(event.target.files)} />
      </label>

      {photos.length > 0 && (
        <div className="photo-preview-grid">
          {photos.map((photo, index) => (
            <div className="photo-preview" key={`${photo.file.name}-${index}`}>
              <img src={photo.previewUrl} alt="" />
              <input
                value={photo.caption}
                onChange={(event) =>
                  setPhotos((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, caption: event.target.value } : candidate))
                }
                placeholder="Descriere poză"
              />
              <button type="button" className="icon-button" onClick={() => removePhoto(index)} aria-label="Elimină poza">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {manualLinks.length > 0 && (
        <div className="handover-manual-wa">
          <strong>WhatsApp necesită trimitere manuală</strong>
          {manualLinks.map((link) => (
            <a className="primary-button" href={link} target="_blank" rel="noreferrer" key={link}>Deschide WhatsApp</a>
          ))}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      <p className="handover-retention-note">Pozele sunt păstrate ca fișiere timp de 7 zile; înregistrările rămân în aplicație.</p>
      <input type="hidden" name="sourceShiftKey" value={(defaultShift ?? "shift_1") as ShiftKey} />
      <span className="sr-only">{templateByKey.get(defaultShift)?.label}</span>
    </form>
  );
}
