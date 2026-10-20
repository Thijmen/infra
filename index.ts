import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { emdashMcpAccess } from "./src/access";
import { securityHeaders } from "./src/headers";

const config = new pulumi.Config();
const accountId = config.require("accountId");
const siteHost = config.require("siteHost");

const zone = cloudflare.getZoneOutput({ filter: { name: config.require("zone") } });

const mcp = emdashMcpAccess({ accountId, siteHost });
securityHeaders({ zoneId: zone.zoneId, siteHost });

export const zoneId = zone.zoneId;
export const mcpAccessAppId = mcp.app.id;
