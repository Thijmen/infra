import * as cloudflare from "@pulumi/cloudflare";
import type * as pulumi from "@pulumi/pulumi";

import { secretList } from "./env";

interface Args {
	accountId: string;
	siteHost: string;
}

/**
 * Lets MCP clients reach EmDash's built-in MCP server from trusted IPs
 * without the Access login. The rest of the site, including the admin and the
 * OAuth consent page (/_emdash/oauth/authorize), stays behind the existing
 * Access application: EmDash's admin login relies on the Access JWT, which
 * bypassed requests don't carry.
 *
 * EmDash still requires a bearer token on every MCP call; this only removes
 * the Access layer in front of it. Access matches the most specific path
 * first, and a path also covers everything below it.
 */
export function emdashMcpAccess({ accountId, siteHost }: Args) {
	const trustedIps = new cloudflare.ZeroTrustList("trusted-ips", {
		accountId,
		name: "trusted-ips",
		description: "Managed by Thijmen/infra. Values come from TRUSTED_IPS.",
		type: "IP",
		items: secretList("TRUSTED_IPS").apply((ips) => ips.map((value) => ({ value }))),
	});

	const bypass = new cloudflare.ZeroTrustAccessPolicy("emdash-mcp-bypass", {
		accountId,
		name: "EmDash MCP: bypass from trusted IPs",
		decision: "bypass",
		includes: [{ ipList: { id: trustedIps.id } }],
	});

	const paths = [
		"/_emdash/api/mcp", // the MCP endpoint
		"/_emdash/api/oauth", // token, registration, refresh, device flow
		"/.well-known/oauth-protected-resource", // discovery (RFC 9728)
		"/.well-known/oauth-authorization-server", // discovery (RFC 8414)
	];

	const app = new cloudflare.ZeroTrustAccessApplication("emdash-mcp", {
		accountId,
		name: `${siteHost} – EmDash MCP`,
		type: "self_hosted",
		destinations: paths.map((path) => ({ type: "public", uri: `${siteHost}${path}` })),
		appLauncherVisible: false,
		policies: [{ id: bypass.id, precedence: 1 }],
	});

	return { trustedIps, bypass, app } satisfies Record<string, pulumi.Resource>;
}
