import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { emdashMcpAccess } from "./src/access";
import { securityHeaders } from "./src/headers";
import { apexRedirect } from "./src/redirect";
import { t3CodeTunnel } from "./src/tunnel";
import { managedWaf } from "./src/waf";

const config = new pulumi.Config();
const accountId = config.require("accountId");
const siteHost = config.require("siteHost");

const zone = cloudflare.getZoneOutput({ filter: { name: config.require("zone") } });

const mcp = emdashMcpAccess({ accountId, siteHost });
securityHeaders({ zoneId: zone.zoneId, siteHost });

const apexRedirectHosts = config.requireObject<string[]>("apexRedirectHosts");
for (const host of apexRedirectHosts) {
	const redirectZone = cloudflare.getZoneOutput({ filter: { name: host.replace(/^www\./, "") } });
	// The thijmen.cloud ruleset was first created as "redirects".
	const aliases = host === siteHost ? ["redirects"] : [];
	apexRedirect({ zoneId: redirectZone.zoneId, siteHost: host, aliases });
}

interface T3TunnelConfig {
	/** Pulumi resource and tunnel name, e.g. t3-code. */
	name: string;
	/** Display name for the Access app and policy, e.g. "T3 Code". */
	title: string;
	/** Public hostname, e.g. t3.thijmen.cloud. */
	host: string;
	/** What cloudflared forwards to on the machine running it. */
	origin: string;
}

const seen = new Set<string>();
const tunnels = config.requireObject<T3TunnelConfig[]>("t3Tunnels").map((args) => {
	if (seen.has(args.name)) throw new Error(`t3Tunnels: duplicate name "${args.name}"`);
	seen.add(args.name);
	return { args, resources: t3CodeTunnel({ accountId, zoneId: zone.zoneId, ...args }) };
});

const wafZones = config.requireObject<string[]>("wafZones");
for (const zoneName of wafZones) {
	const wafZone = cloudflare.getZoneOutput({ filter: { name: zoneName } });
	managedWaf({ zoneName, zoneId: wafZone.zoneId });
}

export const zoneId = zone.zoneId;
export const mcpAccessAppId = mcp.app.id;
// cloudflared service install "$(pulumi stack output t3Tunnels --show-secrets --json | jq -r '.["t3-pc"].token')"
export const t3Tunnels = pulumi.secret(
	Object.fromEntries(tunnels.map(({ args, resources }) => [args.name, { host: args.host, id: resources.tunnel.id, token: resources.token }])),
);
