#!/usr/bin/env tsx

import "dotenv/config";

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

type GitHubStatusState = "success" | "pending" | "failure" | "error" | null;

interface CliOptions {
  channelName?: string;
  webhookUrl?: string;
  note?: string;
  dryRun: boolean;
}

interface TeamsTarget {
  name: string;
  url: string;
  headers: Record<string, string>;
}

interface CommitInfo {
  branch: string;
  fullSha: string;
  shortSha: string;
  subject: string;
  body: string;
  author: string;
  committedAt: string;
  dirtyFiles: number;
  syncState: string;
  repoDisplay: string;
  commitUrl: string | null;
  compareUrl: string | null;
  owner: string | null;
  repo: string | null;
}

interface GitHubStatusInfo {
  state: GitHubStatusState;
  description: string;
  targetUrl: string | null;
}

interface TeamsChannelConfig {
  url?: unknown;
  headers?: unknown;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--channel":
        options.channelName = argv[i + 1];
        i += 1;
        break;
      case "--webhook-url":
        options.webhookUrl = argv[i + 1];
        i += 1;
        break;
      case "--note":
        options.note = argv[i + 1];
        i += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }

  return options;
}

function printUsage() {
  console.log(`Manual Teams commit update

Usage:
  npm run teams:commit-update
  npm run teams:commit-update -- --channel "Engineering"
  npm run teams:commit-update -- --note "URL audit and inline edit shipped"
  npm run teams:commit-update -- --dry-run

Options:
  --channel <name>       Use a specific enabled Teams channel from the database
  --webhook-url <url>    Override the Teams webhook URL instead of reading from the database
  --note <text>          Append a short manual note for the team update
  --dry-run              Print the payload instead of posting it

Environment:
  DATABASE_URL           Needed when reading the Teams channel from the database
  TEAMS_WEBHOOK_URL      Optional webhook override
  GITHUB_TOKEN           Optional GitHub token to include commit check status
`);
}

function parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const sshMatch = remoteUrl.match(/^[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  try {
    const url = new URL(remoteUrl);
    const [owner, repoWithGit] = url.pathname.replace(/^\/+/, "").split("/");
    if (!owner || !repoWithGit) {
      return null;
    }

    return {
      owner,
      repo: repoWithGit.replace(/\.git$/, ""),
    };
  } catch {
    return null;
  }
}

function getCommitInfo(): CommitInfo {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const fullSha = runGit(["rev-parse", "HEAD"]);
  const shortSha = runGit(["rev-parse", "--short", "HEAD"]);
  const subject = runGit(["log", "-1", "--pretty=%s"]);
  const body = runGit(["log", "-1", "--pretty=%b"]);
  const author = runGit(["log", "-1", "--pretty=%an"]);
  const committedAt = runGit(["log", "-1", "--date=iso", "--pretty=%ad"]);
  const dirtyStatus = runGit(["status", "--porcelain"]);
  const dirtyFiles = dirtyStatus ? dirtyStatus.split("\n").filter(Boolean).length : 0;

  let syncState = "No upstream configured";
  try {
    const counts = runGit(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
    const [behindRaw, aheadRaw] = counts.split(/\s+/);
    const behind = Number(behindRaw);
    const ahead = Number(aheadRaw);

    if (ahead === 0 && behind === 0) {
      syncState = "Up to date with upstream";
    } else {
      const parts: string[] = [];
      if (ahead > 0) parts.push(`ahead ${ahead}`);
      if (behind > 0) parts.push(`behind ${behind}`);
      syncState = parts.join(", ");
    }
  } catch {
    // Ignore missing upstream info.
  }

  const remoteUrl = runGit(["remote", "get-url", "origin"]);
  const parsedRepo = parseGitHubRepo(remoteUrl);
  const repoDisplay = parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : remoteUrl;
  const commitUrl = parsedRepo
    ? `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}/commit/${fullSha}`
    : null;
  const compareUrl = parsedRepo
    ? `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}/commits/${branch}`
    : null;

  return {
    branch,
    fullSha,
    shortSha,
    subject,
    body,
    author,
    committedAt,
    dirtyFiles,
    syncState,
    repoDisplay,
    commitUrl,
    compareUrl,
    owner: parsedRepo?.owner ?? null,
    repo: parsedRepo?.repo ?? null,
  };
}

function cleanHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  );
}

async function getTeamsTarget(options: CliOptions): Promise<TeamsTarget> {
  if (options.webhookUrl || process.env.TEAMS_WEBHOOK_URL) {
    return {
      name: options.channelName ?? "Teams webhook override",
      url: options.webhookUrl ?? process.env.TEAMS_WEBHOOK_URL!,
      headers: {},
    };
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required when using a Teams channel from the database"
    );
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    let channels;
    try {
      channels = await prisma.notificationChannel.findMany({
        where: { type: "teams", enabled: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    } catch (error) {
      throw new Error(
        `Failed to load Teams channels from the database: ${
          error instanceof Error ? error.message : "unknown database error"
        }`
      );
    }

    if (channels.length === 0) {
      throw new Error("No enabled Teams notification channels found");
    }

    const selectedChannel = options.channelName
      ? channels.find((channel) => channel.name === options.channelName)
      : channels[0];

    if (!selectedChannel) {
      const available = channels.map((channel) => channel.name).join(", ");
      throw new Error(
        `Teams channel "${options.channelName}" not found. Available channels: ${available}`
      );
    }

    const config = selectedChannel.config as TeamsChannelConfig;
    if (typeof config.url !== "string" || !config.url) {
      throw new Error(`Teams channel "${selectedChannel.name}" is missing a webhook URL`);
    }

    return {
      name: selectedChannel.name,
      url: config.url,
      headers: cleanHeaders(config.headers),
    };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function getGitHubStatus(commit: CommitInfo): Promise<GitHubStatusInfo | null> {
  if (!commit.owner || !commit.repo) {
    return null;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }

  const response = await fetch(
    `https://api.github.com/repos/${commit.owner}/${commit.repo}/commits/${commit.fullSha}/status`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "uptime-cargas-teams-commit-update",
      },
    }
  );

  if (!response.ok) {
    return {
      state: "error",
      description: `GitHub status lookup failed (${response.status})`,
      targetUrl: commit.commitUrl,
    };
  }

  const data = (await response.json()) as {
    state?: "success" | "pending" | "failure";
    statuses?: Array<{ description?: string; target_url?: string | null }>;
  };

  const state = data.state ?? null;
  const latestStatus = data.statuses?.[0];
  const description =
    latestStatus?.description ??
    (state === "success"
      ? "All reported checks passed"
      : state === "pending"
        ? "Checks are still running"
        : state === "failure"
          ? "At least one reported check failed"
          : "No commit checks reported");

  return {
    state,
    description,
    targetUrl: latestStatus?.target_url ?? commit.commitUrl,
  };
}

function buildTeamsPayload(
  commit: CommitInfo,
  githubStatus: GitHubStatusInfo | null,
  note?: string
) {
  const localState =
    commit.dirtyFiles === 0
      ? "Clean working tree"
      : `${commit.dirtyFiles} uncommitted file(s)`;
  const githubStatusLabel = githubStatus
    ? githubStatus.state === "success"
      ? "Passing"
      : githubStatus.state === "pending"
        ? "Pending"
        : githubStatus.state === "failure"
          ? "Failing"
          : "Unavailable"
    : "Not checked";

  const facts = [
    { title: "Repo", value: commit.repoDisplay },
    { title: "Branch", value: commit.branch },
    {
      title: "Commit",
      value: commit.commitUrl
        ? `[${commit.shortSha}](${commit.commitUrl})`
        : commit.shortSha,
    },
    { title: "Author", value: commit.author },
    { title: "Committed", value: commit.committedAt },
    { title: "Git Sync", value: commit.syncState },
    { title: "Local State", value: localState },
    { title: "Checks", value: githubStatusLabel },
  ];

  const body = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: `Manual commit update: ${commit.branch} @ ${commit.shortSha}`,
    },
    {
      type: "FactSet",
      facts,
    },
    {
      type: "TextBlock",
      text: commit.subject,
      wrap: true,
      spacing: "Medium",
    },
  ];

  if (commit.body) {
    body.push({
      type: "TextBlock",
      text: commit.body,
      wrap: true,
      isSubtle: true,
      spacing: "Small",
    });
  }

  if (githubStatus?.description) {
    body.push({
      type: "TextBlock",
      text: `Checks: ${githubStatus.description}`,
      wrap: true,
      spacing: "Small",
    });
  }

  if (note) {
    body.push({
      type: "TextBlock",
      text: `Team note: ${note}`,
      wrap: true,
      spacing: "Medium",
    });
  }

  const actions = [];
  if (commit.commitUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View Commit",
      url: commit.commitUrl,
    });
  }
  if (githubStatus?.targetUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View Checks",
      url: githubStatus.targetUrl,
    });
  } else if (commit.compareUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View Branch",
      url: commit.compareUrl,
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          ...(actions.length > 0 ? { actions } : {}),
        },
      },
    ],
  };
}

async function postToTeams(target: TeamsTarget, payload: unknown) {
  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...target.headers,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `Teams webhook failed: HTTP ${response.status} ${response.statusText}${
        responseText ? ` - ${responseText}` : ""
      }`
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const commit = getCommitInfo();
  const githubStatus = await getGitHubStatus(commit);
  const payload = buildTeamsPayload(commit, githubStatus, options.note);

  if (options.dryRun) {
    let channelName = options.channelName ?? "unresolved";

    try {
      channelName = (await getTeamsTarget(options)).name;
    } catch {
      if (options.webhookUrl || process.env.TEAMS_WEBHOOK_URL) {
        channelName = options.channelName ?? "Teams webhook override";
      }
    }

    console.log(
      JSON.stringify(
        {
          channel: channelName,
          commit: {
            branch: commit.branch,
            shortSha: commit.shortSha,
            subject: commit.subject,
          },
          payload,
        },
        null,
        2
      )
    );
    return;
  }

  const teamsTarget = await getTeamsTarget(options);
  await postToTeams(teamsTarget, payload);

  console.log(`Posted commit update to Teams channel "${teamsTarget.name}"`);
  console.log(`Commit: ${commit.shortSha} ${commit.subject}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
