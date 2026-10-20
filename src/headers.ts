import * as cloudflare from "@pulumi/cloudflare";
import type * as pulumi from "@pulumi/pulumi";

interface Args {
	zoneId: pulumi.Input<string>;
	siteHost: string;
}

/**
 * HSTS starts at 5 minutes: browsers remember it, so a mistake (a subdomain
 * without HTTPS) would otherwise stick for a year. Raise it to 31536000 once
 * the site has been public for a while.
 */
const HSTS = "max-age=300";

/**
 * Report-only: browsers log violations in the console but block nothing.
 * Inline scripts/styles are allowed because Astro inlines the theme/motion
 * boot script and component styles. Spotify covers come from *.scdn.co.
 * Tighten, then switch the header to Content-Security-Policy.
 */
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://i.scdn.co https://mosaic.scdn.co https://image-cdn-ak.spotifycdn.com https://image-cdn-fa.spotifycdn.com",
	"font-src 'self' data:",
	"connect-src 'self' wss:",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
].join("; ");

/**
 * The zone's response-header transform rules. A zone has one ruleset per
 * phase: if one already exists (made in the dashboard), import it first
 * (scripts/discover.sh prints the command) or the create fails.
 */
export function securityHeaders({ zoneId, siteHost }: Args) {
	return new cloudflare.Ruleset("response-headers", {
		zoneId,
		name: "Response headers",
		description: "Managed by Thijmen/infra",
		kind: "zone",
		phase: "http_response_headers_transform",
		rules: [
			{
				ref: "security_headers",
				description: `Security headers for ${siteHost}`,
				expression: `http.host eq "${siteHost}"`,
				action: "rewrite",
				actionParameters: {
					headers: {
						"Strict-Transport-Security": { operation: "set", value: HSTS },
						"Content-Security-Policy-Report-Only": { operation: "set", value: CSP },
					},
				},
			},
		],
	});
}
