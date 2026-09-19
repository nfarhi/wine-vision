export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

const MODEL = process.env.OPENAI_WINE_MODEL || "gpt-5.6-luna";

type WineAnalysis = {
  recognizedLabel: {
    producer: string;
    wine: string;
    appellation: string;
    region: string;
    country: string;
    vintage: number | null;
  };
  grapes: Array<{ variety: string; percent: number | null }>;
  abv: number | null;
  tastingNotes: {
    nose: string[];
    palate: string[];
    finish: string;
    wsetLevel2: {
      sweetness: string;
      acidity: string;
      tannin: string;
      body: string;
      alcohol: string;
      finishLength: string;
    };
  };
  drinkWindow: {
    drinkNow: boolean;
    from: string;
    to: string;
    peakFrom: string;
    peakTo: string;
    decant: string;
  };
  priceEstimate: {
    currency: string;
    low: number | null;
    high: number | null;
    confidence: "low" | "medium" | "high";
    note: string;
  };
  caveats: string[];
  aromasAndFlavours: {
    primary: string[];
    secondary: string[];
    tertiary: string[];
  };
  sources: Array<{ title: string; url: string }>;
};

const wineSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recognizedLabel",
    "grapes",
    "abv",
    "tastingNotes",
    "drinkWindow",
    "priceEstimate",
    "caveats",
    "aromasAndFlavours",
    "sources",
  ],
  properties: {
    recognizedLabel: {
      type: "object",
      additionalProperties: false,
      required: ["producer", "wine", "appellation", "region", "country", "vintage"],
      properties: {
        producer: { type: "string" },
        wine: { type: "string" },
        appellation: { type: "string" },
        region: { type: "string" },
        country: { type: "string" },
        vintage: { type: ["integer", "null"] },
      },
    },
    grapes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["variety", "percent"],
        properties: {
          variety: { type: "string" },
          percent: { type: ["number", "null"] },
        },
      },
    },
    abv: { type: ["number", "null"] },
    tastingNotes: {
      type: "object",
      additionalProperties: false,
      required: ["nose", "palate", "finish", "wsetLevel2"],
      properties: {
        nose: { type: "array", items: { type: "string" } },
        palate: { type: "array", items: { type: "string" } },
        finish: { type: "string" },
        wsetLevel2: {
          type: "object",
          additionalProperties: false,
          required: ["sweetness", "acidity", "tannin", "body", "alcohol", "finishLength"],
          properties: {
            sweetness: { type: "string" },
            acidity: { type: "string" },
            tannin: { type: "string" },
            body: { type: "string" },
            alcohol: { type: "string" },
            finishLength: { type: "string" },
          },
        },
      },
    },
    drinkWindow: {
      type: "object",
      additionalProperties: false,
      required: ["drinkNow", "from", "to", "peakFrom", "peakTo", "decant"],
      properties: {
        drinkNow: { type: "boolean" },
        from: { type: "string" },
        to: { type: "string" },
        peakFrom: { type: "string" },
        peakTo: { type: "string" },
        decant: { type: "string" },
      },
    },
    priceEstimate: {
      type: "object",
      additionalProperties: false,
      required: ["currency", "low", "high", "confidence", "note"],
      properties: {
        currency: { type: "string" },
        low: { type: ["number", "null"] },
        high: { type: ["number", "null"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        note: { type: "string" },
      },
    },
    caveats: { type: "array", items: { type: "string" } },
    aromasAndFlavours: {
      type: "object",
      additionalProperties: false,
      required: ["primary", "secondary", "tertiary"],
      properties: {
        primary: { type: "array", items: { type: "string" } },
        secondary: { type: "array", items: { type: "string" } },
        tertiary: { type: "array", items: { type: "string" } },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: { title: { type: "string" }, url: { type: "string" } },
      },
    },
  },
} as const;

const INSTRUCTIONS = `You are an expert sommelier and WSET educator. Analyse the supplied wine-label image and return the exact requested JSON object.

First transcribe only what is visibly printed on the label. Then identify and verify the producer, exact wine/cuvee, appellation and vintage. Normally use web search for every identifiable bottle. Search specifically for the exact producer + wine/cuvee + vintage. Prefer the producer, appellation or official sources, importer/distributor information, and reputable wine retailers. Use multiple sources when useful, especially for current UK/European retail pricing and vintage-specific drinking guidance.

Clearly distinguish bottle-specific facts from reasonable WSET-style inference. Do not invent unavailable facts: use empty strings, empty arrays, or null. Include WSET Level 2 sweetness, acidity, tannin, body, alcohol and finish length, plus aromas and flavours, drinking window, decant recommendation, price range and confidence, caveats, and the sources actually used. Keep the source list concise. Prices are current approximate UK/European retail prices where supported; explain uncertainty in priceEstimate.note. Do not mention the schema or use markdown.`;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image supplied" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfiguration: OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const imageUrl = `data:${file.type || "image/jpeg"};base64,${base64}`;

    const response = await openai.responses.create({
      model: MODEL,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search_preview" }],
      instructions: INSTRUCTIONS,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Identify and analyse this wine label. Search the web to verify the exact bottle and enrich the analysis." },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "wine_analysis",
          strict: true,
          schema: wineSchema,
        },
      },
    });

    if (!response.output_text) {
      return NextResponse.json({ error: "OpenAI returned no structured wine analysis" }, { status: 502 });
    }

    let data: WineAnalysis;
    try {
      data = JSON.parse(response.output_text) as WineAnalysis;
    } catch {
      return NextResponse.json({ error: "OpenAI returned invalid structured wine analysis" }, { status: 502 });
    }

    const sources = extractSearchSources(response);
    if (sources.length > 0) data.sources = sources.slice(0, 5);

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error from OpenAI";
    return NextResponse.json({ error: `Wine analysis failed: ${message}` }, { status: 502 });
  }
}

function extractSearchSources(response: { output?: unknown[] }): Array<{ title: string; url: string }> {
  const sources: Array<{ title: string; url: string }> = [];
  for (const item of response.output ?? []) {
    const candidate = item as {
      type?: string;
      action?: { sources?: Array<{ title?: string; url?: string }> };
    };
    if (candidate.type !== "web_search_call") continue;
    for (const source of candidate.action?.sources ?? []) {
      if (source.url) sources.push({ title: source.title || source.url, url: source.url });
    }
  }
  return sources.filter((source, index, all) => all.findIndex((other) => other.url === source.url) === index);
}

// The model is intentionally configured through one constant so Luna can be benchmarked
// against another Responses API model without changing the request architecture.
export type { WineAnalysis };
