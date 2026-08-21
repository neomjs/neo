import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

/**
 * Regression coverage for the release-note orphan.
 *
 * The staging-window lifecycle: `buildScripts/release/publish.mjs` REQUIRES a top-level
 * `resources/content/release-notes/v{version}.md` before the cut (pre-flight errors without it),
 * appends the atomic-hash line to it, creates the GitHub release from it, and removes it itself
 * afterwards; the content sync then buckets the published release into `chunk-N/` with frontmatter.
 * A top-level note for a not-yet-published version is therefore the DESIGNED staging state —
 * authored and iterated on dev ahead of the cut. The defect class is narrower: a top-level copy
 * that lingers ALONGSIDE its chunked mirror after publish, double-listing the version in the
 * release index and the sitemap.
 */

const root = process.cwd();

/**
 * @summary Returns top-level release-note files that duplicate an already-chunked (published) version.
 * @param {String} dir Release-notes directory containing chunk-N buckets.
 * @returns {String[]} Orphaned file names (post-publish duplicates only; staging files pass).
 */
function findOrphanedTopLevelNotes(dir) {
    const
        entries       = fs.readdirSync(dir),
        topLevelNotes = entries.filter(entry => /^v.*\.md$/.test(entry)),
        chunkDirs     = entries.filter(entry => /^chunk-\d+$/.test(entry)),
        mirrored      = new Set(chunkDirs.flatMap(chunk => fs.readdirSync(path.join(dir, chunk))));

    return topLevelNotes.filter(name => mirrored.has(name))
}

test.describe('Release-note orphan prevention', () => {
    test('publish.mjs deletes the top-level staging release note after the GitHub release is created', () => {
        const
            src        = fs.readFileSync(path.join(root, 'buildScripts/release/publish.mjs'), 'utf8'),
            releaseIdx = src.indexOf('gh release create'),
            cleanupIdx = src.indexOf('fs.removeSync(releaseNotePath)');

        expect(releaseIdx).toBeGreaterThan(-1);
        // The staging copy must be removed, and only AFTER the GitHub release has been created from it.
        expect(cleanupIdx).toBeGreaterThan(releaseIdx);
    });

    test('no top-level release-notes/v*.md lingers alongside its chunk-N mirror', () => {
        expect(findOrphanedTopLevelNotes(path.join(root, 'resources/content/release-notes'))).toEqual([]);
    });

    test('a pre-publish staging note passes; a post-publish duplicate is flagged', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-orphan-guard-'));

        try {
            fs.mkdirSync(path.join(tmp, 'chunk-1'));
            fs.writeFileSync(path.join(tmp, 'chunk-1', 'v99.0.0.md'), '# v99.0.0');

            // The designed staging state: a top-level note for a version with no chunk mirror yet.
            fs.writeFileSync(path.join(tmp, 'v99.1.0.md'), '# staging draft');
            expect(findOrphanedTopLevelNotes(tmp)).toEqual([]);

            // The defect class: a top-level copy of a version the sync already chunked.
            fs.writeFileSync(path.join(tmp, 'v99.0.0.md'), '# lingering duplicate');
            expect(findOrphanedTopLevelNotes(tmp)).toEqual(['v99.0.0.md']);
        } finally {
            fs.rmSync(tmp, {recursive: true, force: true});
        }
    });

    test('the release index lists each release leaf exactly once', () => {
        const
            releases = JSON.parse(fs.readFileSync(path.join(root, 'apps/portal/resources/data/releases.json'), 'utf8')),
            leafIds  = releases.filter(node => node.isLeaf).map(node => node.id),
            dupes    = leafIds.filter((id, index) => leafIds.indexOf(id) !== index);

        expect(dupes).toEqual([]);
    });

    /**
     * The two-command release protocol's ordered-handoff witness. The engine half (`publish.mjs`)
     * must end by naming the Brain half's package script, AFTER the GitHub release and the staging
     * note's removal — and that script must actually resolve to the lifecycle entrypoint on disk.
     * Without this arm, a refactor could silently drop the print or rename the script, leaving the
     * content half as terminal-only advice that no durable surface reaches.
     */
    test('the engine half hands off to a reachable package script, ordered after release and note removal', () => {
        const
            src        = fs.readFileSync(path.join(root, 'buildScripts/release/publish.mjs'), 'utf8'),
            pkg        = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
            // LAST occurrence, deliberately: the module docblock also names the command (first hit
            // ~byte 1200), and matching documentation instead of the runtime print is how this arm
            // shipped green while asserting nothing — CI caught it. If a refactor deletes the print,
            // lastIndexOf falls back to the docblock mention and the order assertions below fail.
            handoffIdx = src.lastIndexOf('npm run ai:post-release-sync'),
            releaseIdx = src.indexOf('gh release create'),
            cleanupIdx = src.indexOf('fs.removeSync(releaseNotePath)'),
            script     = pkg.scripts['ai:post-release-sync'];

        // The handoff is printed, and it is the LAST beat: after the release, after the cleanup.
        expect(handoffIdx, 'publish.mjs must print the post-release handoff').toBeGreaterThan(-1);
        expect(handoffIdx).toBeGreaterThan(releaseIdx);
        expect(handoffIdx).toBeGreaterThan(cleanupIdx);

        // The named script exists and resolves to a real lifecycle entrypoint.
        expect(script, 'package.json must carry ai:post-release-sync').toBeTruthy();

        const target = script.replace(/^node\s+/, '').replace(/^\.\//, '');

        expect(target).toBe('ai/scripts/lifecycle/postReleaseSync.mjs');
        expect(fs.existsSync(path.join(root, target)), `${target} must exist`).toBe(true);
    });

    /**
     * Every commit on the release path uses `--no-verify` by design, so no git hook can see it and
     * the `lint-staged` logical-identity guard is structurally blind to it. Two release-path commits
     * stage broadly with `git add .`, which means either can carry an archived-artifact collision onto
     * `dev` — and the archive one runs inside a `catch` that deliberately continues after
     * `runFullSync()` throws, i.e. exactly when the integrity verdict measured the corpus as unclean.
     *
     * The two broad stages live in two files since the engine↔Brain severance: the release-artifact
     * commit stays in `buildScripts/release/publish.mjs` (engine, steps 1–5), and the archive commit
     * moved to `ai/scripts/lifecycle/postReleaseSync.mjs` with the sync machinery it commits for.
     * The population is pinned per file — a count over one file went stale the day the split landed,
     * and a mere total would let both stages migrate into one unguarded file and still pass.
     *
     * This is a source-ORDERING claim, not a behavioural one, which is what makes a source assertion
     * the right instrument: the guard must appear BEFORE each broad stage. Running the real publisher
     * to prove it would require cutting a release.
     */
    test('every broad-staging release commit is preceded by the logical-identity guard', () => {
        const releaseCommitFiles = [
            {file: 'buildScripts/release/publish.mjs',          expectedBroadStages: 1},
            {file: 'ai/scripts/lifecycle/postReleaseSync.mjs',  expectedBroadStages: 1}
        ];

        for (const {file, expectedBroadStages} of releaseCommitFiles) {
            const
                source = fs.readFileSync(path.join(root, file), 'utf8'),
                lines  = source.split('\n'),
                // `git add .` is the broad stage; `git add <path>` (the release note) cannot carry archive
                // content and is deliberately NOT required to carry the guard.
                broadStageLines = lines
                    .map((line, index) => ({line, index}))
                    .filter(entry => /runCommand\('git add \.'/.test(entry.line));

            expect(broadStageLines.length, `${file}: expected exactly ${expectedBroadStages} broad stage(s)`)
                .toBe(expectedBroadStages);

            for (const {index} of broadStageLines) {
                // The guard must be the immediately-preceding executable statement, so a later edit cannot
                // slip a stage in between and still pass.
                const preceding = lines
                    .slice(0, index)
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('//'))
                    .pop();

                expect(preceding, `${file}: broad stage at line ${index + 1} is unguarded`)
                    .toMatch(/assertNoArchiveLogicalIdentityCollisions\(/);
            }

            // And the guard must actually consult the shared predicate rather than reimplementing it,
            // so the release path and the sync path cannot disagree about what a collision is.
            expect(source, `${file}: guard must import the shared predicate`)
                .toMatch(/import \{findLogicalIdentityCollisions\}/);
            expect(source, `${file}: guard must invoke the shared predicate`)
                .toMatch(/findLogicalIdentityCollisions\(\{/)
        }
    })
});
