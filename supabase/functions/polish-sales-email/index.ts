import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function fallback(subject: string, body: string) {
  return { subject, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const token = auth.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("polish-sales-email: Supabase auth configuration missing");
      return new Response(JSON.stringify({ error: "Authentication service unavailable" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const verify = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceKey,
      },
    });

    if (!verify.ok) {
      console.error("polish-sales-email: invalid session", verify.status);
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const subject = clean(body?.subject);
    const email = clean(body?.email);
    const context = body?.context || {};

    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("polish-sales-email: OPENAI_API_KEY is not configured");
      return new Response(JSON.stringify({
        ok: true,
        mode: "fallback",
        email: fallback(subject, email),
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are the senior sales communications editor for Power Works (Pty) Ltd, a South African industrial and mining field-service company.

Professionalise the supplied sales follow-up email using a consultative, Gap-Selling style.

Rules:
- Preserve every factual detail supplied by the salesperson. Never invent facts, costs, savings, downtime figures, urgency, technical specifications, customer commitments, or outcomes.
- Do not turn a stated possibility into a fact.
- Keep the current situation, problem, impact, desired outcome and next step clear where those facts are present.
- Sound like an experienced industrial salesperson: confident, concise, warm and credible.
- Use natural professional South African business English.
- Remove awkward wording, repetition, filler, exaggerated claims and generic sales clichés.
- Do not pressure the recipient.
- Do not make the email longer merely to sound professional; normally keep it under 250 words.
- If an input statement is grammatically awkward or ambiguous, rewrite it conservatively without changing its meaning.
- Keep the sender's intent and requested next step.
- Use the recipient's first name when provided.
- Return ONLY valid JSON with exactly:
{"subject":"...","body":"..."}
No markdown, commentary, or additional keys.`;

    const userPrompt = JSON.stringify({
      contact: {
        name: clean(context.name),
        company: clean(context.company),
      },
      interaction: clean(context.interaction),
      siteOrEvent: clean(context.metAt),
      topic: clean(context.topic),
      currentSituation: clean(context.currentSituation),
      problem: clean(context.problem),
      impact: clean(context.impact),
      desiredOutcome: clean(context.desiredOutcome),
      nextStep: clean(context.goal),
      subject,
      email,
    });

    const ai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("SALES_AI_MODEL") || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        max_output_tokens: 900,
      }),
    });

    if (!ai.ok) {
      const detail = await ai.text().catch(() => "");
      console.error("polish-sales-email: OpenAI request failed", ai.status, detail.slice(0, 1000));
      return new Response(JSON.stringify({
        ok: true,
        mode: "fallback",
        email: fallback(subject, email),
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const result = await ai.json();
    const text = clean(result.output_text);

    let polished: any;
    try {
      polished = JSON.parse(text);
    } catch {
      console.error("polish-sales-email: OpenAI returned non-JSON output");
      return new Response(JSON.stringify({
        ok: true,
        mode: "fallback",
        email: fallback(subject, email),
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!clean(polished?.subject) || !clean(polished?.body)) {
      console.error("polish-sales-email: OpenAI returned incomplete JSON");
      return new Response(JSON.stringify({
        ok: true,
        mode: "fallback",
        email: fallback(subject, email),
      }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      mode: "ai",
      email: {
        subject: clean(polished.subject),
        body: clean(polished.body),
      },
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("polish-sales-email: unexpected error", e);
    return new Response(JSON.stringify({
      error: e?.message || "Sales AI failed",
    }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});