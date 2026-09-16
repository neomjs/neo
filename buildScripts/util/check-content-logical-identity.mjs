import {readdirSync, statSync} from 'node:fs';
import path                    from 'node:path';
import process                 from 'node:process';
import {fileURLToPath}         from 'node:url';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const ROOT        = path.resolve(__dirname, '../..');
const ARCHIVE_REL = 'resources/content/archive';

/**
 * @module buildScripts/util/check-content-logical-identity
 * @summary Fails a commit that gives two archived artifacts the same logical name — the corpus
 * invariant that, until now, was enforced only at embed time by a consumer running somewhere else.
 *
 * ## The defect
 *
 * `resources/content/archive/<family>/<version>/chunk-N/<name>.md` is addressed by ordinal chunk —
 * the archived-content layout decision record defines that path shape and supplies the remediation
 * this guard's failure message prescribes, so it is the contract rather than a status note — but a
 * consumer resolves an artifact by its LOGICAL name — `pulls/pr-<id>` — not
 * by path. So two files in different chunks claiming one logical name are two documents asserting one
 * identity, and nothing on disk records which is current. `PullRequestSource` already refuses to embed
 * in that state, fail-closed and with a precise message:
 *
 *     pull request <id> has more than one local artifact (…chunk-1/pr-<id>.md and
 *     …chunk-10/pr-<id>.md) — refusing to embed duplicate evidence under one logical name.
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
 * A consumer keys on `<family>/<logical name>`, so the scope here matches it: `pr-<id>.md` may exist
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
 * The corpus this guard reads, as a glob — the form a workflow `paths:` filter takes, so the sibling
 * alignment spec can hold the mirror to what is actually read.
 *
 * One member, and it is the whole corpus rather than a per-family list: the families are DERIVED from
 * reading the directory, so naming them here would reintroduce exactly the roster this guard refuses
 * to keep. Every member must be TRACKED, since a workflow filter can only select files CI checks out.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([`${ARCHIVE_REL}/**`]);

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

/**
 * @summary The GitHub id a corpus artifact's filename carries, which the layout contract's §2.5 orders a bucket by.
 *
 * The trailing digits, because the prefix varies by family — `pr-11982.md`, `issue-1234.md`. Anything
 * else returns `null` rather than 0: a name with no id cannot be placed by an ordinal at all, and
 * folding it to 0 would silently sort it first and report every later member as misplaced.
 * @param {String} fileName
 * @returns {Number|null}
 */
export function artifactId(fileName) {
    const match = fileName.match(/(\d+)\.md$/);

    return match ? Number(match[1]) : null
}

/**
 * @summary Which artifacts sit on an ordinal the archived-content layout contract would not compute for them.
 *
 * §2.2 places the item at index `i` of a bucket in `chunk-{floor(i / 100) + 1}`, §2.5 orders the bucket
 * by ascending GitHub id, and §2.2.1 requires the membership to be COMPLETE — the three compose, and the
 * completeness clause is what makes this derivable at all: an ordinal computed over a partial bucket is
 * the drift this measures rather than a check for it.
 *
 * Buckets are `<family>/<version>`, derived from disk on both levels, so a family or a version added
 * later is measured without an edit here.
 *
 * **Report-only by contract.** This returns findings; it never decides an exit code. The corpus carries
 * known non-conformances, and a blocking audit would wedge every commit in the repository — the same
 * reasoning that wired only the duplicate check as blocking.
 *
 * A bucket holding an artifact with no id is reported as `unorderable` instead of being ranked, because
 * a guess at its position would misreport every member after it.
 *
 * @param {Object} options
 * @param {String} options.archiveRoot Absolute path to the archive tree.
 * @returns {Array<{bucket: String, members: Number, expectedChunks: Number, unorderable: String[], misplaced: Array<{file: String, id: Number, chunk: Number|null, expected: Number}>}>}
 */
export function findOrdinalMisplacements({archiveRoot}) {
    const findings = [];

    for (const family of listArchiveFamilies(archiveRoot)) {
        for (const version of listArchiveFamilies(path.join(archiveRoot, family))) {
            const
                bucketDir   = path.join(archiveRoot, family, version),
                artifacts   = collectArtifacts(bucketDir),
                unorderable = [],
                members     = [];

            for (const absPath of artifacts) {
                const id = artifactId(path.basename(absPath));

                id === null ? unorderable.push(absPath) : members.push({
                    file : absPath,
                    id,
                    chunk: Number((path.relative(bucketDir, absPath).match(/^chunk-(\d+)/) || [])[1]) || null
                })
            }

            if (!members.length && !unorderable.length) continue;

            members.sort((a, b) => a.id - b.id);

            const misplaced = members
                .map((member, index) => ({...member, expected: Math.floor(index / 100) + 1}))
                .filter(member => member.chunk !== member.expected);

            (misplaced.length || unorderable.length) && findings.push({
                bucket        : `${family}/${version}`,
                members       : members.length,
                expectedChunks: members.length ? Math.floor((members.length - 1) / 100) + 1 : 0,
                unorderable,
                misplaced
            })
        }
    }

    return findings.sort((a, b) => a.bucket.localeCompare(b.bucket))
}

const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedAsCli) {
    const
        archiveRoot = path.join(ROOT, ARCHIVE_REL),
        args        = process.argv.slice(2),
        auditAll    = args.includes('--all'),
        candidates  = args.filter(arg => !arg.startsWith('--')),
        targets     = auditAll ? null : candidates
            .map(file => path.resolve(ROOT, file))
            .filter(file => file.startsWith(archiveRoot + path.sep) && file.endsWith('.md'));

    // Report-only, and it exits BEFORE the duplicate check rather than beside it: this mode answers a
    // different question and must never contribute to that check's exit code.
    if (args.includes('--ordinals')) {
        const findings = findOrdinalMisplacements({archiveRoot});

        if (findings.length) {
            const total = findings.reduce((sum, {misplaced}) => sum + misplaced.length, 0);

            console.log(`check-content-logical-identity: ${total} artifact(s) on an ordinal ADR 0004 §2.2 would not compute:`);

            findings.forEach(({bucket, members, expectedChunks, misplaced, unorderable}) => {
                console.log(`  ${bucket.padEnd(30)} members=${String(members).padStart(5)}  ADR shape=chunk-1..${expectedChunks}  misplaced=${misplaced.length}`);
                unorderable.length && console.log(`    ${unorderable.length} artifact(s) carry no id and were not ranked`)
            });

            console.log('\nReported, not enforced: the corpus carries known non-conformances, so a blocking audit here');
            console.log('would wedge every commit. Re-placement and the question of whether ADR 0004 §2.2\'s derivability');
            console.log('claim is worth a corpus rewrite are the parent ticket\'s, not this mode\'s.')
        } else {
            console.log('check-content-logical-identity: every archived artifact sits on its ADR 0004 §2.2 ordinal.')
        }

        process.exit(0)
    }

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
