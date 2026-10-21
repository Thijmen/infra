import * as cloudflare from "@pulumi/cloudflare";
import type * as pulumi from "@pulumi/pulumi";

/**
 * Cloudflare Managed Free Ruleset. Cloudflare maintains this ruleset and adds
 * emergency protections to it; executing it at version "latest" means those
 * updates apply without a Pulumi change. Paid zones would use the Cloudflare
 * Managed Ruleset (efb7b8c949ac4650a09736fc376e9aee) instead.
 */
const FREE_MANAGED_RULESET_ID = "77454fe2d30c4220b5701f6fdfb893ba";

interface Args {
	zoneName: string;
	zoneId: pulumi.Input<string>;
}

/**
 * Deploys the Cloudflare Managed Free Ruleset for a zone. A zone has one
 * entrypoint ruleset per phase: if one already exists (made in the dashboard),
 * import it first (scripts/discover.sh prints the command) or the create fails.
 */
export function managedWaf({ zoneName, zoneId }: Args) {
	const name = zoneName.replace(/[^a-z0-9]+/gi, "-");
	return new cloudflare.Ruleset(`managed-waf-${name}`, {
		zoneId,
		name: "Managed WAF entry point ruleset",
		description: "Managed by Thijmen/infra. Executes the Cloudflare Managed Free Ruleset.",
		kind: "zone",
		phase: "http_request_firewall_managed",
		rules: [
			{
				ref: "execute_cloudflare_free_managed_ruleset",
				description: "Execute the Cloudflare Managed Free Ruleset",
				expression: "true",
				action: "execute",
				actionParameters: {
					id: FREE_MANAGED_RULESET_ID,
				},
				enabled: true,
			},
		],
	});
}
