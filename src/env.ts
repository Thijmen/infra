import * as pulumi from "@pulumi/pulumi";

/**
 * Values that stay out of this public repo. They come from the environment
 * (GitHub Actions secrets in CI, a gitignored .env or a password manager
 * locally) and are marked secret right away, so previews, logs and PR
 * comments show [secret] and the state stores them encrypted.
 */
export function secretList(name: string): pulumi.Output<string[]> {
	const raw = process.env[name];
	if (!raw?.trim()) throw new Error(`${name} is not set (see .env.example)`);
	const items = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return pulumi.secret(items);
}
