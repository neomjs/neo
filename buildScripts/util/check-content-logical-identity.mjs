import {readdirSync, statSync} from 'node:fs';
import path                    from 'node:path';
import process                 from 'node:process';
import {fileURLToPath}         from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-content-logical-identity
 * @summary Fails a commit that gives two archived artifacts the same logical name — the corpus
 * invariant that, until now, was enforced only at embed time by a consumer running somewhere else.
 *
 * ## The defect
 *
 * `resources/content/archive/<family>/<version>/chunk-N/<name>.md` is addressed by ordinal chunk
 * (ADR 0004 §2.2 — ticket-ref-ok: the ADR DEFINES the layout this check enforces and supplies the
 * remediation the failure message prescribes, so the pointer is the contract, not a status note),
 * but a consumer resolves an artifact by its LOGICAL name — `pulls/pr-11982` — not
 * by path. So two files in different chunks claiming one logical name are two documents asserting one
 * identity, and nothing on disk records which is current. `PullRequestSource` already refuses to embed
 * in that state, fail-closed and with a precise message:
 *
 *     pull request 11982 has more than one local artifact (…chunk-1/pr-11982.md and
 *     …chunk-10/pr-11982.md) — refusing to embed duplicate evidence under one logical name.
 *
 * That refusal is correct and it is also the whole problem: it is the ONLY enforcement, it lives at
 * the point of consumption, and it runs on the Knowledge Base ingestion schedule — days later, often
 * on someone else's host, long after the commit that broke the invariant. By then the failure presents
 * as "the deployment's Knowledge Base is empty", which is where it was actually found.
 *
 * What makes it permanent is not a missing repair, and not a missing schedule. `SyncService.runFullSync`
 * carries `PullRequestSyncer.repairDuplicateArtifacts` at stage 7-b, and the orchestrator does schedule
 * it — `githubWorkflowSync`, default every two hours, enabled on local deployments and correctly
 * disabled on cloud ones, which must never sync this repo. The repair RUNS.
 *
 * It just never lands. Stage 7-d takes a terminal integrity verdict AFTER the repair and throws when the
 * corpus is unclean, and the aggregate verdict then fails the run before the generated-content commit.
 * A corpus with one duplicate therefore repairs itself on disk every couple of hours and is never
 * delivered — the fix accumulates in a working tree while the committed corpus stays broken, so every
 * consumer keeps reading the broken state. The failure mode is delivery, not detection or repair, which
 * is why "it is already automated" is not reassurance here.
 *
 * An invariant of the committed corpus belongs where the corpus changes. Same shape as the config-leaf
 * parity manifest: assert at commit time rather than discover at runtime.
 *
 * ## Why the family, not the bucket, is the collision scope
 *
 * A consumer keys on `<family>/<logical name>`, so the scope here matches it: `pr-11982.md` may exist
 * once across ALL of `archive/pulls`, not once per version bucket. A pull request belongs to exactly
 * one release, so the same name under two version folders is the same defect wearing a different
 * shape — and scoping per-bucket would have missed it while reporting green.
 *
 * ## Families are DERIVED, never listed
 *
 * The families come from reading `archive/`, not from a roster in this file. A hardcoded
 * `['pulls', 'issues', 'discussions']` would cover the families the author knew about and silently
 * exempt the next one, which is the failure mode `check-derived-domain.mjs` exists to flag — a guard
 * reporting success over a set that grew behind it. This check must not commit the defect it is
 * modelled on.
 *
 * ## Modes
 *
 * - **paths given** (the `lint-staged` path): only artifacts in this change are checked, each against
 *   the whole corpus. This is the commit-time gate — it blocks a NEW collision without failing on
 *   pre-existing ones a commit does not touch, so it lands green on a corpus still awaiting repair.
 * - **`--all`**: audits every family and exits non-zero on any collision. Wired into CI on both
 *   `push` and `pull_request` against `dev`, where `push` is the load-bearing trigger — corpus
 *   artifacts arrive by direct push from the sync path, not by pull request. A full audit is safe as
 *   a blocking gate only because the corpus is clean; while it carried known collisions, blocking on
 *   it would have wedged every commit in the repository until an unrelated repair cleared them.
 *   Keep that in mind before adding a family with pre-existing damage: fix first, then let CI hold.
 */

/**
 * @summary Lists the archived-content families present on disk.
 * @param {String} archiveRoot Absolute path to the archive tree.
 * @returns {String[]} Directory names, derived — never a hardcoded roster.
 */
export function listArchiveFamilies(archiveRoot) {
    let entries;

    try {
        entries = readdirSync(archiveRoot);
    } catch {
        return []
    }

    return entries.filter(entry => {
        try {
            return statSync(path.join(archiveRoot, entry)).isDirectory()
        } catch {
            return false
        }
    })
}

/**
 * @summary Every `.md` artifact under one family, recursively.
 * @param {String} familyDir Absolute path to `archive/<family>`.
 * @returns {String[]} Absolute file paths.
 * @private
 */
function collectArtifacts(familyDir) {
    const found = [];

    const walk = dir => {
        let entries;

        try {
            entries = readdirSync(dir, {withFileTypes: true});
        } catch {
            return
        }

        for (const entry of entries) {
            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(full)
            } else if (entry.name.endsWith('.md')) {
                found.push(full)
            }
        }
    };

    walk(familyDir);

    return found
}

/**
 * @summary Maps `<family>/<logical name>` to every artifact claiming it.
 * @param {String} archiveRoot Absolute path to the archive tree.
 * @returns {Map<String, String[]>} Keys with more than one value are collisions.
 */
export function buildLogicalIndex(archiveRoot) {
    const index = new Map();

    for (const family of listArchiveFamilies(archiveRoot)) {
        for (const absPath of collectArtifacts(path.join(archiveRoot, family))) {
            const key = `${family}/${path.basename(absPath)}`;

            if (!index.has(key)) index.set(key, []);
            index.get(key).push(absPath)
        }
    }

    return index
}

/**
 * @summary Finds logical-name collisions, optionally restricted to the artifacts a change touches.
 * @param {Object} options
 * @param {String} options.archiveRoot Absolute path to the archive tree.
 * @param {String[]} [options.targets=null] Absolute paths from the change. When given, only collisions
 *     involving one of them are reported — a pre-existing collision the change never touched is not
 *     this commit's to fix. `null` audits everything.
 * @returns {Array<{key: String, paths: String[]}>}
 */
export function findLogicalIdentityCollisions({archiveRoot, targets = null}) {
    const
        index    = buildLogicalIndex(archiveRoot),
        resolved = targets && new Set(targets.map(target => path.resolve(target))),
        findings = [];

    for (const [key, paths] of index) {
        if (paths.length < 2) continue;

        if (resolved && !paths.some(candidate => resolved.has(path.resolve(candidate)))) continue;

        findings.push({key, paths})
    }

    return findings.sort((a, b) => a.key.localeCompare(b.key))
}

const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedAsCli) {
    const
        archiveRoot = path.join(ROOT, 'resources/content/archive'),
        args        = process.argv.slice(2),
        auditAll    = args.includes('--all'),
        candidates  = args.filter(arg => !arg.startsWith('--')),
        targets     = auditAll ? null : candidates
            .map(file => path.resolve(ROOT, file))
            .filter(file => file.startsWith(archiveRoot + path.sep) && file.endsWith('.md'));

    // `lint-staged` invokes this with the staged set; nothing under `archive/` means nothing to say.
    if (!auditAll && targets.length === 0) {
        process.exit(0)
    }

    const findings = findLogicalIdentityCollisions({archiveRoot, targets});

    if (findings.length) {
        console.error(`\x1b[31mcheck-content-logical-identity: ${findings.length} logical name(s) claimed by more than one artifact:\x1b[0m`);

        for (const finding of findings) {
            console.error(`  ${finding.key}`);
            finding.paths.forEach(absPath => console.error(`    ${path.relative(ROOT, absPath)}`))
        }

        console.error(`
A consumer resolves an artifact by its logical name, so two files claiming one name are two documents
asserting one identity. \`PullRequestSource\` refuses to embed in this state, which stalls Knowledge
Base ingestion wholesale — the corpus stops being ingestible, not just these artifacts.

Fix: keep ONE artifact per logical name. Its correct home is the ordinal chunk ADR 0004 §2.2 computes
against COMPLETE bucket membership (§2.2.1) with §2.5's ordering — ascending GitHub ID within the
version bucket. Do NOT resolve a divergent pair by keeping whichever copy looks newer: nothing on disk
records which is current, so re-derive it from GitHub via
\`PullRequestSyncer.repairDuplicateArtifacts\` from the neo-agent-brain checkout.`);

        process.exit(1)
    }
}
