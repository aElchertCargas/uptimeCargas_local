import assert from "node:assert/strict";
import test from "node:test";
type ZendeskSettings = import("./alerting.ts").ZendeskSettings;

async function loadModules() {
  const prismaModule = await import("./prisma.ts");
  const alertingModule = await import("./alerting.ts");

  return {
    dispatchPendingAlertEvents: alertingModule.dispatchPendingAlertEvents,
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

test("dispatcher sends recovery alerts when down and up events are due in the same cycle", async () => {
  const { dispatchPendingAlertEvents, prisma } = await loadModules();
  const alertEventDelegate = prisma.alertEvent as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    findUnique: (...args: unknown[]) => Promise<unknown>;
    updateMany: (args: {
      where: { id: string; status: { in: string[] } };
      data: { status: string; lastError: null };
    }) => Promise<{ count: number }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  const alertDeliveryDelegate = prisma.alertDelivery as unknown as {
    upsert: (args: {
      where: { alertEventId_channelId: { alertEventId: string; channelId: string } };
      create: { alertEventId: string; channelId: string; status: string };
    }) => Promise<unknown>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
    findMany: (args: {
      where: { alertEventId: string; channelId: { in: string[] } };
    }) => Promise<unknown[]>;
  };
  const notificationChannelDelegate = prisma.notificationChannel as unknown as {
    findMany: (args: { where: Record<string, unknown> }) => Promise<unknown[]>;
  };
  const incidentDelegate = prisma.incident as unknown as {
    update: (...args: unknown[]) => Promise<unknown>;
  };
  const appSettingDelegate = prisma.appSetting as unknown as {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    findUnique: (...args: unknown[]) => Promise<{ value: string } | null>;
  };
  const debugLogDelegate = prisma.debugLog as unknown as {
    create: (args: { data: { type: string; message: string } }) => Promise<unknown>;
  };

  const originalAlertEventFindMany = alertEventDelegate.findMany;
  const originalAlertEventFindUnique = alertEventDelegate.findUnique;
  const originalAlertEventUpdateMany = alertEventDelegate.updateMany;
  const originalAlertEventUpdate = alertEventDelegate.update;
  const originalAlertDeliveryUpsert = alertDeliveryDelegate.upsert;
  const originalAlertDeliveryUpdate = alertDeliveryDelegate.update;
  const originalAlertDeliveryFindMany = alertDeliveryDelegate.findMany;
  const originalNotificationChannelFindMany = notificationChannelDelegate.findMany;
  const originalIncidentUpdate = incidentDelegate.update;
  const originalAppSettingFindMany = appSettingDelegate.findMany;
  const originalAppSettingFindUnique = appSettingDelegate.findUnique;
  const originalDebugLogCreate = debugLogDelegate.create;
  const originalFetch = global.fetch;

  const startedAt = new Date("2026-04-23T08:03:42.104Z");
  const resolvedAt = new Date("2026-04-23T08:10:11.790Z");
  const downScheduledFor = new Date("2026-04-23T08:08:42.104Z");
  const eventStatuses = new Map<string, string>([
    ["event-down", "pending"],
    ["event-up", "pending"],
  ]);
  const deliveryStore = new Map<
    string,
    {
      id: string;
      alertEventId: string;
      channelId: string;
      status: string;
      attemptCount: number;
      attemptedAt: Date | null;
      sentAt: Date | null;
      lastError: string | null;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >([
    ["event-down", []],
    ["event-up", []],
  ]);
  const sentEvents: string[] = [];
  const debugLogs: Array<{ type: string; message: string }> = [];

  const channel = {
    id: "channel-1",
    name: "Primary Webhook",
    type: "webhook",
    config: { url: "https://hooks.example.test/monitor" },
    enabled: true,
    isDefault: true,
    createdAt: new Date("2026-04-20T00:00:00.000Z"),
  };

  const staleIncidentAlertEvents = [
    {
      id: "event-down",
      kind: "down",
      deliveries: [],
    },
    {
      id: "event-up",
      kind: "up",
      deliveries: [],
    },
  ];

  const incident = {
    id: "incident-1",
    monitorId: "monitor-1",
    startedAt,
    resolvedAt,
    notifiedAt: null,
    message: "fetch failed",
    zendeskTicketId: null,
    zendeskRecoveryStatus: null,
    monitor: {
      id: "monitor-1",
      name: "Insinger Performance",
      url: "https://insinger.example.test",
    },
    alertEvents: staleIncidentAlertEvents,
  };

  const events = [
    {
      id: "event-down",
      incidentId: "incident-1",
      kind: "down",
      status: "pending",
      scheduledFor: downScheduledFor,
      sentAt: null,
      context: null,
      lastError: null,
      createdAt: downScheduledFor,
      updatedAt: downScheduledFor,
      deliveries: [],
      incident,
    },
    {
      id: "event-up",
      incidentId: "incident-1",
      kind: "up",
      status: "pending",
      scheduledFor: resolvedAt,
      sentAt: null,
      context: { responseTimeMs: 1886 },
      lastError: null,
      createdAt: resolvedAt,
      updatedAt: resolvedAt,
      deliveries: [],
      incident,
    },
  ];

  alertEventDelegate.findMany = async () => events;
  alertEventDelegate.findUnique = async ({ where }) => {
    const incidentIdKind = (where as { incidentId_kind?: { incidentId: string; kind: string } })
      .incidentId_kind;
    if (incidentIdKind?.incidentId === "incident-1" && incidentIdKind.kind === "down") {
      return {
        id: "event-down",
        kind: "down",
        deliveries: deliveryStore.get("event-down") ?? [],
      };
    }

    return null;
  };
  alertEventDelegate.updateMany = async ({ where, data }) => {
    const currentStatus = eventStatuses.get(where.id);
    if (!currentStatus || !where.status.in.includes(currentStatus)) {
      return { count: 0 };
    }

    eventStatuses.set(where.id, data.status);
    return { count: 1 };
  };
  alertEventDelegate.update = async ({ where, data }) => {
    if (typeof data.status === "string") {
      eventStatuses.set(where.id, data.status);
    }
    return { id: where.id, ...data };
  };

  alertDeliveryDelegate.upsert = async ({ where, create }) => {
    const deliveries = deliveryStore.get(where.alertEventId_channelId.alertEventId) ?? [];
    const existing = deliveries.find(
      (delivery) => delivery.channelId === where.alertEventId_channelId.channelId
    );
    if (existing) {
      return existing;
    }

    const createdAt = new Date("2026-04-23T08:10:12.000Z");
    const delivery = {
      id: `delivery-${create.alertEventId}-${create.channelId}`,
      alertEventId: create.alertEventId,
      channelId: create.channelId,
      status: create.status,
      attemptCount: 0,
      attemptedAt: null,
      sentAt: null,
      lastError: null,
      createdAt,
      updatedAt: createdAt,
    };
    deliveries.push(delivery);
    deliveryStore.set(create.alertEventId, deliveries);
    return delivery;
  };
  alertDeliveryDelegate.update = async ({ where, data }) => {
    for (const deliveries of deliveryStore.values()) {
      const delivery = deliveries.find((entry) => entry.id === where.id);
      if (!delivery) {
        continue;
      }

      if (typeof data.status === "string") {
        delivery.status = data.status;
      }
      if (typeof data.lastError === "string" || data.lastError === null) {
        delivery.lastError = data.lastError as string | null;
      }
      if (data.attemptedAt instanceof Date || data.attemptedAt === null) {
        delivery.attemptedAt = data.attemptedAt as Date | null;
      }
      if (data.sentAt instanceof Date || data.sentAt === null) {
        delivery.sentAt = data.sentAt as Date | null;
      }
      if (
        typeof data.attemptCount === "object" &&
        data.attemptCount !== null &&
        "increment" in data.attemptCount
      ) {
        delivery.attemptCount += Number(
          (data.attemptCount as { increment: number }).increment ?? 0
        );
      }
      delivery.updatedAt = new Date("2026-04-23T08:10:12.100Z");
      return delivery;
    }

    throw new Error(`Unknown alert delivery ${where.id}`);
  };
  alertDeliveryDelegate.findMany = async ({ where }) => {
    const deliveries = deliveryStore.get(where.alertEventId) ?? [];
    return deliveries.filter((delivery) => where.channelId.in.includes(delivery.channelId));
  };

  notificationChannelDelegate.findMany = async ({ where }) => {
    if (!("id" in where)) {
      return [channel];
    }

    const channelIds = (where.id as { in: string[] }).in;
    return channelIds.includes(channel.id) ? [channel] : [];
  };
  incidentDelegate.update = async () => ({ ok: true });
  appSettingDelegate.findMany = async () => [];
  appSettingDelegate.findUnique = async () => ({ value: "true" });
  debugLogDelegate.create = async ({ data }) => {
    debugLogs.push({ type: data.type, message: data.message });
    return data;
  };
  global.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    sentEvents.push(payload.event);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await dispatchPendingAlertEvents(new Date("2026-04-23T08:10:12.500Z"));

    assert.deepEqual(sentEvents, ["monitor.down", "monitor.up"]);
    assert.equal(result.processed, 2);
    assert.equal(result.sent, 2);
    assert.equal(eventStatuses.get("event-down"), "sent");
    assert.equal(eventStatuses.get("event-up"), "sent");
    assert.match(debugLogs[0]?.message ?? "", /notification sent \(down\)/);
    assert.match(debugLogs[1]?.message ?? "", /notification sent \(up\)/);
  } finally {
    alertEventDelegate.findMany = originalAlertEventFindMany;
    alertEventDelegate.findUnique = originalAlertEventFindUnique;
    alertEventDelegate.updateMany = originalAlertEventUpdateMany;
    alertEventDelegate.update = originalAlertEventUpdate;
    alertDeliveryDelegate.upsert = originalAlertDeliveryUpsert;
    alertDeliveryDelegate.update = originalAlertDeliveryUpdate;
    alertDeliveryDelegate.findMany = originalAlertDeliveryFindMany;
    notificationChannelDelegate.findMany = originalNotificationChannelFindMany;
    incidentDelegate.update = originalIncidentUpdate;
    appSettingDelegate.findMany = originalAppSettingFindMany;
    appSettingDelegate.findUnique = originalAppSettingFindUnique;
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
