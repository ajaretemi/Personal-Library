import { NextResponse } from "next/server";

function cleanIsbn(input: string) {
  return input.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function pickFirstAuthorGoogle(volumeInfo: any): string {
  const authors = volumeInfo?.authors;
  return Array.isArray(authors) && authors.length ? String(authors[0]) : "";
}

function pickCoverGoogle(volumeInfo: any): string {
  const img = volumeInfo?.imageLinks;
  return img?.thumbnail || img?.smallThumbnail || "";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("isbn") ?? "";
  const isbn = cleanIsbn(raw);

  if (!isbn) return NextResponse.json({ error: "Missing isbn" }, { status: 400 });

  // 1) Open Library first
  const olUrl =
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}` +
    `&format=json&jscmd=data`;

  try {
    const olRes = await fetch(olUrl, { next: { revalidate: 60 * 60 } });
    if (olRes.ok) {
      const json = (await olRes.json()) as Record<string, any>;
      const key = `ISBN:${isbn}`;
      const b = json[key];

      if (b) {
        const title = b.title ?? "";
        const author =
          Array.isArray(b.authors) && b.authors.length ? b.authors[0]?.name ?? "" : "";
        const cover_url = b.cover?.large ?? b.cover?.medium ?? b.cover?.small ?? "";

        // If Open Library has the important pieces, return it.
        if (title && (author || cover_url)) {
          return NextResponse.json({
            title,
            author,
            cover_url,
            isbn13: isbn.length === 13 ? isbn : null,
            isbn10: isbn.length === 10 ? isbn : null,
            source: "openlibrary",
          });
        }
      }
    }
  } catch {
    // Ignore OL errors and try Google fallback
  }

  // 2) Google Books fallback
  const googleKey = process.env.GOOGLE_BOOKS_API_KEY;

  if (!googleKey) {
    return NextResponse.json(
      { error: "Open Library had no result and GOOGLE_BOOKS_API_KEY is not set." },
      { status: 404 }
    );
  }

  const gbUrl =
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}` +
    `&key=${encodeURIComponent(googleKey)}`;

  try {
    const gbRes = await fetch(gbUrl, { next: { revalidate: 60 * 60 } });
    if (!gbRes.ok) {
      return NextResponse.json({ error: "Google Books lookup failed" }, { status: 500 });
    }

    const gb = await gbRes.json();
    const item = Array.isArray(gb?.items) && gb.items.length ? gb.items[0] : null;

    if (!item) {
      return NextResponse.json({ error: "No results for that ISBN" }, { status: 404 });
    }

    const info = item.volumeInfo ?? {};
    const title = info.title ?? "";
    const author = pickFirstAuthorGoogle(info);
    const cover_url = pickCoverGoogle(info);

    return NextResponse.json({
      title,
      author,
      cover_url,
      isbn13: isbn.length === 13 ? isbn : null,
      isbn10: isbn.length === 10 ? isbn : null,
      source: "googlebooks",
    });
  } catch {
    return NextResponse.json({ error: "ISBN lookup failed" }, { status: 500 });
  }
}
