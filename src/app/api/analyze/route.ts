// src/app/api/analyze/route.ts
export const runtime = "nodejs"; // ensure Node runtime (so `process` & Buffer exist)

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

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
  grapes: [] as string[],
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
};

const SYSTEM_PROMPT = `You are a master sommelier using only information visible on the wine label image and general wine knowledge. 
Return **only** valid JSON matching the provided schema. If a field is unknown, use null, an empty string, or [] as appropriate.
Do not invent precise facts you cannot justify from the label (e.g., ABV, grapes, producer) — leave them null if missing on the label.
For price, give a broad *typical* retail range for this wine style/region/vintage in the user's likely market (UK/Europe) with low/med/high confidence.
For drinkWindow, provide a realistic now/peak/from/to and a simple decant recommendation for tonight.
Populate WSET Level 2 estimates (sweetness, acidity, tannin, body, alcohol, finishLength) based on region/style and vintage.
`;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image supplied" }, { status: 400 });
    }

    // Access the environment key only on the server, inside the handler
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server misconfiguration: OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    // Lazy-import the SDK so it never ends up in any client bundle
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const arrayBuffer = await (file as File).arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const userPrompt = `Identify the wine from this label image and fill the following JSON schema exactly. Schema: ${JSON.stringify(
      jsonSchema
    )}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // vision-capable, fast & cost-effective
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

    // Be tolerant of code fences
    const jsonText = raw
      .replace(/^```(json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      return NextResponse.json(
        { error: "Model returned non-JSON", raw },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
