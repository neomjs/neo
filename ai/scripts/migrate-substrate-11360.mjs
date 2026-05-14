/**
 * @summary One-shot substrate cleanup script for Epic #11187 Phase 6 sub-issue #11360.
 *
 * Generates a dry-run JSON manifest classifying every operation across the corrupted
 * substrate state (per Discussion #11359 rev4 + @neo-gpt V-B-A), then optionally applies
 * the operations atomically to bring resources/content/ to Epic #11187 target architecture.
 *
 * Mental model (operator-canonical, Discussion #11359 section 1):
 *   - Active resources/content/issues, pulls, discussions = OPEN backlog + closed-for-next-release
 *   - Archive resources/content/archive/type/vN.M.K = past-release items (created at release-cut only)
 *
 * Operations applied:
 *   1. Delete legacy issue-archive (3,153 files) and pr-archive (17 files + README)
 *   2. Collision-aware 195 v13 PR resolution (per @neo-gpt 187/4/4 breakdown):
 *      - byte-identical duplicates -> delete from archive
 *      - stale-active collisions -> replace active with v13 content
 *      - missing-active -> move v13 -> active
 *      - Then delete the entire archive/pulls/v13.0.0/ subtree
 *   3. Active-tier residue cleanup:
 *      - 25 flat issues/issue-N.md -> issues/NNNxx/issue-N.md
 *      - 6 wrong-dir pulls/111xx/pr-N.md -> pulls/pr-111xx/pr-N.md
 *   4. Atomic metadata reset: delete resources/content/.sync-metadata.json
 *   5. Delete ai/scripts/migrate-pr-archive-ac8.mjs (one-shot, harmful --fallback-version flag enabled the bug)
 *
 * Sibling pattern lift: ai/scripts/migrate-pr-archive-ac8.mjs (the script we are deleting); same
 *   one-shot migration role, same --dry-run / --apply CLI shape, same ai/scripts/ placement.
 *
 * Usage:
 *   node ai/scripts/migrate-substrate-11360.mjs --dry-run    # emit JSON manifest to stdout
 *   node ai/scripts/migrate-substrate-11360.mjs --apply      # execute operations
 *   node ai/scripts/migrate-substrate-11360.mjs --apply --no-delete-metadata  # opt-out atomic metadata reset (only useful for staged-review test runs)
 *
 * @see https://github.com/neomjs/neo/issues/11360
 * @see https://github.com/neomjs/neo/issues/11187 -- Epic #11187 Phase 6
 * @see https://github.com/orgs/neomjs/discussions/11359 -- graduating Discussion (rev4)
 */
import {execSync}      from 'child_process';
import crypto          from 'crypto';
import fs              from 'fs/promises';
import {existsSync}    from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @summary Returns the chunk-dir name for a numeric ID, e.g. 10287 → '102xx', 8160 → '081xx'.
 *   Matches `ai/services/github-workflow/shared/chunkPath.mjs`.
 */
function chunkPath(number) {
    return String(number).padStart(4, '0').slice(0, -2) + 'xx';
}

/**
 * @summary Reads file SHA1 (matches git's blob hash for content-only files of size <2KB; for our
 *   markdown corpus the hash is just a comparison-key, exact git-blob equivalence not required).
 */
async function blobHash(absPath) {
    const buf = await fs.readFile(absPath);
    return crypto.createHash('sha1').update(buf).digest('hex');
}

/**
 * @summary Returns the git-blob hash of a tracked file at origin/dev via `git ls-tree`.
 *   This is the canonical truth per @tobiu's "source of truth is the github repo dev branch."
 */
function gitBlobHashAt(ref, relPath) {
    try {
        const out = execSync(`git ls-tree ${ref} -- ${JSON.stringify(relPath)}`, {cwd: projectRoot, encoding: 'utf-8'}).trim();
        if (!out) return null;
        return out.split(/\s+/)[2]; // "100644 blob <sha>\t<path>"
    } catch (_) {
        return null;
    }
}

/**
 * @summary Lists tracked files under a path in origin/dev (recursive).
 */
function gitLsTree(ref, relPath) {
    try {
        const out = execSync(`git ls-tree -r ${ref} -- ${JSON.stringify(relPath)}`, {cwd: projectRoot, encoding: 'utf-8'});
        return out.trim().split('\n').filter(Boolean).map(line => {
            const [mode, type, hashAndPath] = line.split(/\s+/, 3);
            const sha  = hashAndPath;
            const rest = line.split('\t', 2);
            return {mode, type, sha, path: rest[1]};
        });
    } catch (_) {
        return [];
    }
}

function extractIssueNumber(filename) {
    const m = filename.match(/^issue-(\d+)\.md$/);
    return m ? parseInt(m[1], 10) : null;
}
function extractPrNumber(filename) {
    const m = filename.match(/^pr-(\d+)\.md$/);
    return m ? parseInt(m[1], 10) : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────────────

async function buildManifest({ref = 'origin/dev'} = {}) {
    const manifest = {
        meta: {
            generatedAt: new Date().toISOString(),
            sourceRef  : ref,
            sourceHead : execSync(`git rev-parse ${ref}`, {cwd: projectRoot, encoding: 'utf-8'}).trim(),
            ticket     : 'https://github.com/neomjs/neo/issues/11360',
            discussion : 'https://github.com/orgs/neomjs/discussions/11359'
        },
        summary: {
            delete_legacy_issue_archive : 0,
            delete_legacy_pr_archive    : 0,
            delete_v13_duplicates       : 0,
            replace_stale_active        : 0,
            move_missing_active         : 0,
            move_flat_issues_to_chunked : 0,
            move_wrong_dir_pulls        : 0,
            delete_v13_subtree          : 1,
            delete_migration_script     : 1,
            reset_metadata              : 1
        },
        operations: []
    };

    // ── Build maps from origin/dev tracked state
    const allPulls = gitLsTree(ref, 'resources/content/pulls');
    const allIssues = gitLsTree(ref, 'resources/content/issues');
    const v13Pulls = gitLsTree(ref, 'resources/content/archive/pulls/v13.0.0');
    const legacyIssueArchive = gitLsTree(ref, 'resources/content/issue-archive');
    const legacyPrArchive = gitLsTree(ref, 'resources/content/pr-archive');

    // Active pulls indexed by PR number
    const activePullsByNumber = new Map();
    for (const f of allPulls) {
        const filename = path.basename(f.path);
        const n = extractPrNumber(filename);
        if (n != null) activePullsByNumber.set(n, f);
    }

    // ── 1. Legacy issue-archive: delete all
    for (const f of legacyIssueArchive) {
        manifest.operations.push({type: 'delete', path: f.path, blob: f.sha, reason: 'legacy-issue-archive'});
        manifest.summary.delete_legacy_issue_archive++;
    }

    // ── 2. Legacy pr-archive: delete all
    for (const f of legacyPrArchive) {
        manifest.operations.push({type: 'delete', path: f.path, blob: f.sha, reason: 'legacy-pr-archive'});
        manifest.summary.delete_legacy_pr_archive++;
    }

    // ── 3. v13 PR resolution (collision-aware)
    for (const v13 of v13Pulls) {
        const filename = path.basename(v13.path);
        const n = extractPrNumber(filename);
        if (n == null) continue;

        const active = activePullsByNumber.get(n);
        const targetActivePath = `resources/content/pulls/pr-${chunkPath(n)}/pr-${n}.md`;

        if (!active) {
            // missing-active → move v13 → active
            manifest.operations.push({
                type: 'move', from: v13.path, to: targetActivePath, blob: v13.sha,
                reason: 'missing-active', prNumber: n
            });
            manifest.summary.move_missing_active++;
        } else if (active.sha === v13.sha) {
            // byte-identical duplicate → delete v13 copy
            manifest.operations.push({
                type: 'delete', path: v13.path, blob: v13.sha,
                reason: 'duplicate-of-active', active_path: active.path, prNumber: n
            });
            manifest.summary.delete_v13_duplicates++;
        } else {
            // stale-active collision → replace active with v13 content (v13 has newer MERGED state)
            manifest.operations.push({
                type: 'replace', from: v13.path, to: targetActivePath, blob_from: v13.sha, blob_to: active.sha,
                reason: 'stale-active', prNumber: n,
                old_active_path: active.path !== targetActivePath ? active.path : null
            });
            manifest.summary.replace_stale_active++;
        }
    }
    manifest.operations.push({type: 'delete-tree', path: 'resources/content/archive/pulls/v13.0.0', reason: 'v13-bucket-no-longer-needed-post-resolution'});

    // ── 4. Active-tier residue: flat issues
    for (const f of allIssues) {
        const filename = path.basename(f.path);
        const dir = path.dirname(f.path);
        const n = extractIssueNumber(filename);
        if (n == null) continue;

        // Flat issue: at `resources/content/issues/issue-N.md` (no chunked subdir)
        if (dir === 'resources/content/issues') {
            const targetPath = `resources/content/issues/${chunkPath(n)}/issue-${n}.md`;
            manifest.operations.push({type: 'move', from: f.path, to: targetPath, blob: f.sha, reason: 'flat-to-chunked', issueNumber: n});
            manifest.summary.move_flat_issues_to_chunked++;
        }
    }

    // ── 5. Active-tier residue: wrong-dir pulls under pulls/<NNN>xx/ (should be pulls/pr-<NNN>xx/)
    // Build set of PRs already handled by stale-active replace (they redirect to correct target path)
    const staleActivePrs = new Set(
        manifest.operations.filter(op => op.reason === 'stale-active').map(op => op.prNumber)
    );
    for (const f of allPulls) {
        const filename = path.basename(f.path);
        const dir = path.dirname(f.path);
        const n = extractPrNumber(filename);
        if (n == null) continue;

        // Match `resources/content/pulls/111xx/pr-NNNNN.md` (no `pr-` chunk prefix)
        const dirMatch = dir.match(/^resources\/content\/pulls\/(\d{3}xx)$/);
        if (dirMatch && !dir.includes('pr-')) {
            // Skip if stale-active replace already handles redirect to target path
            if (staleActivePrs.has(n)) {
                continue;
            }
            const correctChunk = chunkPath(n);
            const targetPath = `resources/content/pulls/pr-${correctChunk}/pr-${n}.md`;
            manifest.operations.push({type: 'move', from: f.path, to: targetPath, blob: f.sha, reason: 'wrong-dir-pull', prNumber: n});
            manifest.summary.move_wrong_dir_pulls++;
        }
    }

    // ── 6. Atomic metadata reset
    manifest.operations.push({type: 'delete', path: 'resources/content/.sync-metadata.json', reason: 'force-regen-on-next-sync', atomicity: 'must-be-in-same-commit-as-cleanup'});

    // ── 7. Delete migration script
    manifest.operations.push({type: 'delete', path: 'ai/scripts/migrate-pr-archive-ac8.mjs', reason: 'one-shot-script-job-done; harmful --fallback-version flag was the bug enabler'});

    manifest.summary.total_ops = manifest.operations.length;

    return manifest;
}

// ──────────────────────────────────────────────────────────────────────────────
// Apply
// ──────────────────────────────────────────────────────────────────────────────

async function applyManifest(manifest, {dryRun = true, deleteMetadata = true} = {}) {
    const log = (msg) => console.error(msg);
    let applied = 0, skipped = 0, failed = 0;

    for (const op of manifest.operations) {
        try {
            switch (op.type) {
                case 'delete': {
                    if (op.path === 'resources/content/.sync-metadata.json' && !deleteMetadata) {
                        log(`  skip (--no-delete-metadata): ${op.path}`);
                        skipped++; break;
                    }
                    const abs = path.join(projectRoot, op.path);
                    if (dryRun) log(`  delete: ${op.path}`);
                    else {
                        if (existsSync(abs)) {
                            await fs.unlink(abs);
                            applied++;
                        } else skipped++;
                    }
                    break;
                }
                case 'delete-tree': {
                    const abs = path.join(projectRoot, op.path);
                    if (dryRun) log(`  delete-tree: ${op.path}`);
                    else {
                        if (existsSync(abs)) {
                            await fs.rm(abs, {recursive: true, force: true});
                            applied++;
                        } else skipped++;
                    }
                    break;
                }
                case 'move': {
                    const from = path.join(projectRoot, op.from);
                    const to   = path.join(projectRoot, op.to);
                    if (dryRun) log(`  move: ${op.from} → ${op.to}`);
                    else {
                        await fs.mkdir(path.dirname(to), {recursive: true});
                        await fs.rename(from, to);
                        applied++;
                    }
                    break;
                }
                case 'replace': {
                    const from = path.join(projectRoot, op.from);
                    const to   = path.join(projectRoot, op.to);
                    // If old active path differs from target chunked path, delete old too
                    if (dryRun) {
                        log(`  replace: ${op.from} → ${op.to}` + (op.old_active_path ? ` (delete old: ${op.old_active_path})` : ''));
                    } else {
                        await fs.mkdir(path.dirname(to), {recursive: true});
                        // If old active path differs from target path, remove old first
                        if (op.old_active_path && op.old_active_path !== op.to) {
                            const oldAbs = path.join(projectRoot, op.old_active_path);
                            if (existsSync(oldAbs)) await fs.unlink(oldAbs);
                        }
                        // Move v13 → target active path (overwriting if exists)
                        if (existsSync(to)) await fs.unlink(to);
                        await fs.rename(from, to);
                        applied++;
                    }
                    break;
                }
                default:
                    log(`  unknown op type: ${op.type}`);
                    failed++;
            }
        } catch (e) {
            log(`  ✗ FAIL ${op.type} ${op.path || op.from || ''}: ${e.message}`);
            failed++;
        }
    }
    return {applied, skipped, failed};
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry-run') || (!argv.includes('--apply'));
const isApply  = argv.includes('--apply');
const noDeleteMetadata = argv.includes('--no-delete-metadata');

(async () => {
    if (isDryRun && !isApply) {
        const manifest = await buildManifest();
        // Pipe-safe emit: when stdout is a pipe (e.g., `... | head` or `... | jq`), Node turns it
        // non-blocking and `console.log` may return before the kernel buffer drains. With ~3,400
        // operations the pretty-printed JSON exceeds the default 64 KiB pipe buffer, so an early
        // `process.exit(0)` truncates the trailing operations. Per @neo-gpt PR #11362 Cycle 1
        // review finding: use `process.stdout.write(..., cb)` and exit only from the drain callback
        // so the full manifest reaches downstream parsers reliably.
        process.stdout.write(JSON.stringify(manifest, null, 2) + '\n', () => process.exit(0));
        return;
    }

    // --apply
    console.error(`Applying substrate cleanup for #11360 — building manifest...`);
    const manifest = await buildManifest();
    console.error(`Manifest summary:`);
    for (const [k, v] of Object.entries(manifest.summary)) {
        console.error(`  ${k}: ${v}`);
    }
    console.error(`\nApplying ${manifest.operations.length} operations...`);
    const stats = await applyManifest(manifest, {dryRun: false, deleteMetadata: !noDeleteMetadata});
    console.error(`\nDone: ${stats.applied} applied, ${stats.skipped} skipped, ${stats.failed} failed.`);
    if (stats.failed > 0) process.exit(1);
})();
