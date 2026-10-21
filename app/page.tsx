import { requireSuperadmin } from "@/lib/dal";

export default async function Home() {
  await requireSuperadmin();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">Deconstructive Criticism admin</h1>
      <p className="mt-2 text-muted">The admin area is being set up.</p>
    </main>
  );
}
