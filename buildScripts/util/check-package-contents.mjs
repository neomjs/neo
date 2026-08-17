import {execFileSync}  from 'node:child_process';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-package-contents
 * @summary Asserts what the published tarball actually contains, because nothing else does.
 *
 * ## The defect class
 *
 * `package.json` declares no `files` array, so `.npmignore` is the sole gate on package contents —
 * every line in it is load-bearing, and none of them is observed. Two live defects landed there and
 * neither failed anything:
 *
 * - A rule pinned to a path and an extension (`apps/devindex/resources/*.json`) stopped matching
 *   when the corpus moved into `data/` and grew a `.jsonl`. It became vacuous silently; 26.5 MiB
 *   shipped to every consumer.
 * - A negation under a bare directory exclusion (`.neo-ai-data` + `!.neo-ai-data/concepts/`) did not
 *   widen that exclusion, it removed it — making server logs, wake-daemon state, and the Memory Core
 *   SQLite graph packable on any machine where those files exist.
 *
 * The second is the reason this script exists rather than a careful re-reading of `.npmignore`. It
 * produces a *correct-looking* package on a checkout whose `.neo-ai-data` happens to hold only the
 * carved-out subtree, and a wrong one everywhere else. Inspecting one clean tarball confirms the
 * wrong answer. Only packing a checkout that actually holds the files can falsify it — so the check
 * has to run the real `npm pack`, and reasoning about ignore-file semantics is explicitly not a
 * substitute. That reasoning is what produced both defects.
 *
 * ## What it does NOT do
 *
 * It does not audit `.npmignore` line by line, and it is not an allowlist of everything that may
 * ship. It names the directories that must never ship, so that a future pattern which quietly stops
 * matching fails here instead of in the registry.
 */

/**
 * Directories that must not appear in the tarball, each with the exact subtrees deliberately
 * carved out of it. A carve-out is spelled as a prefix so the intent stays readable next to the
 * rule it mirrors — and so an ADDED sibling of a carve-out fails rather than inheriting its pass.
 * @type {Array<{prefix: String, allow: String[], why: String}>}
 */
export const FORBIDDEN_PREFIXES = [
    {
        prefix: '.neo-ai-data/',
        allow : ['.neo-ai-data/concepts/'],
        why   : 'Agent OS plane state — server logs, wake-daemon files, deployment snapshots, and the Memory Core SQLite graph (agent memories, session records, A2A edges). The tracked concept ontology is the sole intended export.'
    },
    {
        prefix: 'apps/devindex/resources/data/',
        allow : [],
        why   : 'DevIndex crawler corpus — 26.5 MiB with no framework consumer; the browser store fetches it over HTTP from the deployed site, never from the package.'
    },
    {
        prefix: 'resources/content/',
        allow : [],
        why   : 'The synced issue/PR/discussion corpus — agent substrate, not framework code.'
    }
];

/**
 * @summary Pure predicate: which packed paths violate the forbidden-prefix rules?
 *
 * Split out from the `npm pack` invocation so the rule logic is unit-testable without spawning a
 * pack, and so a red-proof can plant a violating path directly instead of manufacturing one on disk.
 *
 * @param {String[]} packedPaths Tarball-relative paths, as reported by `npm pack --json`.
 * @param {Array<Object>} [rules=FORBIDDEN_PREFIXES] The prefix rules to enforce.
 * @returns {Array<{path: String, prefix: String, why: String}>} One entry per violating path.
 */
export function findForbiddenEntries(packedPaths, rules = FORBIDDEN_PREFIXES) {
    const findings = [];

    for (const packedPath of packedPaths) {
        for (const rule of rules) {
            if (!packedPath.startsWith(rule.prefix)) {
                continue
            }

            if (rule.allow.some(allowed => packedPath.startsWith(allowed))) {
                continue
            }

            findings.push({path: packedPath, prefix: rule.prefix, why: rule.why})
        }
    }

    return findings
}

/**
 * @summary Extracts the JSON payload from `npm pack --json` output.
 *
 * Lifecycle scripts write to stdout ahead of the payload, so the raw output is not parseable as-is.
 * The payload is the last top-level array, which starts at the first line that is exactly `[`.
 *
 * @param {String} raw Combined stdout of the pack invocation.
 * @returns {Object[]} The parsed pack report.
 * @throws {Error} When no JSON array is present.
 */
export function parsePackOutput(raw) {
    const start = raw.indexOf('\n[\n');

    if (start === -1) {
        throw new Error('check-package-contents: no JSON array found in `npm pack --json` output')
    }

    return JSON.parse(raw.slice(start))
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const raw    = execFileSync('npm', ['pack', '--dry-run', '--json'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}),
          report = parsePackOutput(raw)[0],
          files  = report.files.map(file => file.path),
          found  = findForbiddenEntries(files);

    if (found.length) {
        console.error(`\x1b[31mcheck-package-contents: ${found.length} forbidden entr(ies) in the npm tarball:\x1b[0m`);

        const byPrefix = new Map();

        for (const finding of found) {
            byPrefix.set(finding.prefix, byPrefix.get(finding.prefix) || {why: finding.why, paths: []});
            byPrefix.get(finding.prefix).paths.push(finding.path)
        }

        for (const [prefix, group] of byPrefix) {
            console.error(`\n  ${prefix} — ${group.paths.length} file(s)`);
            console.error(`    ${group.why}`);
            group.paths.slice(0, 10).forEach(entry => console.error(`      ${entry}`));

            if (group.paths.length > 10) {
                console.error(`      … and ${group.paths.length - 10} more`)
            }
        }

        console.error(`
An .npmignore rule that used to cover these has stopped covering them. Do not fix it by reading the
patterns — that is what produced the defects this check exists for. Change the rule, re-run this
check, and let the pack decide.`);

        process.exit(1)
    }

    console.log(`check-package-contents: OK — ${report.entryCount} files, ${(report.size / 1048576).toFixed(2)} MiB tarball, ${(report.unpackedSize / 1048576).toFixed(2)} MiB unpacked; no forbidden entries.`)
}
