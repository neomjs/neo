import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * Regression coverage for the release-note orphan, and for the release path's two blind spots.
 *
 * The staging-window lifecycle: `buildScripts/release/publish.mjs` REQUIRES a top-level
 * `resources/content/release-notes/v{version}.md` before the cut (pre-flight errors without it),
 * appends the atomic-hash line to it, creates the GitHub release from it, and removes it itself
 * afterwards; the content sync then buckets the published release into `chunk-N/` with frontmatter.
 * A top-level note for a not-yet-published version is therefore the DESIGNED staging state —
 * authored and iterated on dev ahead of the cut. The defect class is narrower: a top-level copy
 * that lingers ALONGSIDE its chunked mirror after publish, double-listing the version in the
 * release index and the sitemap.
 *
 * ---
 *
 * **Restored from `c623b2f63c^`, and NOT verbatim — the two drifted arms are named, not trimmed.**
 *
 * This file was deleted by `c623b2f63c` at
 * `test/playwright/unit/ai/buildScripts/release/PublishReleaseNoteOrphan.spec.mjs`, as one of 804
 * unit specs swept on the `ai/` path prefix. Its subject, `buildScripts/release/publish.mjs`,
 * never left this repository — it is 281 lines at this head and is the operator-invoked release
 * entrypoint (§critical_gates 8). It is restored beside the surviving sibling tree rather than at its
 * old `unit/ai/**` path, because the `ai/` prefix is exactly what marked it as extracted substrate and
 * would re-arm the same deletion at the next boundary change.
 *
 * Four of the six deleted arms restore verbatim. Two asserted through
 * `ai/scripts/lifecycle/postReleaseSync.mjs`, which correctly departed with the extraction, and the
 * per-arm dispositions below were ruled before this restoration rather than decided inside it:
 *
 * - **The handoff arm is RE-AIMED, not dropped.** It asserted that `publish.mjs` names the package
 *   script `ai:post-release-sync` AND that the script resolves to a file on disk. That script is
 *   absent from `package.json` at this head — the handoff is now a printed runbook beat naming the
 *   Brain-side lifecycle, not a spawnable command, and that is the deliberate boundary the module's
 *   own docblock states ("this script imports and spawns nothing from the Brain"). The
 *   script-resolution half is therefore dead and is dropped. The ORDERING half is the surviving
 *   invariant and is kept: the handoff is printed, and it is the LAST beat — after the GitHub release
 *   and after the staging note's removal. Without it a refactor could drop the print and leave the
 *   content half of the release as terminal-only advice no durable surface reaches.
 *
 * - **The broad-stage arm keeps only its ENGINE half, and the Brain half is a custody transfer.**
 *   The deleted arm pinned its population per file across both repositories, deliberately, so that a
 *   count could not go stale at a boundary change. Post-severance only one of those two files is
 *   reachable from here, so the population is pinned to `publish.mjs` alone. The Brain-side stage in
 *   `ai/scripts/lifecycle/postReleaseSync.mjs` still exists, is still correctly ordered, and still has
 *   NO witness in the repository that owns it — that half is owed to `neomjs/neo-agent-brain`, whose
 *   queue it belongs to. It is named here so the transfer stays visible instead of reading as a
 *   silently shed assertion — a spec that quietly loses an assertion is indistinguishable from one
 *   trimmed to make the suite green, which is the failure this restoration exists to correct.
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

    /**
     * The double-listing witness: an orphaned top-level note reaches the reader through this index, so
     * the index is where the defect becomes visible.
     *
     * **This arm is repaired, and the repair is not split drift — it was vacuous when it was deleted.**
     * As written it selected `node.isLeaf`, and `buildScripts/docs/index/release.mjs:138` deliberately
     * omits that field on release nodes (`// release.isLeaf = true; // Default value in model is true`),
     * so the tree's leaves carry `undefined` and only the major-version group nodes carry `false`. The
     * filter matched **zero** nodes here and also at `c623b2f63c~1` — measured in both trees — which
     * means the arm has never been able to fail. A selector that matches nothing reads exactly like a
     * selector that found nothing wrong.
     *
     * A release leaf is identified by the property that actually distinguishes it: it points at a
     * release-note file. The population is asserted non-empty first, so the arm cannot quietly return
     * to being vacuous if the generator's shape changes again, and `path` is checked alongside `id`
     * because two nodes carrying distinct ids for the same file is the same double-listing defect.
     */
    test('the release index lists each release leaf exactly once', () => {
        const
            releases  = JSON.parse(fs.readFileSync(path.join(root, 'apps/portal/resources/data/releases.json'), 'utf8')),
            leaves    = releases.filter(node => node.path),
            leafIds   = leaves.map(node => node.id),
            leafPaths = leaves.map(node => node.path),
            dupeIds   = leafIds.filter((id, index) => leafIds.indexOf(id) !== index),
            dupePaths = leafPaths.filter((item, index) => leafPaths.indexOf(item) !== index);

        expect(leaves.length, 'the release index must carry release leaves for this arm to mean anything')
            .toBeGreaterThan(0);

        expect(dupeIds).toEqual([]);
        expect(dupePaths).toEqual([]);
    });

    /**
     * The two-command release protocol's ordered-handoff witness, re-aimed at the post-severance
     * subject. The engine half (`publish.mjs`) must END by naming the Brain-side content lifecycle,
     * AFTER the GitHub release and AFTER the staging note's removal.
     *
     * The anchor is the runtime print, not the module docblock — matching documentation instead of the
     * print is how the deleted arm once shipped green while asserting nothing, and the fix then was to
     * take the LAST occurrence. That trick is kept: `lastIndexOf` means a refactor that deletes the
     * print cannot be rescued by a surviving prose mention of the same beat elsewhere in the file.
     *
     * The deleted arm additionally required `package.json` to carry `ai:post-release-sync` resolving to
     * `ai/scripts/lifecycle/postReleaseSync.mjs`. Both departed with the extraction and that half is
     * dropped (see the file header) — the handoff is a runbook beat now, deliberately not a spawn.
     */
    test('the engine half hands off to the Brain-side lifecycle, ordered after release and note removal', () => {
        const
            src        = fs.readFileSync(path.join(root, 'buildScripts/release/publish.mjs'), 'utf8'),
            handoffIdx = src.lastIndexOf('Next runbook step'),
            releaseIdx = src.indexOf('gh release create'),
            cleanupIdx = src.indexOf('fs.removeSync(releaseNotePath)');

        // The handoff is printed, and it is the LAST beat: after the release, after the cleanup.
        expect(handoffIdx, 'publish.mjs must print the post-release handoff').toBeGreaterThan(-1);
        expect(handoffIdx).toBeGreaterThan(releaseIdx);
        expect(handoffIdx).toBeGreaterThan(cleanupIdx);

        // A beat that does not say WHERE the next step runs is not a handoff. The print must name the
        // Brain-side half, so an Engine-only checkout cannot mistake the release for complete.
        expect(src.slice(handoffIdx), 'the handoff must name the Brain-side checkout')
            .toMatch(/neo-agent-brain/);
    });

    /**
     * Every commit on the release path uses `--no-verify` by design, so no git hook can see it and the
     * `lint-staged` logical-identity guard is structurally blind to it. The release-artifact commit
     * stages broadly with `git add .`, which means it can carry an archived-artifact collision onto
     * `dev` — and a collision stalls Knowledge Base ingestion for the whole corpus, not just the
     * colliding artifacts.
     *
     * This is a source-ORDERING claim, not a behavioural one, which is what makes a source assertion
     * the right instrument: the guard must appear immediately BEFORE the broad stage. Proving it
     * behaviourally would require cutting a release.
     *
     * The population is pinned per file rather than counted in total, deliberately: a mere total would
     * let a second broad stage arrive in an unguarded file and still pass. The deleted arm pinned two
     * files; the second, `ai/scripts/lifecycle/postReleaseSync.mjs`, left with the extraction and is
     * unreachable from here. Its stage is the higher-risk half — it sits deliberately after a `catch`
     * that continues when `runFullSync()` has thrown, i.e. it fires exactly when the integrity verdict
     * already refused the corpus — and it has no witness in the repository that now owns it. That is a
     * custody transfer owed to `neomjs/neo-agent-brain`, not a retired assertion.
     */
    test('every broad-staging release commit is preceded by the logical-identity guard', () => {
        const releaseCommitFiles = [
            {file: 'buildScripts/release/publish.mjs', expectedBroadStages: 1}
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
