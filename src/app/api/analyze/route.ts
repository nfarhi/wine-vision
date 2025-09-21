// src/app/api/analyze/route.ts
export const runtime = "nodejs"; // ensure Node (so process.env/Buffer exist)
// Optional: if you run into caching oddities when testing, uncomment:
// export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

// Strict-ish shape we ask the model to return
const jsonSchema = {
  recognizedLabel: {
    producer: "",
    wine: "",
    appellation: "",
    region: "",
    country: "",
    vintage: null as number | null,
  },
  // Quantified grapes (array of { variety, percent })
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
  priceEstimate: {
    currency: "GBP",
    low: null as number | null,
    high: null as number | null,
    confidence: "low" as "low" | "medium" | "high",
    note: "",
  },
  caveats: [] as string[],
  aromasAndFlavours: {
    primary: [] as string[],
    secondary: [] as string[],
    tertiary: [] as string[],
  },
};

const SYSTEM_PROMPT = `You are a master sommelier using only information visible on the wine label image and general wine knowledge.
Return ONLY valid JSON matching the provided schema. If a field is unknown, use null, an empty string, or [] as appropriate.
Do not invent precise facts (e.g., ABV, grapes, producer) you cannot infer from the label and what you are able to find out about this wine from web searches — leave them null if you can't reliably infer the facts or find them online. Adopt a sceptical approach.
For price, give a broad typical retail range for this wine (including this vintage) in the user's likely market (UK/Europe) with low/med/high confidence.
For drinkWindow, provide a realistic now/peak/from/to and a simple decant recommendation for tonight. If the wine is past its best, you can provide a date in the past.
Populate WSET Level 2 estimates (sweetness, acidity, tannin, body, alcohol, finishLength) based on region/style and vintage.
Also return an 'aromasAndFlavours' section with primary/secondary/tertiary descriptors.
Also, return a quantified grape breakdown: set "grapes" to an array of objects like { variety: string, percent: number|null }, where "percent" is the approximate percentage (0–100) for each variety, summing ~100 when known; if unknown, set "percent" to null. If the wine is single-varietal, include one entry with percent: null.
`;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image supplied" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server misconfiguration: OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    // Lazy import so the client bundle never touches SDK
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const arrayBuffer = await (file as File).arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const userPrompt = `Identify the wine from this label image and fill the following JSON schema exactly. Schema: ${JSON.stringify(
      jsonSchema
    )}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // vision-capable
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${(file as File).type || "image/jpeg"};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const jsonText = raw.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();

    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON", raw },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
