// src/app/page.tsx
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useRef, useState } from "react";

/** Shape we expect back from the API. All fields optional/loose on purpose. */
type WsetL2 = Partial<{
  sweetness: string;
  acidity: string;
  tannin: string;
  body: string;
  alcohol: string;
  finishLength: string;
}>;

type TastingNotes = Partial<{
  nose: string[];
  palate: string[];
  finish: string;
  wsetLevel2: WsetL2;
}>;

type RecognizedLabel = Partial<{
  producer: string;
  wine: string;
  appellation: string;
  region: string;
  country: string;
  vintage: string | number;
}>;

type DrinkWindow = Partial<{
  drinkNow: boolean;
  from: string;
  to: string;
  peakFrom: string;
  peakTo: string;
  decant: string;
}>;

type PriceEstimate = Partial<{
  currency: string;
  low: number;
  high: number;
  confidence: string;
  note: string;
}>;

type AromasAndFlavours = Partial<{
  primary: string[];
  secondary: string[];
  tertiary: string[];
}>;

type GrapePart = { variety: string; percent: number | null };

type ApiResult = Partial<{
  recognizedLabel: RecognizedLabel;
  tastingNotes: TastingNotes;
  drinkWindow: DrinkWindow;
  priceEstimate: PriceEstimate;
  aromasAndFlavours: AromasAndFlavours;
  grapes: GrapePart[] | string[]; // backward compatible with earlier string[] shape
  caveats: string[];
}>;

export default function Page() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
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
      setError("⚠️ Please upload a wine label image before analyzing.");
      setLoading(false);
      return;
    }

    const fd = new FormData();
    fd.append("image", f);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        // bubble up the API's message if present
        throw new Error(typeof json?.error === "string" ? json.error : "Request failed");
      }
      setResult(json.data as ApiResult);
    } catch (err: unknown) {
      let msg = "Something went wrong.";
      if (err instanceof Error) msg = err.message;

      if (/429/.test(msg) || /quota/i.test(msg)) {
        msg =
          "⚠️ You’ve used up your OpenAI credits or hit a rate limit. Please check your OpenAI billing and try again later.";
      } else if (/401/.test(msg) || /unauthorized/i.test(msg)) {
        msg =
          "⚠️ API key problem. Check your OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables.";
      } else if (/No image supplied/i.test(msg)) {
        msg = "⚠️ Please upload a wine label image before analyzing.";
      }

      setError(msg);
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
            Snap or upload a bottle label. We send the photo to a vision model and return structured info: price estimate,
            drink window & tasting notes. No keys are stored client-side.
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
            <img src={preview} alt="preview" className="w-full rounded-xl shadow border" />
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

        {/* Guard so a render error in the card won't blank the whole page */}
        {result ? <SafeResult result={result} /> : null}

        <footer className="text-xs text-gray-500">
          Tip: Prices are indicative; verify locally (Wine-Searcher, retailer).
        </footer>
      </div>
    </main>
  );
}

function SafeResult({ result }: { result: ApiResult }) {
  try {
    return <ResultCard data={result} />;
  } catch (e) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-800">
        Component crashed while rendering: {e instanceof Error ? e.message : "unknown error"}
      </div>
    );
  }
}

function ResultCard({ data }: { data: ApiResult }) {
  const rl = (data.recognizedLabel ?? {}) as RecognizedLabel;
  const tn = (data.tastingNotes ?? {}) as TastingNotes;
  const w2 = (tn.wsetLevel2 ?? {}) as WsetL2;
  const dw = (data.drinkWindow ?? {}) as DrinkWindow;
  const pe = (data.priceEstimate ?? {}) as PriceEstimate;
  const af = (data.aromasAndFlavours ?? {}) as AromasAndFlavours;

  // Normalise grapes (support string[] and {variety, percent}[])
  const grapesRaw = data.grapes ?? [];
  const grapes: GrapePart[] = Array.isArray(grapesRaw)
    ? grapesRaw.map((g) => {
        if (typeof g === "string") return { variety: g, percent: null };
        const obj = g as Partial<GrapePart>;
        return {
          variety: String(obj?.variety ?? ""),
          percent: typeof obj?.percent === "number" ? obj.percent : null,
        };
      })
    : [];

  return (
    <section className="space-y-4">
      {/* Wine Information */}
      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Wine Information</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field k="Producer" v={safeStr(rl.producer)} />
          <Field k="Wine" v={safeStr(rl.wine)} />
          <Field k="Appellation" v={safeStr(rl.appellation)} />
          <Field k="Region" v={safeStr(rl.region)} />
          <Field k="Country" v={safeStr(rl.country)} />
          <Field k="Vintage" v={rl.vintage != null ? String(rl.vintage) : "—"} />
        </div>

        {/* Grapes with % */}
        <div className="text-sm">
          <div className="font-medium mb-2">Grapes</div>
          <div className="flex flex-wrap gap-2">
            {grapes.length > 0 ? (
              grapes.map((g, i) => (
                <span key={i} className="px-2 py-1 bg-gray-100 rounded-full border text-gray-800">
                  {g.variety}
                  {g.percent != null ? ` ${g.percent}%` : ""}
                </span>
              ))
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Tasting Notes */}
      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Tasting Notes</h2>
        <PillList label="Nose" items={(tn.nose ?? []).filter(Boolean)} />
        <PillList label="Palate" items={(tn.palate ?? []).filter(Boolean)} />
        {tn.finish ? (
          <div className="text-sm">
            <span className="font-medium">Finish:</span> {tn.finish}
          </div>
        ) : null}
        <div className="text-sm grid grid-cols-2 gap-2">
          <Field k="Sweetness" v={safeStr(w2.sweetness)} />
          <Field k="Acidity" v={safeStr(w2.acidity)} />
          <Field k="Tannin" v={safeStr(w2.tannin)} />
          <Field k="Body" v={safeStr(w2.body)} />
          <Field k="Alcohol" v={safeStr(w2.alcohol)} />
          <Field k="Finish Length" v={safeStr(w2.finishLength)} />
        </div>
      </div>

      {/* Aromas and Flavours */}
      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Aromas and Flavours</h2>
        <PillList label="Primary" items={(af.primary ?? []).filter(Boolean)} />
        <PillList label="Secondary" items={(af.secondary ?? []).filter(Boolean)} />
        <PillList label="Tertiary" items={(af.tertiary ?? []).filter(Boolean)} />
      </div>

      {/* Drink Window (no Drink Now cell, per request) */}
      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Drink Window</h2>
        <div className="text-sm grid grid-cols-2 gap-2">
          <Field k="From" v={safeStr(dw.from)} />
          <Field k="To" v={safeStr(dw.to)} />
          <Field k="Peak From" v={safeStr(dw.peakFrom)} />
          <Field k="Peak To" v={safeStr(dw.peakTo)} />
          <Field k="Decant" v={safeStr(dw.decant)} />
        </div>
      </div>

      {/* Price */}
      <div className="grid gap-3 p-4 rounded-2xl bg-white shadow">
        <h2 className="text-xl font-semibold">Price (estimate)</h2>
        <div className="text-sm grid grid-cols-2 gap-2">
          <Field k="Currency" v={safeStr(pe.currency)} />
          <Field
            k="Range"
            v={
              pe.low != null && pe.high != null
                ? `${String(pe.low)} – ${String(pe.high)}`
                : "—"
            }
          />
          <Field k="Confidence" v={safeStr(pe.confidence)} />
        </div>
        {pe.note ? <div className="text-xs text-gray-600">{pe.note}</div> : null}
      </div>

      {/* Caveats */}
      {Array.isArray(data.caveats) && data.caveats.length > 0 ? (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-2xl text-sm">
          <div className="font-medium mb-1">Caveats</div>
          <ul className="list-disc pl-5 space-y-1">
            {data.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="font-medium">{k}:</span> {v || "—"}
    </div>
  );
}

function PillList({ label, items }: { label: string; items: string[] }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  return (
    <div className="text-sm">
      <div className="font-medium mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {list.map((it, i) => (
          <span key={i} className="px-2 py-1 bg-gray-100 rounded-full border text-gray-800">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "—";
}
