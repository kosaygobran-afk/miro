import { Camera, Router, ShieldCheck, Siren, ShoppingCart } from "lucide-react";

export interface Product {
  id: string;
  name: string;
  description: string;
  priceIls: number;
  category: string;
  badge?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const icons = [Camera, Siren, ShieldCheck, Router];

export function ProductCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  const Icon = product.icon || icons[index % icons.length];

  return (
    <article className="miro-card flex h-full flex-col overflow-hidden p-5 rounded-2xl hover:bg-surface-hover transition-all duration-300 shadow-lg hover:shadow-xl">
      <div className="relative mb-4 grid aspect-[4/3] place-items-center rounded-xl bg-surface-muted">
        {product.badge ? (
          <span className="absolute end-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-black text-primary-foreground">
            {product.badge}
          </span>
        ) : null}
        <div className="grid size-24 place-items-center rounded-xl border border-border-control bg-background shadow-xl">
          <Icon className="size-12 text-foreground" aria-hidden="true" />
        </div>
      </div>
      <h3 className="text-lg font-black text-foreground">{product.name}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">
        {product.description}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xl font-black text-foreground">
          ₪{product.priceIls.toLocaleString("he-IL")}
        </span>
        <button
          className="miro-button miro-button-primary min-h-10 px-4 py-2.5 text-sm rounded-xl"
          type="button"
        >
          <ShoppingCart className="size-4" aria-hidden="true" />
          <span>Preview</span>
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{product.category}</p>
    </article>
  );
}
