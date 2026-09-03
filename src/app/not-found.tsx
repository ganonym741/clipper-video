import Link from "next/link";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-lg border bg-white p-6 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-studio-ink text-white">
          <Scissors className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-black">Clip not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page does not exist in the studio workspace.
        </p>
        <Button asChild className="mt-5">
          <Link href="/">Back to studio</Link>
        </Button>
      </section>
    </main>
  );
}
