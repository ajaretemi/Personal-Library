import Link from "next/link";
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
  created_at: string;
};

type Props = {
  searchParams?: Promise<{
    status?: BookStatus;
    q?: string;
    sort?: "newest" | "rated";
    ratedOnly?: "1";
  }>;
};

export default async function Home({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const status = (sp.status ?? "TO_READ") as BookStatus;
  const q = (sp.q ?? "").trim();
  const sort = sp.sort ?? "newest";
  const ratedOnly = sp.ratedOnly === "1";

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("books")
    .select("id,title,author,status,rating,review,cover_url,created_at")
    .eq("status", status);

  if (q) {
    // Supabase OR filter: match title OR author
    const escaped = q.replace(/"/g, '\\"');
    query = query.or(`title.ilike."%${escaped}%",author.ilike."%${escaped}%"`);
  }

  if (ratedOnly) query = query.not("rating", "is", null);

  if (sort === "rated") {
    query = query
      .order("rating", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  const books = (data ?? []) as Book[];

  const buildHref = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();

    const nextStatus = params.status ?? status;
    const nextQ = params.q ?? q;
    const nextSort = params.sort ?? sort;
    const nextRatedOnly =
      params.ratedOnly ?? (ratedOnly ? "1" : undefined);

    if (nextStatus) p.set("status", nextStatus);
    if (nextQ) p.set("q", nextQ);
    if (nextSort) p.set("sort", nextSort);
    if (nextRatedOnly) p.set("ratedOnly", nextRatedOnly);

    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  const tabs: { key: BookStatus; label: string }[] = [
    { key: "TO_READ", label: "To Read" },
    { key: "READ", label: "Read" },
    { key: "WISHLIST", label: "Wishlist" },
  ];

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Library</h1>
          <p className="text-sm text-white">
            Public view — you edit from Admin.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link className="underline text-white" href="/admin">
            Admin
          </Link>
          <Link className="underline text-white" href="/login">
            Login
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <nav className="mt-6 flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key}
              href={buildHref({ status: t.key })}
              className={
                active
                  ? "px-3 py-1.5 rounded bg-indigo-600 text-white font-medium"
                  : "px-3 py-1.5 rounded bg-white border border-zinc-300 text-zinc-900 hover:bg-zinc-100"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Controls */}
      <section className="mt-4 border border-zinc-300 bg-white rounded-lg p-4">
        <form className="grid gap-3 md:grid-cols-12" action="/" method="get">
          <input type="hidden" name="status" value={status} />

          <div className="md:col-span-6">
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Search</span>
              <input
                name="q"
                defaultValue={q}
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Search title or author…"
              />
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Sort</span>
              <select
                name="sort"
                defaultValue={sort}
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="newest">Newest</option>
                <option value="rated">Highest rated</option>
              </select>
            </label>
          </div>

          <div className="md:col-span-2 flex items-end">
            <label className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                name="ratedOnly"
                value="1"
                defaultChecked={ratedOnly}
              />
              <span className="text-sm font-medium text-zinc-800">
                Rated only
              </span>
            </label>
          </div>

          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white rounded px-4 py-2 font-medium hover:bg-indigo-700"
            >
              Go
            </button>
          </div>
        </form>

        {error ? (
          <p className="mt-3 text-sm text-red-600">Error: {error.message}</p>
        ) : null}
      </section>

      {/* Results */}
      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {books.map((b) => (
          <Link key={b.id} href={`/book/${b.id}`} className="block">
            <article className="border border-zinc-300 bg-white rounded-lg p-3 hover:bg-zinc-50 transition-colors">
              {b.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.cover_url}
                  alt={`${b.title} cover`}
                  className="w-full h-44 object-cover rounded-md border border-zinc-200"
                />
              ) : (
                <div className="w-full h-44 bg-zinc-100 rounded-md flex items-center justify-center text-xs text-zinc-600 border border-zinc-200">
                  No cover
                </div>
              )}

              <div className="mt-2">
                <div className="font-semibold text-zinc-900 line-clamp-2">
                  {b.title}
                </div>
                <div className="text-sm text-zinc-700 line-clamp-1">
                  {b.author ?? "Unknown"}
                </div>

                <div className="text-xs mt-2 flex items-center gap-2 flex-wrap">
                  <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-900">
                    {b.status}
                  </span>
                  {typeof b.rating === "number" ? (
                    <span className="font-medium text-zinc-900">
                      ⭐ {b.rating}/5
                    </span>
                  ) : (
                    <span className="text-zinc-600">Not rated</span>
                  )}
                </div>
              </div>
            </article>
          </Link>
        ))}
      </section>

      {books.length === 0 ? (
        <p className="mt-8 text-white">No books found for this view.</p>
      ) : null}
    </main>
  );
}
