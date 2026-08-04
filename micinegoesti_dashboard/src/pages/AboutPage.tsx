export function AboutPage() {
  return (
    <section className="section-shell ygh-about">
      <div className="ygh-wrap">
        <div className="ygh-card ygh-hero">
          <div className="ygh-badge">🔥 Gust autentic. Fără compromisuri.</div>
          <h1 className="ygh-title">Despre noi</h1>
          <p className="ygh-lead">
            La <strong>Your Grill House</strong>, punem pe grătar mai mult decât mâncare bună. Punem tradiție, grijă pentru
            ingrediente și acel gust care te face să revii. Servim preparate făcute cu suflet, inspirate din rețete adevărate și
            pregătite proaspăt, exact cum trebuie.
          </p>
        </div>

        <div className="ygh-card ygh-section">
          <h2 className="ygh-section-title">Ce ne definește</h2>

          <div className="ygh-features">
            <div className="ygh-feature">
              <div className="ygh-icon">🥩</div>
              <div>
                <h3>Ingrediente bune</h3>
                <p>Folosim carne atent selecționată și condimente naturale, pentru un gust curat, bogat și autentic.</p>
              </div>
            </div>

            <div className="ygh-feature">
              <div className="ygh-icon">🌿</div>
              <div>
                <h3>Tradiție reinterpretată</h3>
                <p>Păstrăm esența rețetelor clasice, dar le pregătim într-un mod actual, atent și constant.</p>
              </div>
            </div>

            <div className="ygh-feature">
              <div className="ygh-icon">⚡</div>
              <div>
                <h3>Proaspăt și rapid</h3>
                <p>Preparăm pe loc și servim repede, ca să primești gustul perfect fără timp pierdut.</p>
              </div>
            </div>
          </div>

          <div className="ygh-quote">
            Pentru noi, un preparat bun nu înseamnă doar sătul. Înseamnă poftă, amintire și gustul acela simplu, făcut cum trebuie.
          </div>
        </div>

        <div className="ygh-card ygh-story">
          <h2 className="ygh-section-title">Povestea noastră</h2>
          <p className="ygh-story-intro">
            Totul a început într-o zi de primăvară, în satul Negoești, când Andrei a descoperit în podul bunicului un caiet vechi,
            îngălbenit de timp, plin de rețete și însemnări uitate.
          </p>

          <div className="ygh-steps">
            <div className="ygh-step">
              <div className="ygh-step-num">1</div>
              <p>
                Printre paginile fragile a găsit o comoară: <strong>rețeta secretă a micilor din Negoești</strong>, păstrată ca un mic
                tezaur de familie.
              </p>
            </div>

            <div className="ygh-step">
              <div className="ygh-step-num">2</div>
              <p>
                Inspirat de descoperire, a decis să readucă la viață gustul de altădată, folosind ingrediente alese cu grijă, carne
                proaspătă, condimente naturale și usturoi din grădina bunicului.
              </p>
            </div>

            <div className="ygh-step">
              <div className="ygh-step-num">3</div>
              <p>
                Cu răbdare și respect pentru tradiție, a refăcut rețeta pas cu pas, până când aroma autentică a prins din nou viață pe
                grătar.
              </p>
            </div>

            <div className="ygh-step">
              <div className="ygh-step-num">4</div>
              <p>
                Micii au cucerit repede satul și împrejurimile, iar ceea ce a început ca o descoperire personală a devenit un simbol
                local al gustului autentic.
              </p>
            </div>
          </div>

          <div className="ygh-quote ygh-quote-dark">
            Așa s-a născut povestea noastră: din memorie, din tradiție și din dorința de a pune pe masă un gust care merită dus mai
            departe.
          </div>
        </div>

        <div className="ygh-card ygh-contact">
          <h2 className="ygh-section-title">Ne găsești aici</h2>

          <div className="ygh-contact-grid">
            <div className="ygh-contact-item">
              <span className="ygh-label">Adresă</span>
              <p>Șoseaua Olteniței, Nr. 75, Sat Negoești, CL</p>
            </div>

            <div className="ygh-contact-item">
              <span className="ygh-label">Telefon</span>
              <a href="tel:+40747232306">0747 232 306</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
