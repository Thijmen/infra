# infra

Cloudflare config as code: Access applications and policies, Zero Trust lists,
zone rules, the T3 Code tunnel, and WAF managed rulesets for the zones in `wafZones`. Pulumi
(TypeScript) with no Pulumi Cloud: state in an R2 bucket, secrets encrypted with
a passphrase.

The Worker and its bindings (D1, R2, Durable Objects, cron, cache) are **not**
here. They stay in [Thijmen/thijmen-dev](https://github.com/Thijmen/thijmen-dev)'s
`wrangler.jsonc`, which Workers Builds deploys. Two tools managing one Worker
would overwrite each other.

## What's managed

| File | Resources |
| --- | --- |
| `src/access.ts` | `trusted-ips` list, a Bypass policy for it, and an Access app covering only EmDash's MCP + OAuth paths. The site and admin stay behind the existing Access app. |
| `src/headers.ts` | Zone response-header rule: HSTS (5 min to start) and a report-only Content-Security-Policy on `www.thijmen.cloud`. |
| `src/redirect.ts` | Zone Single Redirect: `thijmen.cloud` → `www.thijmen.cloud`, 301, keeping path and query string. |
| `src/tunnel.ts` | Remotely managed Cloudflare Tunnel `t3-code` publishing T3 Code (`t3Origin`, on the laptop) at `t3Host`, its proxied CNAME, and an Access app allowing only `T3_ACCESS_EMAILS`. cloudflared also rejects requests without that app's Access JWT. |
| `src/waf.ts` | Managed WAF entrypoint ruleset for every zone in `wafZones`, executing the Cloudflare Managed Free Ruleset at version `latest`. |

## Secrets stay out of git

This repo is public. Anything private comes from the environment:

| Variable | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Provider token: Access Apps and Policies Edit, Access Organizations Read, Cloudflare Tunnel Edit, Zero Trust Edit, Zone Read, DNS Edit (`thijmen.cloud`), Transform Rules Edit, Single Redirect Edit (`thijmen.cloud`), Zone WAF Edit (on every zone in `wafZones`) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 token for the `pulumi-state` bucket only (locally as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) |
| `PULUMI_CONFIG_PASSPHRASE` | Encrypts secret values in the state. Keep a copy in your password manager. |
| `TRUSTED_IPS` | Comma-separated CIDRs for the MCP bypass |
| `T3_ACCESS_EMAILS` | Comma-separated emails allowed through Access to T3 Code |

Values read from the environment are wrapped in `pulumi.secret()`: previews,
logs and PR comments show `[secret]`. IDs and hostnames in `Pulumi.prod.yaml`
are not secret.

## First-time setup

1. Create the state bucket: `wrangler r2 bucket create pulumi-state`.
2. Create an R2 API token (Object Read & Write, this bucket only) and the
   Cloudflare API token above.
3. Locally: `cp .env.example .env`, fill it in, then
   ```bash
   set -a; source .env; set +a
   pnpm install
   pulumi stack init prod --secrets-provider passphrase
   ./scripts/discover.sh
   ```
   `pulumi stack init` adds an `encryptionsalt` line to `Pulumi.prod.yaml`; commit it.
4. Adopt what already exists before the first apply. `discover.sh` prints a
   `pulumi import` command for every Access app, policy, list, header ruleset
   and DNS record. If the zone already has a response-header ruleset, import it
   as `response-headers` or the create fails.
5. `pnpm preview`, then `pnpm up`.
6. Add the six secrets under Settings → Secrets and variables → Actions, and
   turn on secret scanning with push protection.

## Day to day

- Change code in a PR: CI runs `pulumi preview --diff` and comments the plan.
  Merge to `main` and CI runs `pulumi up`.
- Change a secret (a new home IP): update the `TRUSTED_IPS` repo secret, then
  run the workflow by hand (Actions → infra → Run workflow).
- CI only previews PRs from branches in this repo. Never switch the trigger to
  `pull_request_target`.

## Connecting to EmDash's MCP server

With the bypass applied, from a trusted IP:

```bash
claude mcp add --transport http emdash-site https://www.thijmen.cloud/_emdash/api/mcp
```

The OAuth consent page opens in the browser behind the normal Access login;
EmDash then issues a token scoped to the permissions you pick.

## T3 Code on the laptop

Pulumi creates the tunnel and its routing; the laptop only runs the connector.
After the first `pulumi up` that includes `src/tunnel.ts`:

```bash
brew install cloudflared
cloudflared service install "$(pulumi stack output t3TunnelToken --show-secrets --stack prod)"
```

That installs a launchd service that starts at login and connects to
`https://t3.thijmen.cloud` (`t3Host`), forwarding to `http://localhost:3773`
(`t3Origin`). Open the hostname, sign in through Access, done.

- Status: Zero Trust → Networks → Tunnels → `t3-code`, or `cloudflared tunnel info t3-code`.
- Restart: `launchctl kickstart -k gui/$(id -u)/com.cloudflare.cloudflared`.
- Remove: `cloudflared service uninstall`.
- Change who gets in: update the `T3_ACCESS_EMAILS` secret and rerun the workflow.

The token is a credential for the tunnel: don't paste it anywhere else. If it
leaks, replace the tunnel and reinstall the service:

```bash
pulumi up --stack prod --replace 'urn:pulumi:prod::thijmen-infra::cloudflare:index/zeroTrustTunnelCloudflared:ZeroTrustTunnelCloudflared::t3-code'
```
