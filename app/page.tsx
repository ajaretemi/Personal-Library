import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BookStatus = "READ" | "TO_READ" | "WISHLIST";

type Book = {
  id: string;
  title: string;
  author: string | null;
  status: BookStatus;
  rating: number | null;
  cover_url: string | null;
  created_at: string;
};

export default async function Home() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("books")
    .select("id,title,author,status,rating,cover_url,created_at")
    .order("created_at", { ascending: false });

  const books = (data ?? []) as Book[];

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">My Library</h1>

        <div className="flex items-center gap-3">
          <Link className="underline" href="/login">Admin Login</Link>
          <Link className="underline" href="/admin">Admin</Link>
        </div>
      </header>

      {error ? (
        <p className="mt-6 text-red-600">Error loading books: {error.message}</p>
      ) : null}

      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {books.map((b) => (
          <article key={b.id} className="border rounded-lg p-3">
            {b.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.cover_url}
                alt={`${b.title} cover`}
                className="w-full h-40 object-cover rounded-md"
              />
            ) : (
              <div className="w-full h-40 bg-gray-100 rounded-md flex items-center justify-center text-xs text-gray-500">
                No cover
              </div>
            )}

            <div className="mt-2">
              <div className="font-medium line-clamp-2">{b.title}</div>
              <div className="text-sm text-gray-600 line-clamp-1">{b.author ?? "Unknown"}</div>
              <div className="text-xs mt-1">
                <span className="inline-block px-2 py-0.5 rounded bg-gray-100">{b.status}</span>
                {typeof b.rating === "number" ? <span className="ml-2">⭐ {b.rating}/5</span> : null}
              </div>
            </div>
          </article>
        ))}
      </section>

      {books.length === 0 ? (
        <p className="mt-8 text-gray-600">No books yet. Log in to add your first book.</p>
      ) : null}
    </main>
  );
}
