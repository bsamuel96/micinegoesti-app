import { MapPin, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export function ContactPage() {
  const [sent, setSent] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
    event.currentTarget.reset();
  }

  return (
    <section className="section-shell contact-page contact-page-v2">
      <div className="contact-message-card">
        <div className="section-title">
          <span>Contact</span>
          <h1>Trimite-ne un mesaj</h1>
        </div>
        <p className="contact-lead">
          Lasă-ne numele, numărul de WhatsApp și mesajul tău. Te contactăm cât mai repede.
        </p>

        <form className="contact-message-form" onSubmit={onSubmit}>
          <label>
            Nume
            <input name="name" placeholder="Cum te numești?" required />
          </label>
          <label>
            Număr WhatsApp
            <input name="whatsapp" placeholder="07xx xxx xxx" required />
          </label>
          <label>
            Mesaj
            <textarea name="message" rows={5} placeholder="Scrie-ne aici mesajul tău..." required />
          </label>

          <label className="checkbox-row">
            <input type="checkbox" required />
            <span>
              Sunt de acord cu <Link to="/privacy">politica de confidențialitate</Link> și accept să fiu contactat în legătură cu
              solicitarea mea.
            </span>
          </label>

          <button className="primary-button" type="submit">Trimite mesajul</button>
          {sent && <p className="form-status">Mesaj trimis. Revenim cât mai repede.</p>}
        </form>
      </div>

      <div className="feedback-flow-launch">
        <span>Feedback</span>
        <h3>Vrei să ne lași feedback rapid?</h3>
        <p>Deschide formularul nostru de feedback și spune-ne părerea ta în mai puțin de 1 minut.</p>
        <Link className="primary-button" to="/feedback">Deschide formularul de feedback</Link>
      </div>

      <div className="contact-grid contact-ways-grid">
        <a href="tel:+40747232306">
          <Phone size={22} />
          <span>0747 232 306</span>
        </a>
        <a href="https://wa.me/40747232306" target="_blank" rel="noreferrer">
          <MessageCircle size={22} />
          <span>WhatsApp</span>
        </a>
        <div>
          <MapPin size={22} />
          <span>Șoseaua Olteniței, Nr. 75, Sat Negoești, CL</span>
        </div>
      </div>

      <iframe
        title="Mici de Negoești pe hartă"
        className="map-frame"
        loading="lazy"
        src="https://www.google.com/maps?q=Șoseaua%20Olteniței%2075%20Negoești%20Călărași&output=embed"
      />
    </section>
  );
}
