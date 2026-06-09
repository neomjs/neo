import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import fg             from 'fast-glob';

import {
    assertStableReleaseNoteGithubLinks,
    getDisallowedReleaseNoteGithubLinks,
    getReleaseNotePriority
} from '../../../../../../../buildScripts/docs/seo/generate.mjs';

test.describe('docs SEO generator release-note link guard', () => {
    test('getDisallowedReleaseNoteGithubLinks returns only mutable or release-ref Neo source links', () => {
        const links = getDisallowedReleaseNoteGithubLinks([
            'https://github.com/neomjs/neo/blob/dev/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/neo/tree/dev/.agents/skills',
            'https://github.com/neomjs/neo/blob/07b6933fd0f1afa022146c5dee3d3becac582ff7/src/component/MagicMoveText.mjs',
            'https://github.com/neomjs/neo/blob/main/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/neo/tree/v13.0.0/.agents/skills',
            'https://github.com/neomjs/pages/blob/v13.0.0/buildScripts/enhanceSeo.mjs',
            'https://github.com/neomjs/neo/blob/v13.0.0/src/Neo.mjs)'
        ].join('\n'));

        expect(links).toEqual([
            'https://github.com/neomjs/neo/blob/main/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/neo/tree/v13.0.0/.agents/skills',
            'https://github.com/neomjs/neo/blob/v13.0.0/src/Neo.mjs'
        ]);
    });

    test('assertStableReleaseNoteGithubLinks fails with the release-note path and disallowed Neo source link', () => {
        expect(() => assertStableReleaseNoteGithubLinks({
            filePath: path.join(process.cwd(), 'resources/content/release-notes/v0.0.0.md'),
            content : 'See https://github.com/neomjs/neo/blob/main/buildScripts/enhanceSeo.mjs'
        })).toThrow(/resources\/content\/release-notes\/v0\.0\.0\.md[\s\S]*blob\/main\/buildScripts\/enhanceSeo\.mjs/);
    });

    test('active release notes use dev or immutable commit refs for Neo source links', async () => {
        const files = await fg('resources/content/release-notes/**/*.md', {
            cwd   : process.cwd(),
            ignore: ['resources/content/archive/**']
        });

        const violations = [];

        for (const file of files) {
            const content = await fs.readFile(path.resolve(process.cwd(), file), 'utf-8');
            const links   = getDisallowedReleaseNoteGithubLinks(content);

            if (links.length > 0) {
                violations.push({file, links});
            }
        }

        expect(violations).toEqual([]);
    });
});

test.describe('docs SEO generator release-note recency priority (#12753)', () => {
    // Anchored on the newest release-note major = 13 (matches @tobiu's confirmed mapping).
    test('current + most-recent major stay at 0.9', () => {
        expect(getReleaseNotePriority('13.0.0', 13)).toBe(0.9);
        expect(getReleaseNotePriority('12.1.0', 13)).toBe(0.9);
    });

    test('older majors decay below the evergreen 0.7+ tier', () => {
        expect(getReleaseNotePriority('11.0.0', 13)).toBe(0.7);
        expect(getReleaseNotePriority('10.5.0', 13)).toBe(0.6);
        expect(getReleaseNotePriority('9.0.0',  13)).toBe(0.5);
        expect(getReleaseNotePriority('8.1.2',  13)).toBe(0.4);
        expect(getReleaseNotePriority('7.0.0',  13)).toBe(0.4); // delta 6 -> ancient floor
    });

    test('unparseable version or unknown anchor falls back to DEFAULT_PRIORITY (0.5)', () => {
        expect(getReleaseNotePriority('not-a-version', 13)).toBe(0.5);
        expect(getReleaseNotePriority('12.1.0', null)).toBe(0.5);
    });

    test('self-maintaining: re-anchoring on a newer major shifts the tiers down', () => {
        // Once v14 ships, v14/v13 stay 0.9 and v12 decays to 0.7 — no code change needed.
        expect(getReleaseNotePriority('14.0.0', 14)).toBe(0.9);
        expect(getReleaseNotePriority('13.0.0', 14)).toBe(0.9);
        expect(getReleaseNotePriority('12.0.0', 14)).toBe(0.7);
    });
});
