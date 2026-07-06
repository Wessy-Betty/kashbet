// supabase/functions/ai-advisor/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: AI Advisor
// Receives a conversation + financial context from the client and proxies it
// to the Anthropic API.  The ANTHROPIC_API_KEY env variable is stored securely
// as a Supabase secret and never exposed to the browser.
//
// Deploy:
//   supabase functions deploy ai-advisor --no-verify-jwt
//
// Set secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const systemPrompt = [
      "You are KashBet's AI financial advisor — a practical, data-driven advisor for users in Kenya.",
      "You always respond in clear, friendly English and use KSh (Kenyan Shillings) as the currency unless told otherwise.",
      "You base your analysis on the financial context provided. Never fabricate numbers.",
      "Keep responses concise — use bullet points and bold for key figures.",
      "If the user has no data yet, encourage them to add transactions and explain what analysis will be available once they do.",
      "",
      "User's financial context for this month:",
      context ?? "No financial data available yet.",
    ].join("\n");

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const reply =
      data.content?.find((c: { type: string }) => c.type === "text")?.text ??
      "I couldn't generate a response. Please try again.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-advisor error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
