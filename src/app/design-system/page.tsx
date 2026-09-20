import Link from 'next/link';

export default function DesignSystemPage() {
  return (
    <section className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="bg-surface rounded-lg p-6 mb-8">
          <h1 className="mb-4 text-2xl font-bold text-foreground">Design System - Development Preview</h1>
          <p className="mb-2 text-sm text-muted-foreground">
            This page is for development preview only and is not indexed for search engines.
          </p>
          <p className="text-sm text-muted-foreground">
            It shows shell previews of protected routes that will require authentication and role-based access in production.
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-3">
          {/* Account Shell Preview */}
          <div className="bg-surface rounded-lg p-6">
            <h2 className="mb-4 text-xl font-bold text-foreground">Account Shell</h2>
            <p className="mb-4 text-muted-foreground">
              This is a preview of the account dashboard that will be available after customer login.
            </p>
            <div className="h-32 bg-border-subtle rounded flex items-center justify-center">
              <span className="text-muted-foreground">Account Dashboard Preview</span>
            </div>
            <Link href="/en/account" className="mt-4 block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary-hover">
              View in English (protected)
            </Link>
            <Link href="/he/account" className="mt-2 block w-full text-center bg-border-control text-muted-foreground hover:bg-border-control/75 px-4 py-2 rounded-md">
              הצפה בעברית (מוגן)
            </Link>
          </div>
          
          {/* Worker Shell Preview */}
          <div className="bg-surface rounded-lg p-6">
            <h2 className="mb-4 text-xl font-bold text-foreground">Worker Shell</h2>
            <p className="mb-4 text-muted-foreground">
              This is a preview of the worker dashboard that will be available after worker login.
            </p>
            <div className="h-32 bg-border-subtle rounded flex items-center justify-center">
              <span className="text-muted-foreground">Worker Dashboard Preview</span>
            </div>
            <Link href="/en/worker" className="mt-4 block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary-hover">
              View in English (protected)
            </Link>
            <Link href="/he/worker" className="mt-2 block w-full text-center bg-border-control text-muted-foreground hover:bg-border-control/75 px-4 py-2 rounded-md">
              הצפה בעברית (מוגן)
            </Link>
          </div>
          
          {/* Admin Shell Preview */}
          <div className="bg-surface rounded-lg p-6">
            <h2 className="mb-4 text-xl font-bold text-foreground">Admin Shell</h2>
            <p className="mb-4 text-muted-foreground">
              This is a preview of the admin dashboard that will be available after admin (CEO) login.
            </p>
            <div className="h-32 bg-border-subtle rounded flex items-center justify-center">
              <span className="text-muted-foreground">Admin Dashboard Preview</span>
            </div>
            <Link href="/en/admin" className="mt-4 block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary-hover">
              View in English (protected)
            </Link>
            <Link href="/he/admin" className="mt-2 block w-full text-center bg-border-control text-muted-foreground hover:bg-border-control/75 px-4 py-2 rounded-md">
              הצפה בעברית (מוגן)
            </Link>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-border-subtle rounded text-sm text-muted-foreground">
          <h3 className="mb-2 font-bold text-foreground">Notice:</h3>
          <p>
            These shell previews are for development only. In production, accessing these routes without proper authentication and authorization will redirect to the login page or show an access denied message.
          </p>
        </div>
      </div>
    </section>
  );
}