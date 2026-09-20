import Link from 'next/link';

export default function WorkerPage() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="bg-surface rounded-lg p-6 text-center">
          <h1 className="mb-4 text-2xl font-bold text-foreground">Worker Dashboard</h1>
          <p className="mb-6 text-lg text-muted-foreground">
            This page is protected and requires worker authentication.
          </p>
          <p className="text-muted-foreground">
            In production, this page would display your assigned work after signing in as a worker.
          </p>
          <Link href="/auth/login" className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary-hover">
            Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}