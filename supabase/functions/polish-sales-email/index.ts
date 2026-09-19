import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fallback(subject: string, body: string, reason?: string) {
  return { ok: true, mode: "fallback", reason, email: { subject, body } };
}

function extractOutputText(result: any) {
  if (clean(result?.output_text)) return clean(result.output_text);

  const parts: string[] = [];
  for (const item of Array.isArray(result?.output) ? result.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && clean(content?.text)) {
        parts.push(clean(content.text));
      } else if (clean(content?.text)) {
        parts.push(clean(content.text));
      }
    }
  }
  return parts.join("\n\n").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const token = auth.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("polish-sales-email: Supabase auth configuration missing");
      return jsonResponse({ error: "Authentication service unavailable" }, 500);
    }

    const verify = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });

    if (!verify.ok) {
      console.error("polish-sales-email: invalid session", verify.status);
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const body = await req.json();
    const subject = clean(body?.subject);
    const email = clean(body?.email);
    const context = body?.context || {};

    if (!email) return jsonResponse({ error: "email is required" }, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("polish-sales-email: OPENAI_API_KEY is not configured");
      return jsonResponse(fallback(subject, email, "openai_key_missing"));
    }

    const systemPrompt = `You are the senior sales communications editor for Power Works (Pty) Ltd, a South African industrial and mining field-service company.

Rewrite the supplied sales follow-up email so it sounds natural, polished, professional and genuinely human while retaining its Gap-Selling structure.

Rules:
- Preserve every factual detail supplied by the salesperson.
- Never invent facts, costs, savings, downtime figures, urgency, technical specifications, customer commitments or outcomes.
- Never turn an unknown, possibility or question into a fact.
- Keep the current situation, problem, operational impact, desired outcome and next step clear when they are present.
- Remove awkward wording, repetition, filler, exaggerated claims and generic sales clichés.
- Use concise, natural professional South African business English.
- Keep a warm, confident, consultative tone.
- Do not pressure the recipient.
- Keep the email under 250 words where practical.
- Keep the recipient's first name and the sender's intended next step.
- Return ONLY the finished email body. Do not return a subject line, JSON, markdown, quotation marks or commentary.`;

    const userPrompt = JSON.stringify({
      contact: { name: clean(context.name), company: clean(context.company) },
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

    const model = Deno.env.get("SALES_AI_MODEL") || "gpt-5-mini";

    const ai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
        max_output_tokens: 1600,
      }),
    });

    if (!ai.ok) {
      const detail = await ai.text().catch(() => "");
      console.error("polish-sales-email: OpenAI request failed", {
        status: ai.status,
        model,
        detail: detail.slice(0, 1500),
      });
      return jsonResponse(fallback(subject, email, `openai_http_${ai.status}`));
    }

    const result = await ai.json();

    if (result?.status && result.status !== "completed") {
      console.error("polish-sales-email: OpenAI response incomplete", {
        status: result.status,
        incomplete: result?.incomplete_details || null,
      });
      return jsonResponse(fallback(subject, email, "openai_incomplete"));
    }

    const polishedBody = extractOutputText(result);

    if (!polishedBody) {
      console.error("polish-sales-email: OpenAI returned no text", {
        status: result?.status || null,
        output_items: Array.isArray(result?.output) ? result.output.map((x: any) => ({
          type: x?.type,
          role: x?.role,
          content_types: Array.isArray(x?.content) ? x.content.map((c: any) => c?.type) : [],
        })) : [],
      });
      return jsonResponse(fallback(subject, email, "openai_no_text"));
    }

    const cleanedBody = polishedBody
      .replace(/^\`\`\`(?:text|email)?\s*/i, "")
      .replace(/\s*\`\`\`$/i, "")
      .trim();

    return jsonResponse({
      ok: true,
      mode: "ai",
      email: { subject, body: cleanedBody },
    });
  } catch (e) {
    console.error("polish-sales-email: unexpected error", e);
    return jsonResponse({ error: e?.message || "Sales AI failed" }, 500);
  }
});