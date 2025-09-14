// src/app/page.tsx
"use client";

import { useRef, useState } from "react";

export default function Page() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPreview(url);
    setResult(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const f = fileRef.current?.files?.[0];
    if (!f) {
      setError("Please choose or take a photo of the label.");
      setLoading(false);
      return;
    }

    const fd = new FormData();
    fd.append("image", f);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setResult(json.data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Wine Label → ChatGPT</h1>
          <p className="text-sm text-gray-600">
            Snap or upload a bottle label. We send the photo to a vision model
            and return structured info: price estimate, drink window & tasting
            notes. No keys are stored client-side.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFile}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-gray-900 file:text-white hover:file:bg-black"
          />

          {preview && (
            <img
              src={preview}
              alt="preview"
              className="w-full rounded-xl shadow border"
            />
          )}

          <button
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze Label"}
          </button>
        </form>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800">
            {error}
          </div>
        )}

        {result && <ResultCard data={result} />}

        <footer className="text-xs text-gray-500">
          Tip: Prices are indicative; verify locally (Wine-Searcher, retailer).
        </footer>
      </div>
    </main>
  );
}

function ResultCard({ data }: { data: any }) {
  const r = data || {};
  const rl = r.recognizedLabel || {};
  const t = r.tastingNotes || {};
  const w2 = t.wsetLevel2 || {};
  const dw = r.drinkWindow || {};
  const p = r.priceEstimate || {};

  return (
    <section className="space-y-4">
      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Recognized Label</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field k="Producer" v={rl.producer} />
          <Field k="Wine" v={rl.wine} />
          <Field k="Appellation" v={rl.appellation} />
          <Field k="Region" v={rl.region} />
          <Field k="Country" v={rl.country} />
          <Field k="Vintage" v={rl.vintage} />
        </div>
      </div>

      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Tasting Notes</h2>
        <PillList label="Nose" items={t.nose || []} />
        <PillList label="Palate" items={t.palate || []} />
        {t.finish && (
          <div className="text-sm">
            <span className="font-medium">Finish:</span> {t.finish}
          </div>
        )}
        <div className="text-sm grid grid-cols-2 gap-2">
          <Field k="Sweetness" v={w2.sweetness} />
          <Field k="Acidity" v={w2.acidity} />
          <Field k="Tannin" v={w2.tannin} />
          <Field k="Body" v={w2.body} />
          <Field k="Alcohol" v={w2.alcohol} />
          <Field k="Finish Length" v={w2.finishLength} />
        </div>
      </div>

      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Drink Window</h2>
        <div className="text-sm grid grid-cols-2 gap-2">
          <Field k="Drink Now" v={String(dw.drinkNow)} />
          <Field k="From" v={dw.from} />
          <Field k="To" v={dw.to} />
          <Field k="Peak From" v={dw.peakFrom} />
          <Field k="Peak To" v={dw.peakTo} />
          <Field k="Decant" v={dw.decant} />
        </div>
      </div>

      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Price (estimate)</h2>
        <div className="text-sm grid grid-cols-2 gap-2">
          <Field k="Currency" v={p.currency} />
          <Field
            k="Range"
            v={
              p.low != null && p.high != null ? `${p.low} – ${p.high}` : "—"
            }
          />
          <Field k="Confidence" v={p.confidence} />
        </div>
        {p.note && <div className="text-xs text-gray-600">{p.note}</div>}
      </div>

      {Array.isArray(r.caveats) && r.caveats.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-2xl text-sm">
          <div className="font-medium mb-1">Caveats</div>
          <ul className="list-disc pl-5 space-y-1">
            {r.caveats.map((c: string, i: number) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Field({ k, v }: { k: string; v: any }) {
  return (
    <div>
      <span className="font-medium">{k}:</span> {v ?? "—"}
    </div>
  );
}

function PillList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="text-sm">
      <div className="font-medium mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <span
            key={i}
            className="px-2 py-1 bg-gray-100 rounded-full border text-gray-800"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
