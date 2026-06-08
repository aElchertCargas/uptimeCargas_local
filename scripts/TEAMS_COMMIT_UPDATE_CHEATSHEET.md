# Teams Commit Update Cheatsheet

Manual Teams update script:

```bash
npm run teams:commit-update
```

Preview the payload without sending:

```bash
npm run teams:commit-update -- --dry-run
```

Send with a short note:

```bash
npm run teams:commit-update -- --note "URL audit and inline edit shipped"
```

Use a specific Teams channel from the database:

```bash
npm run teams:commit-update -- --channel "Engineering"
```

Override the webhook URL directly:

```bash
TEAMS_WEBHOOK_URL="https://your-webhook-url" npm run teams:commit-update
```

Include GitHub commit/check status:

```bash
GITHUB_TOKEN="your-github-token" npm run teams:commit-update
```

Useful combo for testing:

```bash
TEAMS_WEBHOOK_URL="https://your-webhook-url" \
GITHUB_TOKEN="your-github-token" \
npm run teams:commit-update -- --dry-run --note "Manual status check"
```

Notes:
- By default the script uses the enabled default Teams channel in the database.
- `--channel` lets you pick a specific enabled Teams channel by name.
- `TEAMS_WEBHOOK_URL` bypasses the database channel lookup.
- `--dry-run` prints the Adaptive Card payload instead of posting it.
