import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") || "https://agentportal.thecrashguard.com";

// Structured logger — keeps format consistent across all steps
const log = {
  info:  (step: string, msg: string, meta?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "INFO",  step, msg, ...(meta ?? {}), ts: new Date().toISOString() })),
  warn:  (step: string, msg: string, meta?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "WARN",  step, msg, ...(meta ?? {}), ts: new Date().toISOString() })),
  error: (step: string, msg: string, meta?: Record<string, unknown>) =>
    console.error(JSON.stringify({ level: "ERROR", step, msg, ...(meta ?? {}), ts: new Date().toISOString() })),
};

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    log.warn("request", "Rejected non-POST request", { method: req.method });
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: corsHeaders,
      status: 405,
    });
  }

  log.info("request", "Incoming lead intake notification request");

  try {
    // ── Parse payload ─────────────────────────────────────────────────────────
    const {
      submissionId,
      customerName,
      customerState,
      leadVendor,
      centerName,
      submissionDate,
    } = await req.json();

    log.info("payload", "Payload parsed successfully", {
      submissionId,
      customerState: customerState ?? "not provided",
      leadVendor: leadVendor ?? "not provided",
      centerName: centerName ?? "not provided",
      hasSubmissionDate: !!submissionDate,
      // customerName intentionally omitted from logs (PII)
    });

    // ── Validate required fields ──────────────────────────────────────────────
    if (!SLACK_BOT_TOKEN) {
      log.error("config", "SLACK_BOT_TOKEN is not set in environment");
      throw new Error("SLACK_BOT_TOKEN not configured");
    }
    if (!submissionId) {
      log.error("validation", "Missing required field: submissionId");
      throw new Error("submissionId is required");
    }
    if (!leadVendor) {
      log.error("validation", "Missing required field: leadVendor — cannot resolve Slack channel");
      throw new Error("leadVendor is required to resolve Slack channel");
    }

    log.info("validation", "All required fields present, proceeding");

    // ── Resolve Slack channel from centers table ───────────────────────────────
    log.info("channel-lookup", "Querying centers table for Slack channel", { leadVendor });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select("slack_channel")
      .eq("lead_vendor", leadVendor)
      .maybeSingle();

    if (centerError) {
      log.error("channel-lookup", "Supabase query failed", { error: centerError.message });
    }

    const slackChannel = center?.slack_channel ?? null;

    if (!slackChannel) {
      log.warn("channel-lookup", "No slack_channel configured for this vendor — skipping notification", {
        leadVendor,
        centerFound: !!center,
      });
      return new Response(
        JSON.stringify({ success: false, reason: "No Slack channel configured for this vendor." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("channel-lookup", "Slack channel resolved successfully", { slackChannel });

    // ── Format date ───────────────────────────────────────────────────────────
    const dateDisplay = submissionDate
      ? new Date(submissionDate).toISOString().replace("T", " ").slice(0, 19)
      : new Date().toISOString().replace("T", " ").slice(0, 19);

    log.info("message-build", "Building Slack message", {
      submissionId,
      customerState,
      centerName,
      dateDisplay,
    });

    // ── Build View Submission URL ─────────────────────────────────────────────
    const viewUrl = `${PORTAL_BASE_URL}/call-result-update?submissionId=${encodeURIComponent(submissionId)}&center=${encodeURIComponent(centerName || "")}`;

    log.info("message-build", "View Submission URL constructed", { viewUrl });

    // ── Build Slack message blocks ────────────────────────────────────────────
    const messageText = [
      `New Lead Intake Submission:`,
      `- Call Center: ${centerName || "N/A"}`,
      `- Customer Name: ${customerName || "N/A"}`,
      `- Customer State: ${customerState || "N/A"}`,
      `- Date and Time: ${dateDisplay}`,
      `- Submission ID: ${submissionId}`,
    ].join("\n");

    const slackBody = {
      channel: slackChannel,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: messageText },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View Submission", emoji: false },
              url: viewUrl,
              style: "primary",
            },
          ],
        },
      ],
    };

    log.info("message-build", "Slack message blocks built successfully");

    // ── Send to Slack ─────────────────────────────────────────────────────────
    log.info("slack-send", "Sending message to Slack API", { channel: slackChannel });

    const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slackBody),
    });

    const slackResult = await slackRes.json();

    log.info("slack-send", "Received response from Slack API", {
      ok: slackResult.ok,
      httpStatus: slackRes.status,
      // slackResult.error only present on failure
      ...(slackResult.error ? { slackError: slackResult.error } : {}),
    });

    if (!slackResult.ok) {
      log.error("slack-send", "Slack API rejected the message", {
        channel: slackChannel,
        slackError: slackResult.error,
      });
      throw new Error(`Slack API error: ${slackResult.error}`);
    }

    log.info("done", "Lead intake notification delivered successfully", {
      submissionId,
      channel: slackChannel,
      messageTs: slackResult.ts,
    });

    return new Response(
      JSON.stringify({
        success: true,
        channel: slackChannel,
        messageTs: slackResult.ts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("unhandled", "Unhandled error in lead-intake-notification", { error: message });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
