import { NextRequest, NextResponse } from "next/server";

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

  const prompt = `You are a marketing strategist. Given the following company and product information, suggest targeting parameters for a social media content analysis.

Company: ${companyName}
Product: ${productName}
Category: ${productCategory}

Return a JSON object with exactly these fields:
- "targetIcp": A concise ideal customer profile description (e.g. "Gen Z women 18-25 interested in skincare")
- "targetCountry": The most relevant country code(s) for this brand (e.g. "US" or "US, KR")
- "competitorCompanies": A comma-separated list of 3-5 competitor brand handles/names relevant to this product category (e.g. "@competitor1, @competitor2, @competitor3")
- "analysisPeriodDays": Recommended analysis period in days as a number (7, 14, or 30)

Return ONLY the JSON object, no markdown formatting, no explanation.`;

  const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512,
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
