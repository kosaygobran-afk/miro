import Image from 'next/image';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  imageUrl: string;
  category: string;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <div className="bg-surface rounded-lg p-6 hover:bg-surface-hover transition-colors cursor-pointer border border-border-control">
      <div className="aspect-w-16 aspect-h-9 mb-4">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          className="rounded-lg object-cover"
        />
      </div>
      <h3 className="mb-2 text-lg font-bold text-foreground">{product.name}</h3>
      <p className="mb-2 text-muted-foreground line-clamp-2">{product.description}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-lg font-bold text-foreground">${(product.price / 100).toFixed(2)}</span>
        <span className="text-sm text-muted-foreground">{product.category}</span>
      </div>
    </div>
  );
}