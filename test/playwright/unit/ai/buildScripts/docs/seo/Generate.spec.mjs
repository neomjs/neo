import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import fg             from 'fast-glob';

import {
    assertStableReleaseNoteGithubLinks,
    getMutableReleaseNoteGithubLinks
} from '../../../../../../../buildScripts/docs/seo/generate.mjs';

test.describe('docs SEO generator release-note link guard', () => {
    test('getMutableReleaseNoteGithubLinks returns only mutable dev/main branch links', () => {
        const links = getMutableReleaseNoteGithubLinks([
            'https://github.com/neomjs/neo/blob/dev/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/pages/blob/main/buildScripts/enhanceSeo.mjs',
            'https://github.com/neomjs/neo/blob/abc123/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/pages/blob/v13.0.0/buildScripts/enhanceSeo.mjs',
            'https://github.com/neomjs/neo/blob/dev/src/Neo.mjs)'
        ].join('\n'));

        expect(links).toEqual([
            'https://github.com/neomjs/neo/blob/dev/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/pages/blob/main/buildScripts/enhanceSeo.mjs',
            'https://github.com/neomjs/neo/blob/dev/src/Neo.mjs'
        ]);
    });

    test('assertStableReleaseNoteGithubLinks fails with the release-note path and mutable link', () => {
        expect(() => assertStableReleaseNoteGithubLinks({
            filePath: path.join(process.cwd(), 'resources/content/release-notes/v0.0.0.md'),
            content : 'See https://github.com/neomjs/pages/blob/main/buildScripts/enhanceSeo.mjs'
        })).toThrow(/resources\/content\/release-notes\/v0\.0\.0\.md[\s\S]*blob\/main\/buildScripts\/enhanceSeo\.mjs/);
    });

    test('active release notes do not publish mutable GitHub branch links', async () => {
        const files = await fg('resources/content/release-notes/**/*.md', {
            cwd   : process.cwd(),
            ignore: ['resources/content/archive/**']
        });

        const violations = [];

        for (const file of files) {
            const content = await fs.readFile(path.resolve(process.cwd(), file), 'utf-8');
            const links   = getMutableReleaseNoteGithubLinks(content);

            if (links.length > 0) {
                violations.push({file, links});
            }
        }

        expect(violations).toEqual([]);
    });
});
