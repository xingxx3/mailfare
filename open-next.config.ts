import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const cloudflareConfig = defineCloudflareConfig({
	// Uncomment to enable R2 cache,
	// It should be imported as:
	// `import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";`
	// See https://opennext.js.org/cloudflare/caching for more details
	// incrementalCache: r2IncrementalCache,
});

export default {
	...cloudflareConfig,
	// Inner Next.js build invoked by `opennextjs-cloudflare build`.
	// MUST NOT be `npm run build` (that *is* `opennextjs-cloudflare build`
	// on Workers Builds and would recurse forever). Points at a dedicated
	// script that runs plain `next build`.
	buildCommand: "npm run build:next",
};
