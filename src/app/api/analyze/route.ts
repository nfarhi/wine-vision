// src/app/api/analyze/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

type GrapePart = { variety: string; percent: number | null };

const jsonSchema = {
  recognizedLabel: {
    producer: "",
    wine: "",
    appellation: "",
    region: "",
    country: "",
    vintage: null as number | null,
  },
  grapes: [] as GrapePart[],
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
  // Optional: evidence we used
  sources: [] as Array<{ title: string; url: string }>,
};

const SYSTEM_PROMPT_VISION = `You are a master sommelier using only the label image and general wine knowledge.
Return ONLY valid JSON matching the provided schema. If unknown, use null/""/[].
Do not invent precise facts you cannot justify from the label (ABV, grapes, producer).
Fill WSET L2 estimates. Include 'aromasAndFlavours' (primary/secondary/tertiary).
Provide a quantified grape breakdown: grapes = array of { variety, percent|null } summing ≈100 when known (or null).
`;

const SYSTEM_PROMPT_GROUNDED = `You are a sommelier grounding outputs in provided web evidence (UK/EU context).
Use ONLY the evidence below + the parsed label to estimate typical retail price **for this vintage where possible**,
and a realistic drink window with a one-line decant recommendation. If evidence conflicts, be conservative.
Output must remain VALID JSON in the same schema. Add 0-5 'sources' (title+url) you actually used. If price is weakly supported, set confidence=low and say why in priceEstimate.note.`;

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

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    // 1) Vision: parse label
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const userPrompt1 = `Identify the wine from this label image and fill this JSON schema exactly:\n${JSON.stringify(
      jsonSchema
    )}`;

    const vision = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_VISION },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt1 },
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

    const raw1 = vision.choices?.[0]?.message?.content || "{}";
    const json1 = stripCodeFences(raw1);
    let parsed1: any;
    try {
      parsed1 = JSON.parse(json1);
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON in stage 1", raw: raw1 },
        { status: 502 }
      );
    }

    // 2) Optional: server-side web search for prices & details
    let evidence: Array<{ title: string; url: string; snippet: string }> = [];
    const tavilyKey = process.env.TAVILY_API_KEY; // optional
    const q = buildQueryFromLabel(parsed1);
    if (tavilyKey && q) {
      try {
        const searchRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: q,
            include_answer: false,
            max_results: 6,
            // Focus on likely UK/EU retailers to get relevant prices
            search_depth: "advanced",
          }),
          // keep Vercel/Edge happy
          cache: "no-store",
        });

        if (searchRes.ok) {
          const data = (await searchRes.json()) as {
            results?: Array<{ title: string; url: string; content: string }>;
          };
          evidence =
            data.results?.map((r) => ({
              title: r.title?.slice(0, 140) || "Result",
              url: r.url,
              snippet: r.content?.slice(0, 500) || "",
            })) ?? [];
        }
      } catch {
        // If search fails, just proceed without it
      }
    }

    // 3) Grounded synthesis: merge label + evidence
    let finalData = parsed1;
    if (evidence.length > 0) {
      const sys = SYSTEM_PROMPT_GROUNDED;
      const userPrompt2 =
        `Label JSON:\n${JSON.stringify(parsed1)}\n\nWeb evidence (array of {title,url,snippet}):\n` +
        `${JSON.stringify(evidence)}\n\nReturn a SINGLE JSON object in the same schema, updating priceEstimate/drinkWindow and adding up to 5 'sources'.`;

      const grounded = await openai.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt2 },
        ],
      });

      const raw2 = grounded.choices?.[0]?.message?.content || "{}";
      const json2 = stripCodeFences(raw2);
      try {
        finalData = JSON.parse(json2);
      } catch {
        // if grounded step fails JSON, fall back to vision result but keep going
        finalData = parsed1;
        // Append a note so UI shows why prices may be weak
        finalData.priceEstimate = finalData.priceEstimate || {};
        finalData.priceEstimate.note =
          (finalData.priceEstimate.note || "") +
          " (Grounding step failed to parse JSON; prices may be less reliable.)";
      }

      // Add top sources if model didn’t
      if (!Array.isArray(finalData.sources) || finalData.sources.length === 0) {
        finalData.sources = evidence.slice(0, 5).map((e) => ({
          title: e.title,
          url: e.url,
        }));
      }
    }

    return NextResponse.json({ ok: true, data: finalData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function stripCodeFences(s: string) {
  return s.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
}

function buildQueryFromLabel(label: any): string {
  const parts = [
    label?.recognizedLabel?.producer,
    label?.recognizedLabel?.wine,
    label?.recognizedLabel?.appellation,
    label?.recognizedLabel?.region,
    label?.recognizedLabel?.country,
    label?.recognizedLabel?.vintage,
  ]
    .filter(Boolean)
    .join(" ");

  if (!parts) return "";
  // Bias to UK/EU retailers + producers
  return `${parts} price site:wine-searcher.com OR site:thewinesociety.com OR site:berrybros.com OR site:vinatis.co.uk OR site:vinissimus.co.uk OR site:waitrose.com OR site:majestic.co.uk OR site:winemaker's site`;
}
