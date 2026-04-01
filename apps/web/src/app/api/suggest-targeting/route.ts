import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { companyName, productName, productCategory } = body;

  if (!companyName || !productName || !productCategory) {
    return NextResponse.json(
      { error: "companyName, productName, and productCategory are required" },
      { status: 400 }
    );
  }

  const prompt = `You are a marketing strategist. Given this company/product, suggest targeting parameters for social media content analysis.

Company: ${companyName}
Product: ${productName}
Category: ${productCategory}

Return ONLY a flat JSON object with these 4 string/number fields (no nesting, no arrays):
{"targetIcp": "short phrase, e.g. Gen Z women 18-25 into skincare", "targetCountry": "country codes, e.g. US, KR", "competitorCompanies": "3-5 names comma-separated, e.g. Nike, Adidas, Puma", "analysisPeriodDays": 7}

Keep each value SHORT (under 100 chars). Return ONLY the JSON, no markdown, no explanation.`;

  const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    console.error("Gemini API error:", err);
    return NextResponse.json(
      { error: "AI suggestion service unavailable" },
      { status: 502 }
    );
  }

  const geminiData = await geminiRes.json();
  const rawText =
    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Strip markdown fences if present
  const cleaned = rawText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

  try {
    const suggestions = JSON.parse(cleaned);
    return NextResponse.json({
      targetIcp: suggestions.targetIcp ?? "",
      targetCountry: suggestions.targetCountry ?? "",
      competitorCompanies: suggestions.competitorCompanies ?? "",
      analysisPeriodDays: suggestions.analysisPeriodDays ?? 7,
    });
  } catch {
    console.error("Failed to parse Gemini response:", rawText);
    return NextResponse.json(
      { error: "Failed to parse AI suggestions" },
      { status: 502 }
    );
  }
}
