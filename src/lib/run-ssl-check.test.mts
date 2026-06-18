import assert from "node:assert/strict";
import test from "node:test";

async function loadModule() {
  return import("./run-ssl-check.ts");
}

const alertDays = 5;
const currentExpiresAt = new Date("2026-06-23T12:00:00.000Z");

test("SSL Zendesk tickets are created when a certificate enters the alert threshold", async () => {
  const { shouldCreateZendeskTicketForSslAlert } = await loadModule();

  assert.equal(
    shouldCreateZendeskTicketForSslAlert({
      alertDays,
      currentDaysRemaining: 5,
      currentExpiresAt,
      previousExpiresAt: currentExpiresAt,
      previousCheckedAt: new Date("2026-06-17T12:00:00.000Z"),
    }),
    true
  );
});

test("SSL Zendesk tickets are not recreated on later days for the same certificate", async () => {
  const { shouldCreateZendeskTicketForSslAlert } = await loadModule();

  assert.equal(
    shouldCreateZendeskTicketForSslAlert({
      alertDays,
      currentDaysRemaining: 4,
      currentExpiresAt,
      previousExpiresAt: currentExpiresAt,
      previousCheckedAt: new Date("2026-06-18T12:00:00.000Z"),
    }),
    false
  );
});

test("SSL Zendesk tickets are created for a new certificate expiry", async () => {
  const { shouldCreateZendeskTicketForSslAlert } = await loadModule();

  assert.equal(
    shouldCreateZendeskTicketForSslAlert({
      alertDays,
      currentDaysRemaining: 5,
      currentExpiresAt,
      previousExpiresAt: new Date("2026-06-20T12:00:00.000Z"),
      previousCheckedAt: new Date("2026-06-18T12:00:00.000Z"),
    }),
    true
  );
});
