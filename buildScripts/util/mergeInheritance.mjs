import {execSync} from 'node:child_process';
import path       from 'node:path';

/**
 * @module buildScripts/util/mergeInheritance
 * @summary Tells a pre-commit guard which staged files it did NOT author.
 *
 * A merge stages EVERY file it brings in. Guards that read the staged set therefore see the merged
 * branch's commits — the sync pipeline's `resources/content/**`, another maintainer's `.mjs` drift —
 * and blame the merging branch for content it never touched. Left unhandled that makes
 * `git merge origin/dev` impossible on any branch older than the last pipeline commit, and the ways
 * through are worse than the block: `--no-verify` also skips the AiConfig test-mutation safety lint,
 * and unstaging the files makes the merge commit REVERT them once it lands.
 *
 * The distinction is NOT "a merge is in progress, stand down" — that would wave through a file
 * hand-edited during a conflict resolution, which is authoring wearing a merge's clothes. It is
 * per-file: a staged file is inherited only while the index still matches what the merge brought in.
 *
 * Shared rather than inlined per guard: two copies of this rule would drift, and the one that drifts
 * is the one nobody notices — it fails open, silently, on exactly the content it exists to police.
 */

/**
 * @summary Build a predicate answering "did the merge bring this file in unchanged?".
 *
 * Fails CLOSED by design: outside a merge, or if git cannot answer, every file is treated as
 * authored and the caller's checks apply in full. A guard that cannot PROVE a file was inherited
 * must not assume it was.
 * @param {String} gitRoot Absolute path to the repository root.
 * @returns {Function} `(file: String) => Boolean` — `true` only for merge-inherited files. Accepts
 *     absolute or repo-relative paths (lint-staged passes absolute; git reports relative).
 */
export function createInheritedFromMergeFilter(gitRoot) {
    let divergedFromMergeHead;

    try {
        // Throws outside a merge — the common case, and the cheapest possible discriminator.
        execSync('git rev-parse -q --verify MERGE_HEAD', {cwd: gitRoot, stdio: 'ignore'});

        // Staged content that DIFFERS from MERGE_HEAD: authored or edited here. Everything else the
        // merge staged still matches MERGE_HEAD and is therefore inherited. A file the merge did not
        // carry at all also reads as diverged (MERGE_HEAD lacks it), which is the correct answer.
        divergedFromMergeHead = new Set(
            execSync('git diff --cached --name-only MERGE_HEAD', {cwd: gitRoot, encoding: 'utf-8'})
                .trim().split('\n').filter(Boolean)
        )
    } catch (e) {
        return () => false
    }

    return file => !divergedFromMergeHead.has(path.relative(gitRoot, path.resolve(gitRoot, file)))
}

/**
 * @summary Resolve the repository root that owns a script, independent of the caller's cwd.
 * @param {String} fromDir Absolute directory to resolve from.
 * @returns {String|null} The absolute git root, or `null` when git cannot answer.
 */
export function resolveGitRoot(fromDir) {
    try {
        return execSync('git rev-parse --show-toplevel', {cwd: fromDir, encoding: 'utf-8'}).trim()
    } catch (e) {
        return null
    }
}
