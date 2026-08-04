import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { ShiftHandoverAttachment } from "../../api/types";

const expiredText = "Poza a fost ștearsă automat după 7 zile. Înregistrarea a fost păstrată.";

export function HandoverGallery({ attachments }: { attachments: ShiftHandoverAttachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function load() {
      const nextUrls: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};

      for (const attachment of attachments) {
        if (!attachment.isAvailable) continue;
        try {
          const blob = await api.shiftHandoverAttachmentBlob(attachment.id);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          nextUrls[attachment.id] = url;
        } catch (error) {
          nextErrors[attachment.id] = error instanceof Error ? error.message : expiredText;
        }
      }

      if (!cancelled) {
        setUrls(nextUrls);
        setErrors(nextErrors);
      }
    }

    load();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments]);

  if (!attachments.length) return null;

  return (
    <div className="handover-gallery">
      {attachments.map((attachment) => {
        const unavailable = !attachment.isAvailable || errors[attachment.id];
        return (
          <figure className={unavailable ? "handover-photo is-expired" : "handover-photo"} key={attachment.id}>
            {urls[attachment.id] && !unavailable ? (
              <img src={urls[attachment.id]} alt={attachment.caption || attachment.originalFilename || "Poză predare tură"} />
            ) : (
              <div className="handover-photo-placeholder">
                <ImageOff size={22} />
                <span>{expiredText}</span>
              </div>
            )}
            {attachment.caption && <figcaption>{attachment.caption}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}
