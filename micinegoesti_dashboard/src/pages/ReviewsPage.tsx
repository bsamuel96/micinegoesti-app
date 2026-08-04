const reviews = [
  ["Cei mai buni mici pe care i-am mâncat vreodată!", "Gust autentic, suculent și exact ca pe vremuri."],
  ["Servire rapidă și porții bune.", "Livrarea a fost caldă, iar cartofii au ajuns crocanți."],
  ["Recomand platourile.", "Foarte bune pentru masă în familie sau cu prietenii."]
];

export function ReviewsPage() {
  return (
    <section className="section-shell">
      <div className="section-title">
        <span>Recenzii</span>
        <h1>Ce spun clienții</h1>
      </div>
      <div className="review-list big">
        {reviews.map(([title, body]) => (
          <blockquote key={title}>
            <strong>{title}</strong>
            <p>{body}</p>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
