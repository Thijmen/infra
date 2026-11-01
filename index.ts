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
apexRedirect({ zoneId: zone.zoneId, siteHost });

const t3 = t3CodeTunnel({
	accountId,
	zoneId: zone.zoneId,
	name: "t3-code",
	title: "T3 Code",
	host: config.require("t3Host"),
	origin: config.require("t3Origin"),
});

const t3Pc = t3CodeTunnel({
	accountId,
	zoneId: zone.zoneId,
	name: "t3-pc",
	title: "T3 Code (PC)",
	host: config.require("t3PcHost"),
	origin: config.require("t3PcOrigin"),
});

const wafZones = config.requireObject<string[]>("wafZones");
for (const zoneName of wafZones) {
	const wafZone = cloudflare.getZoneOutput({ filter: { name: zoneName } });
	managedWaf({ zoneName, zoneId: wafZone.zoneId });
}

export const zoneId = zone.zoneId;
export const mcpAccessAppId = mcp.app.id;
export const t3TunnelId = t3.tunnel.id;
// cloudflared service install $(pulumi stack output t3TunnelToken --show-secrets)
export const t3TunnelToken = t3.token;
export const t3PcTunnelId = t3Pc.tunnel.id;
// cloudflared service install $(pulumi stack output t3PcTunnelToken --show-secrets)
export const t3PcTunnelToken = t3Pc.token;
