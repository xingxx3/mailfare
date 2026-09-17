// Cross-platform wrapper for wrangler commands that need OPEN_NEXT_DEPLOY=true.
//
// The previous npm scripts used the POSIX-only `VAR=value wrangler deploy`
// prefix, which fails on Windows cmd ("'OPEN_NEXT_DEPLOY' is not recognized").
// Resolves the repo-local wrangler from node_modules/.bin explicitly so the
// script works both via npm scripts and direct invocation, on any platform.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("wrangler/package.json"));
const bin = path.join(packageDir, "..", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");

const [command, ...args] = process.argv.slice(2);
if (!command) {
	console.error("usage: node scripts/wrangler.mjs <wrangler-command> [args...]");
	process.exit(1);
}

process.env.OPEN_NEXT_DEPLOY = "true";

// .cmd shims must go through the shell on Windows; the POSIX shim is a
// shebang script exec'd directly. Wrangler args used here are simple tokens.
const result = spawnSync(process.platform === "win32" ? `"${bin}"` : bin, [command, ...args], {
	stdio: "inherit",
	shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
