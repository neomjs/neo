import {test, expect} from '@playwright/test';
import fs             from 'fs';
import path           from 'path';

/**
 * Regression coverage for the release-note orphan.
 *
 * The release pipeline authors a top-level `resources/content/release-notes/v{version}.md` as the
 * GitHub-release body; the content sync later buckets the published release into `chunk-N/` with
 * frontmatter. Without an explicit cleanup the top-level staging copy lingers as a duplicate of the
 * chunked record, double-listing the version in the release index and the sitemap.
 */

const root = process.cwd();

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

    test('no top-level release-notes/v*.md orphan exists alongside the chunk-N buckets', () => {
        const
            dir           = path.join(root, 'resources/content/release-notes'),
            entries       = fs.readdirSync(dir),
            topLevelNotes = entries.filter(entry => /^v.*\.md$/.test(entry));

        expect(topLevelNotes).toEqual([]);
    });

    test('the release index lists each release leaf exactly once', () => {
        const
            releases = JSON.parse(fs.readFileSync(path.join(root, 'apps/portal/resources/data/releases.json'), 'utf8')),
            leafIds  = releases.filter(node => node.isLeaf).map(node => node.id),
            dupes    = leafIds.filter((id, index) => leafIds.indexOf(id) !== index);

        expect(dupes).toEqual([]);
    });
});
