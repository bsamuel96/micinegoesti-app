export function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const isPrivacy = type === "privacy";
  return (
    <section className="section-shell legal-page">
      <div className="section-title">
        <span>Legal</span>
        <h1>{isPrivacy ? "Politica de confidențialitate" : "Termeni și condiții"}</h1>
      </div>
      {isPrivacy ? (
        <>
          <p>Prelucrăm datele necesare pentru autentificare, comenzi, livrare, facturare și comunicări operaționale pe WhatsApp.</p>
          <p>Datele de contact, adresa de livrare și istoricul comenzilor sunt păstrate doar cât este necesar pentru relația comercială și obligațiile legale.</p>
          <p>Pentru cereri GDPR, contactează restaurantul la 0747 232 306 sau pe WhatsApp.</p>
        </>
      ) : (
        <>
          <p>Comenzile sunt confirmate de restaurant în funcție de program și disponibilitatea produselor.</p>
          <p>Costul de livrare este configurat simplu de restaurant. Ridicarea de la restaurant are cost 0 RON.</p>
          <p>Statusul comenzii poate fi urmărit public folosind linkul de tracking sau numărul comenzii împreună cu telefonul.</p>
        </>
      )}
    </section>
  );
}
