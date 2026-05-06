import { notFound } from "next/navigation";

export default function EvalBuilderLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between border-b pb-3">
        <h1 className="text-xl font-semibold">Eval builder</h1>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <a href="/dev/eval-builder" className="hover:underline">Extracciones</a>
          <a href="/dev/eval-builder/export" className="hover:underline">Export</a>
        </nav>
      </header>
      {children}
    </div>
  );
}
