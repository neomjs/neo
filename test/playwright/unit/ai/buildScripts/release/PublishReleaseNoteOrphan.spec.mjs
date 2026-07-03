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
});
