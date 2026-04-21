import assert from "node:assert/strict";
import test from "node:test";
type ZendeskSettings = import("./alerting.ts").ZendeskSettings;

async function loadModules() {
  const prismaModule = await import("./prisma.ts");
  const alertingModule = await import("./alerting.ts");

  return {
    evaluateFalseDownProtection: alertingModule.evaluateFalseDownProtection,
    prisma: prismaModule.prisma,
    resolveRecoveryTransitions: alertingModule.resolveRecoveryTransitions,
  };
}

const zendeskSettings: ZendeskSettings = {
  enabled: true,
  subdomain: "example",
  email: "alerts@example.com",
  apiToken: "token",
  groupId: "42",
  delayMinutes: 30,
  subjectTemplate: "{{monitorName}} is DOWN",
  bodyTemplate: "{{message}}",
};

function createTransition() {
  return [
    {
      monitor: {
        id: "monitor-1",
        name: "Example Monitor",
        url: "https://example.com",
      },
      result: {
        status: 200,
        responseTime: 123,
        isUp: true,
        message: "Recovered",
      },
      previouslyUp: false,
    },
  ];
}

function createOpenIncident(zendeskTicketId: string | null) {
  const startedAt = new Date("2026-04-13T10:00:00.000Z");

  return {
    id: "incident-1",
    monitorId: "monitor-1",
    startedAt,
    resolvedAt: null,
    notifiedAt: null,
    message: "HTTP 500",
    zendeskTicketId,
    monitor: {
      id: "monitor-1",
      name: "Example Monitor",
      url: "https://example.com",
    },
    alertEvents: [],
  };
}

test("recovery updates the existing Zendesk ticket", async () => {
  const { prisma, resolveRecoveryTransitions } = await loadModules();
  const incidentDelegate = prisma.incident as unknown as {
    findFirst: (...args: unknown[]) => Promise<unknown>;
    updateMany: (...args: unknown[]) => Promise<{ count: number }>;
    update: (args: { data: { zendeskRecoveryStatus: string } }) => Promise<unknown>;
  };
  const appSettingDelegate = prisma.appSetting as unknown as {
    findUnique: (...args: unknown[]) => Promise<{ value: string } | null>;
  };
  const debugLogDelegate = prisma.debugLog as unknown as {
    create: (args: { data: { type: string; message: string } }) => Promise<unknown>;
  };

  const originalFindFirst = incidentDelegate.findFirst;
  const originalUpdateMany = incidentDelegate.updateMany;
  const originalUpdate = incidentDelegate.update;
  const originalFindUnique = appSettingDelegate.findUnique;
  const originalDebugLogCreate = debugLogDelegate.create;
  const originalFetch = global.fetch;

  const debugLogs: Array<{ type: string; message: string }> = [];
  const fetchCalls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const incidentUpdates: string[] = [];

  incidentDelegate.findFirst = async () => createOpenIncident("98765");
  incidentDelegate.updateMany = async () => ({ count: 1 });
  incidentDelegate.update = async ({ data }) => {
    incidentUpdates.push(data.zendeskRecoveryStatus);
    return data;
  };
  appSettingDelegate.findUnique = async () => ({ value: "true" });
  debugLogDelegate.create = async ({ data }) => {
    debugLogs.push({ type: data.type, message: data.message });
    return data;
  };
  global.fetch = async (input, init) => {
    fetchCalls.push({ input, init });
    return new Response(JSON.stringify({ ticket: { id: "98765" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await resolveRecoveryTransitions(createTransition(), zendeskSettings, false);

    assert.equal(fetchCalls.length, 1);
    assert.equal(
      String(fetchCalls[0]?.input),
      "https://example.zendesk.com/api/v2/tickets/98765.json"
    );

    const requestBody = JSON.parse(String(fetchCalls[0]?.init?.body));
    assert.deepEqual(Object.keys(requestBody.ticket), ["comment"]);
    assert.match(requestBody.ticket.comment.body, /The monitor is back up\./);

    assert.deepEqual(incidentUpdates, ["updated"]);
    assert.equal(debugLogs[0]?.type, "zendesk_ticket");
    assert.match(
      debugLogs[0]?.message ?? "",
      /Zendesk ticket #98765 updated with recovery note/
    );
  } finally {
    incidentDelegate.findFirst = originalFindFirst;
    incidentDelegate.updateMany = originalUpdateMany;
    incidentDelegate.update = originalUpdate;
    appSettingDelegate.findUnique = originalFindUnique;
    debugLogDelegate.create = originalDebugLogCreate;
    global.fetch = originalFetch;
  }
});

test("recovery skips Zendesk when the incident never created a ticket", async () => {
  const { prisma, resolveRecoveryTransitions } = await loadModules();
  const incidentDelegate = prisma.incident as unknown as {
    findFirst: (...args: unknown[]) => Promise<unknown>;
    updateMany: (...args: unknown[]) => Promise<{ count: number }>;
    update: (args: { data: { zendeskRecoveryStatus: string } }) => Promise<unknown>;
  };
  const appSettingDelegate = prisma.appSetting as unknown as {
    findUnique: (...args: unknown[]) => Promise<{ value: string } | null>;
  };
  const debugLogDelegate = prisma.debugLog as unknown as {
    create: (args: { data: { type: string; message: string } }) => Promise<unknown>;
  };

  const originalFindFirst = incidentDelegate.findFirst;
  const originalUpdateMany = incidentDelegate.updateMany;
  const originalUpdate = incidentDelegate.update;
  const originalFindUnique = appSettingDelegate.findUnique;
  const originalDebugLogCreate = debugLogDelegate.create;
  const originalFetch = global.fetch;

  const debugLogs: Array<{ type: string; message: string }> = [];
  let fetchCalled = false;
  const incidentUpdates: string[] = [];

  incidentDelegate.findFirst = async () => createOpenIncident(null);
  incidentDelegate.updateMany = async () => ({ count: 1 });
  incidentDelegate.update = async ({ data }) => {
    incidentUpdates.push(data.zendeskRecoveryStatus);
    return data;
  };
  appSettingDelegate.findUnique = async () => ({ value: "true" });
  debugLogDelegate.create = async ({ data }) => {
    debugLogs.push({ type: data.type, message: data.message });
    return data;
  };
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called when no Zendesk ticket exists");
  };

  try {
    await resolveRecoveryTransitions(createTransition(), zendeskSettings, false);

    assert.equal(fetchCalled, false);
    assert.deepEqual(incidentUpdates, ["skipped_no_ticket"]);
    assert.equal(debugLogs[0]?.type, "zendesk_ticket");
    assert.equal(
      debugLogs[0]?.message,
      "Recovery detected, but no Zendesk ticket exists for this incident."
    );
  } finally {
    incidentDelegate.findFirst = originalFindFirst;
    incidentDelegate.updateMany = originalUpdateMany;
    incidentDelegate.update = originalUpdate;
    appSettingDelegate.findUnique = originalFindUnique;
    debugLogDelegate.create = originalDebugLogCreate;
    global.fetch = originalFetch;
  }
});

test("false down protection suppresses mass network-style failures", async () => {
  const { evaluateFalseDownProtection } = await loadModules();

  const transitions = Array.from({ length: 10 }, (_, index) => ({
    monitor: {
      id: `monitor-${index}`,
      name: `Monitor ${index}`,
      url: `https://example-${index}.com`,
    },
    result: {
      status: 0,
      responseTime: 10487,
      isUp: false,
      message: "fetch failed",
    },
    previouslyUp: true,
  }));

  const result = evaluateFalseDownProtection(30, transitions, {
    enabled: true,
    minAffectedMonitors: 8,
    minAffectedRatio: 0.2,
    minNetworkErrorRatio: 0.75,
  });

  assert.equal(result.suppression.suppressed, true);
  assert.equal(result.suppression.suppressedDownTransitions, 10);
  assert.equal(result.suppression.allowedDownTransitions, 0);
  assert.equal(result.downTransitionsForIncidents.length, 0);
});

test("false down protection keeps normal smaller outages alertable", async () => {
  const { evaluateFalseDownProtection } = await loadModules();

  const transitions = Array.from({ length: 3 }, (_, index) => ({
    monitor: {
      id: `monitor-${index}`,
      name: `Monitor ${index}`,
      url: `https://example-${index}.com`,
    },
    result: {
      status: 0,
      responseTime: 10487,
      isUp: false,
      message: "fetch failed",
    },
    previouslyUp: true,
  }));

  const result = evaluateFalseDownProtection(30, transitions, {
    enabled: true,
    minAffectedMonitors: 8,
    minAffectedRatio: 0.2,
    minNetworkErrorRatio: 0.75,
  });

  assert.equal(result.suppression.suppressed, false);
  assert.equal(result.suppression.suppressedDownTransitions, 0);
  assert.equal(result.downTransitionsForIncidents.length, 3);
});

test("false down protection still allows non-network failures through", async () => {
  const { evaluateFalseDownProtection } = await loadModules();

  const transitions = [
    ...Array.from({ length: 8 }, (_, index) => ({
      monitor: {
        id: `network-${index}`,
        name: `Network ${index}`,
        url: `https://network-${index}.com`,
      },
      result: {
        status: 0,
        responseTime: 10487,
        isUp: false,
        message: "fetch failed",
      },
      previouslyUp: true,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      monitor: {
        id: `http-${index}`,
        name: `HTTP ${index}`,
        url: `https://http-${index}.com`,
      },
      result: {
        status: 503,
        responseTime: 900,
        isUp: false,
        message: "Expected 200/401, got 503",
      },
      previouslyUp: true,
    })),
  ];

  const result = evaluateFalseDownProtection(30, transitions, {
    enabled: true,
    minAffectedMonitors: 8,
    minAffectedRatio: 0.2,
    minNetworkErrorRatio: 0.75,
  });

  assert.equal(result.suppression.suppressed, true);
  assert.equal(result.suppression.suppressedDownTransitions, 8);
  assert.equal(result.suppression.allowedDownTransitions, 2);
  assert.deepEqual(
    result.downTransitionsForIncidents.map((transition) => transition.monitor.id),
    ["http-0", "http-1"]
  );
});
