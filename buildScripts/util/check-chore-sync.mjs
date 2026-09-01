import { execSync }      from 'node:child_process';
import process           from 'node:process';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInheritedFromMergeFilter } from './mergeInheritance.mjs';

// Anchor git checks to the repository that owns this hook script, not the caller's cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// Get absolute git repository root to prevent cross-checkout branch diagnostics.
let gitRoot;
try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: scriptRoot, encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
    process.exit(1);
}

const normalizedGitRoot    = path.resolve(gitRoot);
const normalizedScriptRoot = path.resolve(scriptRoot);

if (normalizedScriptRoot !== normalizedGitRoot) {
    console.error(`\x1b[31mError: Script repository root mismatch.\x1b[0m`);
    console.error(`check-chore-sync.mjs is located under '${normalizedScriptRoot}', but the git repository root is '${normalizedGitRoot}'.`);
    console.error(`This prevents cross-checkout branch diagnostics and ensures hook ownership alignment.`);
    process.exit(1);
}

// Get current branch
let branch;
try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot, encoding: 'utf-8' }).trim();
} catch (e) {
    console.error('Error getting git branch');
    process.exit(1);
}

// Allowed branches for chore-sync data
const ALLOWED_PREFIXES = ['chore/sync-', 'agent/sync-'];
const isDataBranch     = ALLOWED_PREFIXES.some(prefix => branch.startsWith(prefix));

if (isDataBranch) {
    process.exit(0);
}

// Get staged files
let stagedFiles = [];
try {
    const output = execSync('git diff --cached --name-only', { cwd: gitRoot, encoding: 'utf-8' }).trim();
    if (output) {
        stagedFiles = output.split('\n');
    }
} catch (e) {
    console.error('Error getting staged files');
    process.exit(1);
}

// The corpus families that live under `resources/content/` in the FLAT layout. `release-notes` is
// sourced separately from the three conversation facets and is listed here for its flat home only.
const flatSyncFamilies = ['issues', 'discussions', 'pulls', 'release-notes'];

// The families that gain a repository segment. DELIBERATELY NOT the flat list: only the three
// emitted conversation facets move, and whether `release-notes` ever follows them is undecided.
// Sharing one list across both grammars would silently answer that question here — accepting
// `resources/content/<slug>/release-notes/…` as generated content on the strength of a variable
// name. Two grammars whose accepted families differ get two lists, even when one is a subset.
const qualifiedSyncFamilies = ['issues', 'discussions', 'pulls'];

// Generated GitHub workflow content that should not leak into feature commits.
//
// TWO shapes are live at once, deliberately. Emitted facets carry a repository segment —
// `resources/content/<repoSlug>/<family>/` — while `archive/` stays a sibling root and keeps its
// flat home, so neither shape is transitional and both must match.
//
// Recognising both is what makes this guard independent of when the emitter changes shape.
// `isGeneratedSyncFile` is consumed on two arms that fail in OPPOSITE directions on an unrecognised
// shape, and only one of them is armed today:
//
//   - the LEAKAGE arm (`isGeneratedSyncFile(f) && !isInherited(f)`) runs on every ordinary commit
//     through `.husky/pre-commit`. Its filter goes EMPTY and the check PASSES — a guard that stops
//     flagging rather than one that errors, which is why it is the arm worth landing early;
//   - the NEO_SYNC_AUTOCOMMIT arm inverts the same predicate, so the same unrecognised shape makes
//     it reject a sync-only staging as non-sync. It is DORMANT: nothing in either repository sets
//     the variable, and the Data Sync pipeline commits with `--no-verify`, so it does not reach
//     this guard at all. It is kept correct because a bypass that is wrong while unused is wrong
//     the day something uses it — not because it fires today.
const generatedSyncPaths = [
    ...flatSyncFamilies.map(family => `resources/content/${family}/`),
    'resources/content/archive/',
    'resources/content/_index.json',
    'resources/content/.sync-metadata.json'
];

/**
 * @summary Recognises a repository-qualified corpus facet — `resources/content/<repoSlug>/<family>/…`.
 *
 * Matched STRUCTURALLY rather than by enumerating slugs, so a second organisation repository does
 * not become another place to remember. The family segment is what makes a path generated content:
 * `resources/content/concepts/…` carries no family segment and is correctly not matched, which
 * keeps hand-authored material under the same root outside this guard's reach.
 *
 * Reads `qualifiedSyncFamilies`, NOT the flat list. A qualified `release-notes` path is left
 * unrecognised on purpose: that family's home is undecided, and classifying it as generated would
 * settle the question in a predicate rather than where it belongs. Unrecognised fails in the safe
 * direction for an undecided shape — the autocommit arm rejects it loudly, and the leakage arm
 * declines to bless a path nothing is supposed to emit.
 * @param {String} file Repository-relative staged path.
 * @returns {Boolean}
 */
const isRepoQualifiedSyncFile = file => {
    const segments = file.split('/');

    return segments.length > 4 && segments[0] === 'resources' && segments[1] === 'content' &&
        qualifiedSyncFamilies.includes(segments[3])
};

const isGeneratedSyncFile = file => isRepoQualifiedSyncFile(file) || generatedSyncPaths.some(item =>
    item.endsWith('/') ? file.startsWith(item) : file === item
);

// If NEO_SYNC_AUTOCOMMIT is set, we must strictly enforce that ONLY data files are staged.
// This prevents auto-commits from leaking manually staged source code files into sync commits.
if (process.env.NEO_SYNC_AUTOCOMMIT === '1') {
    const nonSyncFiles = stagedFiles.filter(file => !isGeneratedSyncFile(file));
    if (nonSyncFiles.length > 0) {
        console.error(`\x1b[31mError: NEO_SYNC_AUTOCOMMIT bypass rejected.\x1b[0m`);
        console.error(`Automated sync commits must ONLY contain data files. The following non-sync files are staged:`);
        nonSyncFiles.forEach(f => console.error(`  - ${f}`));
        process.exit(1);
    }
    process.exit(0);
}

// A merge stages EVERY file it brings in, including the sync pipeline's commits already living on
// the branch being merged. Those files are not authored here, so the check below must not read them
// as leakage: this guard exists to stop a feature branch from AUTHORING sync data, and inheriting a
// commit is not authoring.
//
// Without this allowance `git merge origin/dev` is impossible on any branch older than the last
// `chore(data)` commit (dev takes roughly two per six hours), and the only ways through are worse
// than the block: `--no-verify` also skips the AiConfig test-mutation lint, and unstaging the files
// makes the merge commit REVERT dev's sync data once it lands.
//
// The allowance is NOT "a merge is in progress, stand down" — that would wave through a sync file
// hand-edited during a conflict resolution, which is authoring wearing a merge's clothes. A staged
// sync file is inherited only if the index still matches what the merge brought in; anything the
// working tree changed on top of MERGE_HEAD is authored here and stays a violation.
//
// Deliberately evaluated AFTER the NEO_SYNC_AUTOCOMMIT arm: that arm guards the pipeline's own
// commits, which are never merges, and must keep failing on mixed content regardless.
// Shared with `check-whitespace.mjs`: both guards read the staged set, so both inherit the same
// merge problem, and two copies of the rule would drift — the copy that drifts being the one that
// silently fails open on the content it exists to police. `createInheritedFromMergeFilter` fails
// closed outside a merge, so an ordinary commit is checked in full.
const isInherited = createInheritedFromMergeFilter(gitRoot);

const violatingFiles = stagedFiles.filter(file =>
    isGeneratedSyncFile(file) && !isInherited(file)
);

// Allow explicit override via --force-data or bypassing hooks
// Git provides --no-verify by default, which is the standard way to bypass pre-commit hooks
if (violatingFiles.length > 0) {
    const allowedList = ALLOWED_PREFIXES.map(p => `'${p}*'`).join(' or ');
    console.error(`\x1b[31mError: Sync-data leakage detected.\x1b[0m`);
    console.error(`Branch '${branch}' (in root '${normalizedGitRoot}') is not a designated data-sync branch (e.g., ${allowedList}).`);
    console.error(`The following data files are staged for commit:`);
    violatingFiles.forEach(f => console.error(`  - ${f}`));
    console.error(`\nIf you must commit these files, either:`);
    console.error(`  1. Switch to a branch prefixed with ${allowedList}`);
    console.error(`  2. Unstage the files using 'git restore --staged <file>'`);
    console.error(`  3. Use 'git commit --no-verify' to bypass this check entirely.`);
    process.exit(1);
}

process.exit(0);
