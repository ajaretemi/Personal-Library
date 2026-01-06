import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BookStatus = "READ" | "TO_READ" | "WISHLIST";

type Book = {
  id: string;
  title: string;
  author: string | null;
  status: BookStatus;
  rating: number | null;
  review: string | null;
  cover_url: string | null;
  isbn13: string | null;
  created_at: string;
};

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("books")
    .select("id,title,author,status,rating,review,cover_url,isbn13,created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return notFound();

  const b = data as Book;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <Link className="underline text-white" href="/">
          ← Back
        </Link>
        <Link className="underline text-white" href="/admin">
          Admin
        </Link>
      </header>

      <section className="mt-6 border border-zinc-300 bg-white rounded-lg p-5">
        <div className="grid gap-6 md:grid-cols-12">
          <div className="md:col-span-4">
            {b.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.cover_url}
                alt={`${b.title} cover`}
                className="w-full rounded-md border border-zinc-200 object-cover"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-zinc-100 rounded-md border border-zinc-200 flex items-center justify-center text-sm text-zinc-600">
                No cover
              </div>
            )}
          </div>

          <div className="md:col-span-8">
            <h1 className="text-2xl font-bold text-zinc-900">{b.title}</h1>
            <p className="mt-1 text-zinc-700">{b.author ?? "Unknown author"}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-900">
                {b.status}
              </span>

              {typeof b.rating === "number" ? (
                <span className="font-medium text-zinc-900">⭐ {b.rating}/5</span>
              ) : (
                <span className="text-zinc-700">Not rated</span>
              )}

              {b.isbn13 ? (
                <span className="text-zinc-700">ISBN: {b.isbn13}</span>
              ) : null}
            </div>

            <div className="mt-6">
              <h2 className="text-lg font-semibold text-zinc-900">Review</h2>
              {b.review ? (
                <p className="mt-2 whitespace-pre-wrap text-zinc-800 leading-relaxed">
                  {b.review}
                </p>
              ) : (
                <p className="mt-2 text-zinc-700">No review yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
