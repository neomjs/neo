import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import fg             from 'fast-glob';

import {
    assertStableReleaseNoteGithubLinks,
    getContentRoutes,
    getDisallowedReleaseNoteGithubLinks,
    getExistingSitemapLastmodMap,
    getReleaseNotePriority
} from '../../../../../../buildScripts/docs/seo/generate.mjs';

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
            filePath: path.join(process.cwd(), '.github/RELEASE_NOTES/v0.0.0.md'),
            content : 'See https://github.com/neomjs/neo/blob/main/buildScripts/enhanceSeo.mjs'
        })).toThrow(/\.github\/RELEASE_NOTES\/v0\.0\.0\.md[\s\S]*blob\/main\/buildScripts\/enhanceSeo\.mjs/);
    });

    test('active release notes use dev or immutable commit refs for Neo source links', async () => {
        const files = await fg('.github/RELEASE_NOTES/*.md', {cwd: process.cwd()});

        expect(files.length).toBeGreaterThan(0);

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

test.describe('docs SEO generator existing-sitemap lastmod map (#19155)', () => {
    let dir;

    const url     = (loc, lastmod) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
          sitemap = entries => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${entries.join('\n')}\n</urlset>\n`,
          write   = async content => {
              const file = path.join(dir, 'sitemap.xml');
              await fs.writeFile(file, content);
              return file
          };

    test.beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-sitemap-lastmod-'))
    });

    test.afterEach(async () => {
        await fs.remove(dir)
    });

    test('an entry without lastmod neither takes the next entry\'s date nor swallows that entry', async () => {
        const map = await getExistingSitemapLastmodMap(await write(sitemap([
            url('https://neomjs.com/a'),
            url('https://neomjs.com/b', '2026-09-01')
        ])));

        expect(Object.fromEntries(map)).toEqual({'https://neomjs.com/b': '2026-09-01'})
    });

    test('dated entries map loc to lastmod, whichever tag comes first', async () => {
        const map = await getExistingSitemapLastmodMap(await write(sitemap([
            url('https://neomjs.com/a', '2026-08-01'),
            '<url><lastmod>2026-08-02</lastmod><loc>https://neomjs.com/b</loc></url>'
        ])));

        expect(Object.fromEntries(map)).toEqual({
            'https://neomjs.com/a': '2026-08-01',
            'https://neomjs.com/b': '2026-08-02'
        })
    });

    test('a sitemap without any lastmod maps nothing', async () => {
        const entries = Array.from({length: 2000}, (_, i) => url(`https://neomjs.com/news/tickets/${i}`));

        expect((await getExistingSitemapLastmodMap(await write(sitemap(entries)))).size).toBe(0)
    });

    test('a missing sitemap maps nothing', async () => {
        expect((await getExistingSitemapLastmodMap(path.join(dir, 'absent.xml'))).size).toBe(0)
    });
});

test.describe('docs SEO generator content roots (#19166)', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-roots-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.outputFile(path.join(corpusRoot, 'issues/chunk-1/issue-7.md'), '# Active');
        await fs.outputFile(path.join(corpusRoot, 'archive/issues/v1.0.0/chunk-1/issue-3.md'), '# Archived');
        await fs.outputFile(path.join(corpusRoot, 'pulls/chunk-1/pr-9.md'), '# Pull');
        await fs.outputFile(path.join(corpusRoot, 'discussions/chunk-1/discussion-5.md'), '# Discussion');
        await fs.outputFile(path.join(releaseNotesRoot, 'v1.2.3.md'), '# Release')
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    test('routes come from the declared corpus and release-notes roots', async () => {
        const routes = await getContentRoutes({corpusRoot, releaseNotesRoot});

        expect(routes).toEqual(expect.arrayContaining([
            '/#/news/discussions/5',
            '/#/news/pulls/9',
            '/#/news/releases/1.2.3',
            '/#/news/tickets/3',
            '/#/news/tickets/7'
        ]))
    });

    test('a missing root fails naming its flag', async () => {
        await expect(getContentRoutes({releaseNotesRoot})).rejects.toThrow('--corpus-root');
        await expect(getContentRoutes({corpusRoot})).rejects.toThrow('--release-notes')
    })
});
