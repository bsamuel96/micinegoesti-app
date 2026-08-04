export function ProductSkeletons() {
  return (
    <div className="product-grid">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="product-skeleton" key={index}>
          <span />
          <b />
          <i />
        </div>
      ))}
    </div>
  );
}
