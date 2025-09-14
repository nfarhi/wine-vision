// ┌───────────────────────────────────────────────────────────────────────────┐
// │ FILE: app/page.tsx │
// └───────────────────────────────────────────────────────────────────────────┘


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
}