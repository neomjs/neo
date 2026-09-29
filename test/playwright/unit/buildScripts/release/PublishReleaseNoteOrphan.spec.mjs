import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';

/**
 * Regression coverage for the release note's lifecycle in `buildScripts/release/publish.mjs`.
 *
 * The note is authored at `.github/RELEASE_NOTES/v{version}.md` and that file is the archive:
 * `publish.mjs` requires it before the cut, appends the atomic-hash line, creates the GitHub release
 * from it and keeps it. Nothing re-materializes it elsewhere, so a note can no longer be orphaned
 * beside a synced copy. These arms keep it that way.
 */

const
    root     = process.cwd(),
    notesDir = path.join(root, '.github/RELEASE_NOTES'),
    publish  = () => fs.readFileSync(path.join(root, 'buildScripts/release/publish.mjs'), 'utf8');

test.describe('Release-note lifecycle', () => {
    test('publish.mjs requires the note at its authored path and keeps it after the release', () => {
        const src = publish();

        expect(src).toContain('.github/RELEASE_NOTES/v${newVersion}.md');
        expect(src).not.toContain('resources/content');
        expect(src).not.toMatch(/fs\.remove(Sync)?\(releaseNotePath\)/);
    });

    test('every note sits flat in .github/RELEASE_NOTES, one file per version', () => {
        const entries = fs.readdirSync(notesDir, {withFileTypes: true});

        expect(entries.length).toBeGreaterThan(0);
        expect(entries.filter(entry => !entry.isFile()).map(entry => entry.name)).toEqual([]);
        expect(entries.filter(entry => !/^v\d+\.\d+\.\d+(-[\w.]+)?\.md$/.test(entry.name)).map(entry => entry.name)).toEqual([]);
    });

    /**
     * A release leaf is identified by pointing at a note file; `release.mjs` omits `isLeaf` on release
     * nodes, so selecting on it matches nothing. The population is asserted non-empty first, so the arm
     * cannot pass vacuously.
     */
    test('the release index lists each release leaf exactly once', () => {
        const
            releases  = JSON.parse(fs.readFileSync(path.join(root, 'apps/portal/resources/data/releases.json'), 'utf8')),
            leaves    = releases.filter(node => node.path),
            leafIds   = leaves.map(node => node.id),
            leafPaths = leaves.map(node => node.path);

        expect(leaves.length, 'the release index must carry release leaves for this arm to mean anything')
            .toBeGreaterThan(0);

        expect(leafIds.filter((id, index) => leafIds.indexOf(id) !== index)).toEqual([]);
        expect(leafPaths.filter((item, index) => leafPaths.indexOf(item) !== index)).toEqual([]);
    });

    /**
     * The handoff print is the last beat, after the GitHub release, and names the Brain-side checkout.
     * The window is bounded to the print statement, so a `neo-agent-brain` mention elsewhere in the
     * file cannot stand in for it.
     */
    test('the engine half hands off to the Brain-side lifecycle as its last beat', () => {
        const
            src         = publish(),
            lines       = src.split('\n'),
            handoffIdx  = src.lastIndexOf('Next runbook step'),
            releaseIdx  = src.indexOf('gh release create'),
            handoffLine = lines.findLastIndex(line => line.includes('Next runbook step')),
            printEnd    = lines.findIndex((line, index) =>
                index > handoffLine && !/^\s*(console\.log\(|['"`)])/.test(line)),
            handoffPrint = lines.slice(handoffLine, printEnd === -1 ? lines.length : printEnd).join('\n');

        expect(handoffIdx, 'publish.mjs must print the post-release handoff').toBeGreaterThan(-1);
        expect(handoffIdx).toBeGreaterThan(releaseIdx);
        expect(handoffPrint, 'the handoff print itself must name the Brain-side checkout')
            .toMatch(/neo-agent-brain/);
    });
});
