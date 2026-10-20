#!/usr/bin/env bash
# Lists what already exists in the Cloudflare account (made in the dashboard)
# and prints the `pulumi import` command for each, so clickops can be adopted
# instead of recreated. Read-only. Needs CLOUDFLARE_API_TOKEN, curl and jq.
#
#   ./scripts/discover.sh            # list everything
#   pulumi import <type> <name> <id> # adopt one; Pulumi prints the code for it
set -euo pipefail

ACCOUNT_ID="${ACCOUNT_ID:-7dac805f31c2d6d9d0b73499d61513d2}"
ZONE_NAME="${ZONE_NAME:-thijmen.cloud}"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"

api() {
	curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4$1"
}
slug() { tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//'; }

echo "# Access applications"
api "/accounts/$ACCOUNT_ID/access/apps?per_page=100" | jq -r '.result[] | [.id, .name, (.domain // "")] | @tsv' |
	while IFS=$'\t' read -r id name domain; do
		echo "#   $name ($domain)"
		echo "pulumi import cloudflare:index/zeroTrustAccessApplication:ZeroTrustAccessApplication $(echo "$name" | slug) 'accounts/$ACCOUNT_ID/$id'"
	done

echo; echo "# Reusable Access policies"
api "/accounts/$ACCOUNT_ID/access/policies?per_page=100" | jq -r '.result[] | [.id, .name, .decision] | @tsv' |
	while IFS=$'\t' read -r id name decision; do
		echo "#   $name ($decision)"
		echo "pulumi import cloudflare:index/zeroTrustAccessPolicy:ZeroTrustAccessPolicy $(echo "$name" | slug) '$ACCOUNT_ID/$id'"
	done

echo; echo "# Zero Trust lists"
api "/accounts/$ACCOUNT_ID/gateway/lists?per_page=100" | jq -r '.result[] | [.id, .name, .type] | @tsv' |
	while IFS=$'\t' read -r id name type; do
		echo "#   $name ($type)"
		echo "pulumi import cloudflare:index/zeroTrustList:ZeroTrustList $(echo "$name" | slug) '$ACCOUNT_ID/$id'"
	done

ZONE_ID=$(api "/zones?name=$ZONE_NAME" | jq -r '.result[0].id')
echo; echo "# Zone $ZONE_NAME ($ZONE_ID): response-header transform ruleset"
if rs=$(api "/zones/$ZONE_ID/rulesets/phases/http_response_headers_transform/entrypoint" 2>/dev/null); then
	id=$(echo "$rs" | jq -r '.result.id')
	echo "#   exists with $(echo "$rs" | jq '.result.rules | length') rule(s): import it before the first \`pulumi up\`"
	echo "pulumi import cloudflare:index/ruleset:Ruleset response-headers 'zones/$ZONE_ID/$id'"
else
	echo "#   none yet: src/headers.ts will create it"
fi

echo; echo "# DNS records (not managed yet; adopt when you want them in code)"
api "/zones/$ZONE_ID/dns_records?per_page=500" | jq -r '.result[] | [.id, .type, .name] | @tsv' |
	while IFS=$'\t' read -r id type name; do
		echo "pulumi import cloudflare:index/dnsRecord:DnsRecord $(echo "$type-$name" | slug) '$ZONE_ID/$id'"
	done
