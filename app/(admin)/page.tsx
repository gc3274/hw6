import { requireSuperadmin } from "@/lib/dal";

export default async function Home() {
  await requireSuperadmin();

  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight">Overview</h1>
      <p className="mt-2 text-muted">Stats on the critic panel will show here.</p>
    </>
  );
}
