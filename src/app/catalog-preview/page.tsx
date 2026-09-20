import { ProductCard } from '@/features/catalog/product-card';

// Mock data for development preview
const mockProducts: Array<{
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  imageUrl: string;
  category: string;
}> = [
  {
    id: '1',
    name: 'HD Security Camera',
    description: '1080p indoor/outdoor security camera with night vision and motion detection.',
    price: 7999, // $79.99
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
    category: 'Security Cameras'
  },
  {
    id: '2',
    name: 'Wireless Alarm System',
    description: 'Complete wireless alarm system with door/window sensors and motion detector.',
    price: 19999, // $199.99
    imageUrl: 'https://images.unsplash.com/photo-1558618044-3a54f2d40a6a?w=400',
    category: 'Alarm Systems'
  },
  {
    id: '3',
    name: 'Video Doorbell',
    description: '1080p video doorbell with two-way audio and night vision.',
    price: 14999, // $149.99
    imageUrl: 'https://images.unsplash.com/photo-1597518788236-8ce9e5ea9cfd?w=400',
    category: 'Intercom & Access Control'
  },
  {
    id: '4',
    name: 'Mesh Wi-Fi System',
    description: 'Tri-band mesh Wi-Fi system for whole-home coverage.',
    price: 29999, // $299.99
    imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400',
    category: 'Network & Wi-Fi Installation'
  }
];

export default function CatalogPreviewPage() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-bold text-foreground">Product Catalog Preview</h1>
          <p className="text-sm text-muted-foreground">
            This is a development preview with mock data. In production, this will be replaced with the real product catalog from the database.
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {mockProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        
        <div className="mt-8 p-4 bg-border-subtle rounded text-sm text-muted-foreground">
          <h3 className="mb-2 font-bold text-foreground">Notice:</h3>
          <p>
            This preview uses mock data and is for development only. No real products, prices, or inventory are represented.
          </p>
        </div>
      </div>
    </section>
  );
}