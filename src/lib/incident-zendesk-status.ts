export type KnownZendeskRecoveryStatus =
  | "updated"
  | "failed"
  | "skipped_no_ticket"
  | "skipped_no_config"
  | null
  | undefined;

export type ZendeskRecoveryStatus = string | null | undefined;

export type IncidentZendeskStatusKey =
  | "no_ticket"
  | "ticket_open"
  | "recovery_posted"
  | "recovery_failed"
  | "recovery_skipped"
  | "recovery_unknown";

export interface IncidentZendeskStatusInput {
  resolvedAt: Date | string | null;
  zendeskTicketId: string | null | undefined;
  zendeskRecoveryStatus: ZendeskRecoveryStatus;
}

export interface IncidentZendeskStatus {
  key: IncidentZendeskStatusKey;
  label: string;
  description: string;
}

export function getIncidentZendeskStatus(
  input: IncidentZendeskStatusInput
): IncidentZendeskStatus {
  if (!input.zendeskTicketId) {
    return input.resolvedAt
      ? {
          key: "no_ticket",
          label: "No ticket",
          description:
            "Recovered before the Zendesk ticket delay elapsed.",
        }
      : {
          key: "no_ticket",
          label: "No ticket",
          description: "No Zendesk ticket has been created for this incident yet.",
        };
  }

  if (!input.resolvedAt) {
    return {
      key: "ticket_open",
      label: "Ticket open",
      description: `Zendesk ticket #${input.zendeskTicketId} is linked to this open incident.`,
    };
  }

  switch (input.zendeskRecoveryStatus) {
    case "updated":
      return {
        key: "recovery_posted",
        label: "Recovery posted",
        description: `Zendesk ticket #${input.zendeskTicketId} was updated when the monitor came back up.`,
      };
    case "failed":
      return {
        key: "recovery_failed",
        label: "Recovery failed",
        description: `Zendesk ticket #${input.zendeskTicketId} could not be updated on recovery.`,
      };
    case "skipped_no_config":
      return {
        key: "recovery_skipped",
        label: "Recovery skipped",
        description:
          "The incident recovered, but Zendesk configuration was unavailable at update time.",
      };
    case "skipped_no_ticket":
      return {
        key: "no_ticket",
        label: "No ticket",
        description:
          "Recovered before the Zendesk ticket delay elapsed.",
      };
    default:
      return {
        key: "recovery_unknown",
        label: "Recovery unknown",
        description: `Zendesk ticket #${input.zendeskTicketId} exists, but the stored recovery result is unavailable.`,
      };
  }
}
