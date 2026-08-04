import type { Category } from "../api/types";

export function CategoryTabs({
  categories,
  active,
  onChange
}: {
  categories: Category[];
  active?: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="category-bar-wrap">
      <div className="category-bar">
        {categories.map((category) => (
          <button
            key={category.slug}
            className={active === category.slug ? "active" : ""}
            onClick={() => onChange(category.slug)}
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  );
}
