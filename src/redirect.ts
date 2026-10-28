import * as cloudflare from "@pulumi/cloudflare";
import type * as pulumi from "@pulumi/pulumi";

interface Args {
	zoneId: pulumi.Input<string>;
	/** Canonical host, e.g. www.thijmen.cloud. */
	siteHost: string;
}

/**
 * Sends the apex to the canonical host, keeping path and query string.
 *
 * A Single Redirect runs at the edge before Access, Workers and cache, so the
 * apex never reaches the site. The apex DNS record must stay proxied for the
 * rule to see the request.
 *
 * A zone has one ruleset per phase: if one already exists (made in the
 * dashboard), import it first (scripts/discover.sh prints the command) or the
 * create fails.
 */
export function apexRedirect({ zoneId, siteHost }: Args) {
	const apex = siteHost.replace(/^www\./, "");
	return new cloudflare.Ruleset("redirects", {
		zoneId,
		name: "Redirects",
		description: "Managed by Thijmen/infra",
		kind: "zone",
		phase: "http_request_dynamic_redirect",
		rules: [
			{
				ref: "apex_to_www",
				description: `Redirect ${apex} to ${siteHost}`,
				expression: `http.host eq "${apex}"`,
				action: "redirect",
				actionParameters: {
					fromValue: {
						targetUrl: { expression: `concat("https://${siteHost}", http.request.uri.path)` },
						statusCode: 301,
						preserveQueryString: true,
					},
				},
			},
		],
	});
}
