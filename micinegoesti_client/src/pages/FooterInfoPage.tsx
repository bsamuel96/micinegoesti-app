import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const logoUrl = "/assets/brand/cropped-LogoWebsite.png";

export function FooterInfoPage() {
  return (
    <section className="section-shell footer-info-page">
      <div className="footer-info-card">
        <Link to="/" className="footer-info-back" aria-label="Înapoi">
          <ArrowLeft size={18} />
          <span>Înapoi</span>
        </Link>

        <div className="footer-info-brand">
          <img src={logoUrl} alt="Mici de Negoești" />
          <div>
            <strong>Your Grill House - Mici de Negoești</strong>
            <p>Gustul tradiției renăscut: micii autentici din Negoești, făcuți cu pasiune și rețeta bunicului.</p>
          </div>
        </div>

        <div className="footer-info-grid">
          <div>
            <strong>Social media</strong>
            <p>
              <a href="https://www.facebook.com" target="_blank" rel="noreferrer">Facebook</a><br />
              <a href="https://wa.me/40747232306" target="_blank" rel="noreferrer">Whatsapp</a><br />
              <a href="https://www.tiktok.com" target="_blank" rel="noreferrer">Tiktok</a><br />
              <a href="https://www.instagram.com" target="_blank" rel="noreferrer">Instagram</a>
            </p>
          </div>

          <div>
            <strong>Program</strong>
            <p>Luni–Sâmbătă: 09:00–23:00<br />Duminică: 07:00–22:00</p>
          </div>

          <div>
            <strong>Date firmă</strong>
            <p>
              Denumire firmă: YOUR HOUSE SRL<br />
            </p>
          </div>

          <div>
            <strong>Cum dai de noi?</strong>
            <p>
              Șoseaua Olteniței, Nr. 75, Sat Negoești, CL<br />
              <a href="tel:+40747232306">+40 747 232 306</a>
            </p>
          </div>
        </div>

        <div className="footer-info-anpc">
          <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noreferrer" aria-label="Soluționarea Alternativă a Litigiilor">
            <img src="/assets/brand/anpc-sal.png" alt="Soluționarea Alternativă a Litigiilor" loading="lazy" />
          </a>
          <a href="https://ec.europa.eu/consumers/odr/main/index.cfm?event=main.home2.show&lng=RO" target="_blank" rel="noreferrer" aria-label="Soluționarea Online a Litigiilor">
            <img src="/assets/brand/anpc-sol.png" alt="Soluționarea Online a Litigiilor" loading="lazy" />
          </a>
        </div>

        <p className="footer-credit">
          Implementare și design: <a href="https://digitalromanian.com" target="_blank" rel="noreferrer">Digital Romanian</a>
        </p>
      </div>
    </section>
  );
}
