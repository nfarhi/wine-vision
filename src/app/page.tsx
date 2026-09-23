"use client";

import { FormEvent, useRef, useState } from "react";

type PriceEstimate = { currency?: string; low?: number; high?: number; note?: string };
type RecognizedLabel = { wine?: string; region?: string; country?: string; vintage?: string | number };
type ApiResult = { recognizedLabel?: RecognizedLabel; priceEstimate?: PriceEstimate; abv?: number | null; tastingNotes?: { nose?: string[]; palate?: string[]; finish?: string; wsetLevel2?: Record<string, string> }; grapes?: Array<string | { variety: string; percent: number | null }>; drinkWindow?: Record<string, string> };
type WineRecord = { id: string; name: string; producer: string; date: string; price: string; image: string; result: ApiResult };

export default function Page() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [history, setHistory] = useState<WineRecord[]>([]);
  const [sort, setSort] = useState<keyof WineRecord>("date");
  const [ascending, setAscending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wineName, setWineName] = useState("");

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file)); setResult(null); setError(null);
  }

  function takeAnotherPhoto() {
    setPreview(null); setResult(null); setError(null);
    if (fileRef.current) fileRef.current.value = "";
    fileRef.current?.click();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    const trimmedName = wineName.trim();
    if (!file && !trimmedName) { setError("Choose a label photo or enter a wine name."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      if (file) {
        const processed = await resizeIfNeeded(file, 1600);
        form.append("image", processed, processed.name || "label.jpg");
      } else form.append("wineName", trimmedName);
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const text = await response.text(); const payload = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(payload?.error || text || `HTTP ${response.status}`);
      const data = payload?.data as ApiResult; setResult(data);
      const label = data.recognizedLabel ?? {}; const price = data.priceEstimate ?? {};
      const amount = price.low != null && price.high != null ? `${price.currency || "£"}${price.low}–${price.high}` : "Not available";
      setHistory((items) => [{ id: crypto.randomUUID(), name: label.wine || "Unidentified wine", producer: "", date: new Date().toISOString(), price: amount, image: preview || "", result: data }, ...items]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong while analyzing the photo."); }
    finally { setLoading(false); }
  }

  function changeSort(column: keyof WineRecord) { if (sort === column) setAscending((value) => !value); else { setSort(column); setAscending(true); } }
  const sortedHistory = [...history].sort((a, b) => { const left = String(a[sort]); const right = String(b[sort]); return (left > right ? 1 : left < right ? -1 : 0) * (ascending ? 1 : -1); });

  return <main className="min-h-screen bg-[#f7f5f0] text-[#27251f]"><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
    <header className="mb-10 flex items-end justify-between gap-6"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#9b5b3d]">Cellar notes</p><h1 className="font-serif text-4xl tracking-tight sm:text-6xl">Your wine cabinet</h1><p className="mt-4 max-w-xl text-sm leading-6 text-[#716d64]">Type a wine name or photograph a label to capture its story, tasting profile and indicative retail value.</p></div><div className="hidden rounded-full border border-[#ddd7cc] bg-white px-4 py-2 text-xs text-[#716d64] sm:block">{history.length} {history.length === 1 ? "bottle" : "bottles"} logged</div></header>
    <section className="grid gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]"><div className="rounded-3xl border border-[#ded8cd] bg-[#292721] p-5 text-[#f8f4ed] shadow-[0_20px_50px_rgba(55,45,32,.12)]"><div className="mb-8 flex items-center justify-between"><span className="text-sm font-medium">Add a bottle</span><span className="rounded-full bg-[#9b5b3d] px-3 py-1 text-[10px] uppercase tracking-wider">WSET 2</span></div><form onSubmit={onSubmit} className="flex flex-col gap-4"><label className="text-xs font-medium uppercase tracking-wider text-[#aaa296]" htmlFor="wine-name">Or type a wine name</label><input id="wine-name" value={wineName} onChange={(event) => { setWineName(event.target.value); setError(null); }} placeholder="e.g. Château Margaux 2015" className="rounded-2xl border border-[#746b5d] bg-[#35312a] px-4 py-3 text-sm text-[#f8f4ed] outline-none placeholder:text-[#898277] focus:border-[#d7a383]" /><div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[#898277]"><span className="h-px flex-1 bg-[#746b5d]" /><span>or upload</span><span className="h-px flex-1 bg-[#746b5d]" /></div><label className="group relative flex min-h-64 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#746b5d] bg-[#35312a] text-center transition hover:border-[#d7a383]">{preview ? <img src={preview} alt="Selected wine label" className="absolute inset-0 size-full object-cover opacity-75" /> : <><span className="mb-4 text-4xl text-[#d7a383]">+</span><span className="text-sm">Choose a label photo</span><span className="mt-2 text-xs text-[#aaa296]">Camera or image upload</span></>}<input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPickFile} className="sr-only" /></label><button disabled={loading} className="rounded-full bg-[#d7a383] px-5 py-3 text-sm font-semibold text-[#292721] transition hover:bg-[#e5b99d] disabled:opacity-50">{loading ? "Finding wine details" : "Find wine details"}</button></form>{preview && <button type="button" onClick={takeAnotherPhoto} className="mt-3 w-full rounded-full border border-[#746b5d] px-5 py-3 text-sm font-semibold text-[#f8f4ed] transition hover:border-[#d7a383] hover:text-[#d7a383]">Take another photo</button>}{error && <p className="mt-4 rounded-xl bg-[#57352d] p-3 text-xs leading-5 text-[#f6d7ca]">{error}</p>}</div><div className="min-w-0">{result ? <ResultCard data={result} /> : <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-[#d8d1c5] p-8 text-center text-sm text-[#898277]">Your latest tasting profile will appear here after an analysis.</div>}</div></section>
    <section className="mt-16"><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9b5b3d]">The collection</p><h2 className="mt-2 font-serif text-3xl">Searched Wines</h2></div><span className="text-xs text-[#898277]">Select a column to sort</span></div><div className="overflow-hidden rounded-3xl border border-[#ded8cd] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-[#eee9e1] bg-[#fcfbf8] text-xs uppercase tracking-wider text-[#898277]"><tr>{[["image","Photo"],["name","Wine"],["date","Date photographed"],["price","Price"]].map(([key, label]) => <th key={key} className="px-5 py-4 font-medium"><button onClick={() => changeSort(key as keyof WineRecord)} className="inline-flex items-center gap-2 hover:text-[#9b5b3d]">{label}<span>{sort === key ? (ascending ? "↑" : "↓") : "↕"}</span></button></th>)}</tr></thead><tbody>{sortedHistory.length ? sortedHistory.map((wine) => <tr key={wine.id} className="border-b border-[#f0ece5] last:border-0"><td className="px-5 py-3"><div className="size-12 overflow-hidden rounded-xl bg-[#eee9e1]">{wine.image && <img src={wine.image} alt="" className="size-full object-cover" />}</div></td><td className="px-5 py-3"><div className="font-medium">{wine.name}</div></td><td className="px-5 py-3 text-[#716d64]">{new Date(wine.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td><td className="px-5 py-3 font-medium">{wine.price}</td></tr>) : <tr><td colSpan={4} className="px-6 py-14 text-center text-sm text-[#898277]">No wines yet. Your analyzed labels will be saved here.</td></tr>}</tbody></table></div></div></section><footer className="mt-8 text-xs text-[#9b958b]">Indicative prices only. Verify with a retailer before purchasing.</footer>
  </div></main>;
}

function ResultCard({ data }: { data: ApiResult }) { const label = data.recognizedLabel ?? {}; const price = data.priceEstimate ?? {}; const notes = data.tastingNotes ?? {}; const wset = notes.wsetLevel2 ?? {}; const grapes = data.grapes?.map((grape) => typeof grape === "string" ? grape : grape.variety).filter(Boolean).join(" · "); const compactNote = (value?: string | string[]) => Array.isArray(value) ? value.slice(0, 2).join(" · ") : value; const fields = [["Colour", wset.colour], ["Nose intensity", wset.noseIntensity], ["Nose", compactNote(notes.nose)], ["Palate", compactNote(notes.palate)], ["Sweetness", wset.sweetness], ["Acidity", wset.acidity], ["Tannin", wset.tannin], ["Body", wset.body], ["Alcohol", data.abv != null ? `${data.abv}% ABV` : wset.alcohol], ["Finish", notes.finish || wset.finishLength]]; return <article className="rounded-3xl border border-[#ded8cd] bg-white p-6 shadow-sm"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-[#9b5b3d]">Latest reading</p><h2 className="mt-2 font-serif text-3xl">{label.wine || "Unidentified wine"}</h2><p className="mt-1 text-sm text-[#716d64]">{grapes || "Grape not identified"}{label.vintage ? ` · ${label.vintage}` : ""}</p></div><span className="rounded-full bg-[#f3e5dc] px-3 py-1 text-xs text-[#9b5b3d]">Analyzed</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[["Region", label.region || label.country || "—"],["Alcohol", data.abv != null ? `${data.abv}% ABV` : "—"],["Price", price.low != null && price.high != null ? `${price.currency || "£"}${price.low}–${price.high}` : "—"],["Drink window", data.drinkWindow?.from || "—"]].map(([key, value]) => <div key={key} className="rounded-2xl bg-[#f7f5f0] p-3"><p className="text-[10px] uppercase tracking-wider text-[#9b958b]">{key}</p><p className="mt-2 text-sm font-medium">{value}</p></div>)}</div>{price.note && <p className="mt-5 text-xs leading-5 text-[#898277]">{price.note}</p>}<div className="mt-6 border-t border-[#eee9e1] pt-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b5b3d]">WSET 2 tasting notes</p><div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm leading-6 text-[#716d64]">{fields.map(([key, value]) => <div key={key}><p className="text-xs font-semibold uppercase tracking-wider text-[#9b958b]">{key}</p><p className="mt-1">{value || "—"}</p></div>)}</div></div></article>; }

async function resizeIfNeeded(file: File, maxWidth: number) { if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file; const img = await createImageBitmap(file); if (img.width <= maxWidth) return file; const canvas = document.createElement("canvas"); const scale = maxWidth / img.width; canvas.width = maxWidth; canvas.height = Math.round(img.height * scale); canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height); const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value as Blob), "image/jpeg", .88)); return new File([blob], "label.jpg", { type: "image/jpeg" }); }

export function safeStr(value: unknown) { return value == null ? "—" : String(value); }
export function Field({ k, v }: { k: string; v: string }) { return <div><span className="font-medium">{k}:</span> {v || "—"}</div>; }
export function PillList({ label, items }: { label: string; items: string[] }) { return items?.length ? <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#898277]">{label}</p><div className="flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-full bg-[#f3e5dc] px-3 py-1 text-xs text-[#7f4934]">{item}</span>)}</div></div> : null; }
