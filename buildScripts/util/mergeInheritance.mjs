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
        //
        // `-z` is load-bearing, not hygiene. Without it git C-QUOTES any path carrying a tab, a
        // space, a quote or a non-ASCII byte (`"a\tb.md"`), and a newline in a filename would even
        // split one path into two. Those mangled entries never match the lookup below, so the file
        // reads as NOT diverged — i.e. inherited — and the guard silently SKIPS the very paths that
        // are hardest to eyeball. That is a fail-OPEN in a guard, which is worse than the block it
        // replaces. `-z` emits raw NUL-terminated paths with no quoting at all.
        divergedFromMergeHead = new Set(
            execSync('git diff --cached --name-only -z MERGE_HEAD', {cwd: gitRoot, encoding: 'utf-8'})
                .split('\0').filter(Boolean)
        )
    } catch (e) {
        return () => false
    }

    // git always reports `/`; `path.relative` yields the PLATFORM separator, so on Windows every
    // candidate would arrive as `a\b.md`, match nothing, and read as authored — blocking every merge
    // on that platform. Normalising the candidate (never the git output) keeps the comparison in
    // git's own vocabulary.
    return file => !divergedFromMergeHead.has(
        path.relative(gitRoot, path.resolve(gitRoot, file)).split(path.sep).join('/')
    )
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
