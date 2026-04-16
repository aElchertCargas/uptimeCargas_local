import assert from "node:assert/strict";
import test from "node:test";

async function loadModule() {
  return import("./notifications.ts");
}

test("recovery payload includes successful Zendesk metadata", async () => {
  const { buildRecoveryNotificationPayload } = await loadModule();
  const resolvedAt = new Date("2026-04-16T12:05:00.000Z");

  const payload = buildRecoveryNotificationPayload({
    monitorName: "Example Monitor",
    monitorUrl: "https://example.com",
    responseTimeMs: 245,
    incidentMessage: "HTTP 500",
    startedAt: new Date("2026-04-16T12:00:00.000Z"),
    resolvedAt,
    zendesk: {
      url: "https://example.zendesk.com/agent/tickets/12345",
      display: "Zendesk: ✅",
      updated: true,
    },
  });

  assert.equal(payload.status, "up");
  assert.deepEqual(payload.zendesk, {
    url: "https://example.zendesk.com/agent/tickets/12345",
    display: "Zendesk: ✅",
    updated: true,
  });
  assert.equal(payload.timestamp, resolvedAt.toISOString());
});

test("recovery payload includes failed Zendesk metadata", async () => {
  const { buildRecoveryNotificationPayload } = await loadModule();

  const payload = buildRecoveryNotificationPayload({
    monitorName: "Example Monitor",
    monitorUrl: "https://example.com",
    responseTimeMs: 245,
    incidentMessage: "HTTP 500",
    startedAt: new Date("2026-04-16T12:00:00.000Z"),
    resolvedAt: new Date("2026-04-16T12:05:00.000Z"),
    zendesk: {
      url: null,
      display: "Zendesk: ❌",
      updated: false,
    },
  });

  assert.deepEqual(payload.zendesk, {
    url: null,
    display: "Zendesk: ❌",
    updated: false,
  });
});

test("up webhook includes Zendesk metadata in the JSON payload", async () => {
  const { sendWebhook } = await loadModule();
  const originalFetch = global.fetch;
  const requests: Array<{ url: string; body: string }> = [];

  global.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: String(init?.body ?? ""),
    });

    return new Response(null, { status: 200 });
  };

  try {
    const result = await sendWebhook(
      { url: "https://hooks.example.com/uptime" },
      {
        monitorName: "Example Monitor",
        monitorUrl: "https://example.com",
        status: "up",
        message: "Example Monitor is back UP after 300s (245ms). Previous error: HTTP 500",
        timestamp: "2026-04-16T12:05:00.000Z",
        zendesk: {
          url: "https://example.zendesk.com/agent/tickets/12345",
          display: "Zendesk: ✅",
          updated: true,
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);

    const body = JSON.parse(requests[0]?.body ?? "{}");
    assert.equal(body.event, "monitor.up");
    assert.deepEqual(body.zendesk, {
      url: "https://example.zendesk.com/agent/tickets/12345",
      display: "Zendesk: ✅",
      updated: true,
    });
  } finally {
    global.fetch = originalFetch;
  }
});
