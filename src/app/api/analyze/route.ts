// ✅ Next.js (App Router) mini‑app — **fixed** to avoid `process is not defined`
// -----------------------------------------------------------------------------
// What changed in this revision
// - Ensured any use of `process.env` only happens **server-side** inside the
// API handler (no top‑level access, no client access).
// - Lazy‑imported the `openai` SDK **inside** the POST handler so the client
// bundle never touches it.
// - Added an explicit check+error if `OPENAI_API_KEY` is missing.
// - Kept the UI as a client component that never references `process`.
// - Added minimal tests for the API route (no image → 400, missing key → 500).
// -----------------------------------------------------------------------------
// SETUP (from scratch)
// 1) npx create-next-app@latest wine-vision --ts --eslint --app --src-dir false --import-alias "@/*"
// 2) cd wine-vision && npm i openai
// 3) Create .env.local with: OPENAI_API_KEY=sk-...
// 4) Add these files/contents exactly as below.
// 5) npm run dev → http://localhost:3000
// (Optional tests)
// 6) npm i -D vitest @types/node
// 7) Add to package.json scripts: "test": "vitest"
// 8) npm test
// -----------------------------------------------------------------------------


// ┌───────────────────────────────────────────────────────────────────────────┐
// │ FILE: app/api/analyze/route.ts │
// └───────────────────────────────────────────────────────────────────────────┘


export const runtime = "nodejs"; // ensure Node runtime (so `process` & Buffer exist)


import { NextResponse } from "next/server";
import { Buffer } from "node:buffer"; // explicit to avoid any polyfill confusion


// Minimal JSON schema we want back from the model
const jsonSchema = {
recognizedLabel: {
producer: "",
wine: "",
appellation: "",
region: "",
country: "",
vintage: null as number | null,
},
grapes: [] as Array<{ variety: string; percent: number | null }>,
abv: null as number | null,
tastingNotes: {
nose: [] as string[],
palate: [] as string[],
finish: "",
wsetLevel2: {
sweetness: "",
acidity: "",
tannin: "",
body: "",
alcohol: "",
finishLength: "",
},
},
drinkWindow: {
drinkNow: false,
from: "",
to: "",
peakFrom: "",
peakTo: "",
decant: "",
},
}