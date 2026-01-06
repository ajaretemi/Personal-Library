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

  const [editing, setEditing] = useState<Book | null>(null);

  // edit form fields
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editStatus, setEditStatus] = useState<BookStatus>("TO_READ");
  const [editRating, setEditRating] = useState<number | "">("");
  const [editReview, setEditReview] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editIsbn, setEditIsbn] = useState("");

  // -------------------------
  // Helpers
  // -------------------------
  function cleanIsbn(input: unknown) {
    if (input == null) return "";

    return String(input)
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

  function openEdit(book: Book) {
    setEditing(book);
    setEditTitle(book.title ?? "");
    setEditAuthor(book.author ?? "");
    setEditStatus(book.status ?? "TO_READ");
    setEditRating(typeof book.rating === "number" ? book.rating : "");
    setEditReview(book.review ?? "");
    setEditCoverUrl(book.cover_url ?? "");
    setEditIsbn(book.isbn13 ?? "");
  }

  function closeEdit() {
    setEditing(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!editing) return;

    const cleanedIsbn = cleanIsbn(editIsbn);

    setLoading(true);
    const { error } = await supabase
      .from("books")
      .update({
        title: editTitle.trim(),
        author: editAuthor.trim() || null,
        status: editStatus,
        rating: editRating === "" ? null : editRating,
        review: editReview.trim() || null,
        cover_url: editCoverUrl.trim() || null,
        isbn13: cleanedIsbn || null,
      })
      .eq("id", editing.id);

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    closeEdit();
    await load();
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="mt-6 space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">
          Logged in: <span className="font-medium">{userId ?? "…"}</span>
        </p>
        <button className="underline" onClick={signOut}>
          Sign out
        </button>
      </div>

      {/* ADD BOOK */}
      <section className="border border-zinc-300 bg-white rounded-lg p-4">
        <h2 className="font-semibold text-zinc-900">Add a book</h2>

        <form onSubmit={addBook} className="mt-4 grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-zinc-900">Title</span>
              <input
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Status</span>
              <select
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              <span className="text-sm font-medium text-zinc-800">Author</span>
              <input
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-800">
                Rating (1–5)
              </span>
              <input
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            <span className="text-sm font-medium text-zinc-800">Review</span>
            <textarea
              className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              placeholder="optional"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-zinc-800">
                Cover URL
              </span>
              <input
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="optional"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-800">
                ISBN (13 preferred)
              </span>
              <input
                className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="scan or type"
              />
            </label>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              className="bg-zinc-200 text-zinc-900 rounded px-4 py-2 hover:bg-zinc-300 disabled:opacity-50"
              type="button"
              onClick={startScan}
              disabled={loading}
            >
              Scan ISBN
            </button>

            <button
              className="bg-zinc-200 text-zinc-900 rounded px-4 py-2 hover:bg-zinc-300 disabled:opacity-50"
              type="button"
              onClick={() => autofillByIsbn()}
              disabled={loading}
            >
              {loading ? "Working..." : "Auto-fill by ISBN"}
            </button>

            <button
              className="bg-indigo-600 text-white rounded px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
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
      <section className="border border-zinc-300 bg-white rounded-lg p-4">
        <h2 className="font-semibold text-zinc-900">
          Books (publicly visible)
        </h2>

        <div className="mt-4 grid gap-3">
          {books.map((b) => (
            <div
              key={b.id}
              className="border rounded p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium truncate text-zinc-900">
                  {b.title}
                </div>
                <div className="text-sm text-zinc-600">
                  {b.author ?? "Unknown"} • {b.status}
                  {typeof b.rating === "number" ? ` • ⭐ ${b.rating}/5` : ""}
                </div>
                {b.isbn13 ? (
                  <div className="text-xs text-gray-500 mt-1">
                    ISBN: {b.isbn13}
                  </div>
                ) : null}
                {b.review ? (
                  <div className="text-sm mt-2 whitespace-pre-wrap text-gray-500">
                    {b.review}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-3 items-center">
                <button
                  className="underline text-sm text-zinc-900"
                  onClick={() => openEdit(b)}
                >
                  Edit
                </button>
                <button
                  className="underline text-sm text-zinc-900"
                  onClick={() => removeBook(b.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {books.length === 0 ? (
            <p className="text-zinc-600">No books yet.</p>
          ) : null}
        </div>
      </section>

      {/* SCANNER OVERLAY */}
      {scanning ? (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-zinc-900 rounded-lg p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Scan ISBN</h3>
              <button className="underline" onClick={stopScan}>
                Close
              </button>
            </div>

            <video
              ref={videoRef}
              className="w-full rounded border border-zinc-300"
              muted
              playsInline
              autoPlay
            />

            <p className="text-sm text-zinc-700">
              Point your camera at the barcode. It will detect automatically.
            </p>

            {lastDetected ? (
              <p className="text-xs text-zinc-600">Detected: {lastDetected}</p>
            ) : null}

            {scanError ? (
              <p className="text-sm text-red-600">{scanError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* EDIT MODAL */}
      {editing ? (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-zinc-900 rounded-lg p-4 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold ">Edit book</h3>
              <button className="underline" onClick={closeEdit}>
                Close
              </button>
            </div>

            <form onSubmit={saveEdit} className="grid gap-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-zinc-800">
                    Title
                  </span>
                  <input
                    className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">
                    Status
                  </span>
                  <select
                    className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as BookStatus)
                    }
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
                  <span className="text-sm font-medium text-zinc-800">
                    Author
                  </span>
                  <input
                    className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">
                    Rating (1–5)
                  </span>
                  <input
                    className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editRating}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return setEditRating("");
                      const n = Number(v);
                      if (!Number.isNaN(n))
                        setEditRating(Math.max(1, Math.min(5, n)));
                    }}
                    inputMode="numeric"
                    placeholder="optional"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-zinc-800">
                  Review
                </span>
                <textarea
                  className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editReview}
                  onChange={(e) => setEditReview(e.target.value)}
                  rows={4}
                  placeholder="optional"
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-zinc-800">
                    Cover URL
                  </span>
                  <input
                    className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editCoverUrl}
                    onChange={(e) => setEditCoverUrl(e.target.value)}
                    placeholder="optional"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">
                    ISBN
                  </span>
                  <input
                    className="mt-1 w-full border border-zinc-400 rounded p-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editIsbn}
                    onChange={(e) => setEditIsbn(e.target.value)}
                    placeholder="optional"
                  />
                </label>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  className="bg-zinc-200 text-zinc-900 rounded px-4 py-2 hover:bg-zinc-300 disabled:opacity-50"
                  onClick={closeEdit}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 text-white rounded px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>

            {error ? <p className="text-red-600 text-sm">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
