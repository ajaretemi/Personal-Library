"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type BookStatus = "READ" | "TO_READ" | "WISHLIST";
const STATUSES: BookStatus[] = ["READ", "TO_READ", "WISHLIST"];

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

export default function AdminClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // auth + data
  const [userId, setUserId] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<BookStatus>("TO_READ");
  const [rating, setRating] = useState<number | "">("");
  const [review, setReview] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [isbn, setIsbn] = useState("");

  const [loading, setLoading] = useState(false);

  // scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [lastDetected, setLastDetected] = useState<string | null>(null);

  // -------------------------
  // Helpers
  // -------------------------
  function cleanIsbn(input: string) {
    return input
      .replace(/[^0-9Xx]/g, "")
      .toUpperCase()
      .trim();
  }

  async function load() {
    setError(null);

    // get logged-in user
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setError(userErr.message);
      return;
    }
    setUserId(userRes.user?.id ?? null);

    // load books (publicly visible but we're on admin)
    const { data, error } = await supabase
      .from("books")
      .select(
        "id,title,author,status,rating,review,cover_url,isbn13,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setBooks((data ?? []) as Book[]);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function addBook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!userId) {
      setError("Not logged in.");
      return;
    }

    const cleanedIsbn = cleanIsbn(isbn);

    setLoading(true);
    const { error } = await supabase.from("books").insert({
      owner_id: userId,
      title: title.trim(),
      author: author.trim() || null,
      status,
      rating: rating === "" ? null : rating,
      review: review.trim() || null,
      cover_url: coverUrl.trim() || null,
      isbn13: cleanedIsbn || null,
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // reset form
    setTitle("");
    setAuthor("");
    setStatus("TO_READ");
    setRating("");
    setReview("");
    setCoverUrl("");
    setIsbn("");

    await load();
  }

  async function removeBook(id: string) {
    setError(null);
    if (!confirm("Delete this book?")) return;

    const { error } = await supabase.from("books").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  async function autofillByIsbn(isbnOverride?: string) {
    setError(null);

    const cleaned = cleanIsbn(isbnOverride ?? isbn);
    if (!cleaned) {
      setError("Enter an ISBN first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/isbn?isbn=${encodeURIComponent(cleaned)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "ISBN lookup failed");
        return;
      }

      // Fill what we got
      if (data.title) setTitle(String(data.title));
      if (data.author) setAuthor(String(data.author));
      if (data.cover_url) setCoverUrl(String(data.cover_url));

      // Keep ISBN in the field (prefer returned isbn13)
      if (data.isbn13) setIsbn(String(data.isbn13));
      else setIsbn(cleaned);
    } catch {
      setError("ISBN lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------
  // Scanner
  // -------------------------
  function startScan() {
    setScanError(null);
    setError(null);
    setLastDetected(null);
    setScanning(true);

    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }

    // Let the overlay render <video> first
    setTimeout(async () => {
      const video = videoRef.current;
      const reader = readerRef.current;

      if (!video || !reader) {
        setScanError("Scanner video not ready.");
        setScanning(false);
        return;
      }

      try {
        // Stop any previous scan
        try {
          controlsRef.current?.stop();
        } catch {}
        controlsRef.current = null;

        // Start continuous decode
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, err, ctrl) => {
            if (!result) return;

            const raw = result.getText();
            setLastDetected(raw);

            const cleaned = cleanIsbn(raw);

            // Only accept proper ISBN-10 or ISBN-13
            if (cleaned.length === 10 || cleaned.length === 13) {
              setIsbn(cleaned);

              // Stop scanning + close overlay
              try {
                ctrl.stop();
              } catch {}
              controlsRef.current = null;

              // Close overlay
              setScanning(false);

              // Trigger lookup using the scanned value directly (no state timing issues)
              void autofillByIsbn(cleaned);
            }
          }
        );

        controlsRef.current = controls;
      } catch (e: any) {
        setScanError(e?.message ?? "Scan failed.");
        setScanning(false);
      }
    }, 100);
  }

  function stopScan() {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;

    try {
      readerRef.current?.reset();
    } catch {}

    setScanning(false);
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="mt-6 space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Logged in: <span className="font-medium">{userId ?? "…"}</span>
        </p>
        <button className="underline" onClick={signOut}>
          Sign out
        </button>
      </div>

      {/* ADD BOOK */}
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold">Add a book</h2>

        <form onSubmit={addBook} className="mt-4 grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-sm">Title</span>
              <input
                className="mt-1 w-full border rounded p-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="text-sm">Status</span>
              <select
                className="mt-1 w-full border rounded p-2"
                value={status}
                onChange={(e) => setStatus(e.target.value as BookStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-sm">Author</span>
              <input
                className="mt-1 w-full border rounded p-2"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm">Rating (1–5)</span>
              <input
                className="mt-1 w-full border rounded p-2"
                value={rating}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") return setRating("");
                  const n = Number(v);
                  if (!Number.isNaN(n)) setRating(Math.max(1, Math.min(5, n)));
                }}
                inputMode="numeric"
                placeholder="optional"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm">Review</span>
            <textarea
              className="mt-1 w-full border rounded p-2"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              placeholder="optional"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-sm">Cover URL</span>
              <input
                className="mt-1 w-full border rounded p-2"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="optional"
              />
            </label>

            <label className="block">
              <span className="text-sm">ISBN (13 preferred)</span>
              <input
                className="mt-1 w-full border rounded p-2"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="scan or type"
              />
            </label>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              className="border rounded px-4 py-2 font-medium"
              type="button"
              onClick={startScan}
              disabled={loading}
            >
              Scan ISBN
            </button>

            <button
              className="border rounded px-4 py-2 font-medium"
              type="button"
              onClick={autofillByIsbn}
              disabled={loading}
            >
              {loading ? "Working..." : "Auto-fill by ISBN"}
            </button>

            <button
              className="border rounded px-4 py-2 font-medium"
              type="submit"
              disabled={loading}
            >
              {loading ? "Adding..." : "Add book"}
            </button>
          </div>

          {error ? <p className="text-red-600 text-sm">{error}</p> : null}
        </form>
      </section>

      {/* BOOK LIST */}
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold">Books (publicly visible)</h2>

        <div className="mt-4 grid gap-3">
          {books.map((b) => (
            <div
              key={b.id}
              className="border rounded p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{b.title}</div>
                <div className="text-sm text-gray-600">
                  {b.author ?? "Unknown"} • {b.status}
                  {typeof b.rating === "number" ? ` • ⭐ ${b.rating}/5` : ""}
                </div>
                {b.isbn13 ? (
                  <div className="text-xs text-gray-500 mt-1">
                    ISBN: {b.isbn13}
                  </div>
                ) : null}
                {b.review ? (
                  <div className="text-sm mt-2 whitespace-pre-wrap">
                    {b.review}
                  </div>
                ) : null}
              </div>

              <button
                className="underline text-sm"
                onClick={() => removeBook(b.id)}
              >
                Delete
              </button>
            </div>
          ))}

          {books.length === 0 ? (
            <p className="text-gray-600">No books yet.</p>
          ) : null}
        </div>
      </section>

      {/* SCANNER OVERLAY */}
      {scanning ? (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Scan ISBN</h3>
              <button className="underline" onClick={stopScan}>
                Close
              </button>
            </div>

            <video
              ref={videoRef}
              className="w-full rounded border"
              muted
              playsInline
              autoPlay
            />

            <p className="text-sm text-gray-600">
              Point your camera at the barcode. It will detect automatically.
            </p>

            {scanError ? (
              <p className="text-sm text-red-600">{scanError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {lastDetected ? (
        <p className="text-xs text-gray-600">Detected: {lastDetected}</p>
      ) : null}
    </div>
  );
}
