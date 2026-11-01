import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { secretList } from "./env";

interface Args {
	accountId: string;
	zoneId: pulumi.Input<string>;
	/** Pulumi resource and tunnel name, e.g. t3-code. */
	name: string;
	/** Display name for the Access app and policy, e.g. "T3 Code". */
	title: string;
	/** Public hostname, e.g. t3.thijmen.cloud. */
	host: string;
	/** What cloudflared forwards to on the machine running it. */
	origin: string;
}

/**
 * Publishes T3 Code (running on a machine) at `host` through a
 * Cloudflare Tunnel, behind an Access login.
 *
 * The tunnel is remotely managed: its ingress lives here, and the machine only
 * runs `cloudflared service install <token>` with the tunnel's token stack
 * output. T3 Code can run shell commands, so access is enforced twice: the
 * Access app at the edge, and cloudflared rejecting any request without a
 * valid Access JWT for that app.
 */
export function t3CodeTunnel({ accountId, zoneId, name, title, host, origin }: Args) {
	const allow = new cloudflare.ZeroTrustAccessPolicy(`${name}-allow`, {
		accountId,
		name: `${title}: allowed emails`,
		decision: "allow",
		includes: secretList("T3_ACCESS_EMAILS").apply((emails) => emails.map((email) => ({ email: { email } }))),
	});

	const app = new cloudflare.ZeroTrustAccessApplication(name, {
		accountId,
		name: title,
		type: "self_hosted",
		destinations: [{ type: "public", uri: host }],
		sessionDuration: "24h",
		policies: [{ id: allow.id, precedence: 1 }],
	});

	const tunnel = new cloudflare.ZeroTrustTunnelCloudflared(name, {
		accountId,
		name,
		configSrc: "cloudflare",
	});

	// The team name is the first label of <team>.cloudflareaccess.com.
	const org = cloudflare.getZeroTrustOrganizationOutput({ accountId });
	const teamName = org.authDomain.apply((domain) => domain.replace(/\..*$/, ""));

	const config = new cloudflare.ZeroTrustTunnelCloudflaredConfig(name, {
		accountId,
		tunnelId: tunnel.id,
		config: {
			ingresses: [
				{
					hostname: host,
					service: origin,
					originRequest: {
						access: { required: true, teamName, audTags: [app.aud] },
					},
				},
				{ service: "http_status:404" },
			],
		},
	});

	const dns = new cloudflare.DnsRecord(name, {
		zoneId,
		name: host,
		type: "CNAME",
		content: pulumi.interpolate`${tunnel.id}.cfargotunnel.com`,
		proxied: true,
		ttl: 1,
		comment: `Managed by Thijmen/infra: ${title} tunnel`,
	});

	const token = pulumi.secret(cloudflare.getZeroTrustTunnelCloudflaredTokenOutput({ accountId, tunnelId: tunnel.id }).token);

	return { allow, app, tunnel, config, dns, token };
}
