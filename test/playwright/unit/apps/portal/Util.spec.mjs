import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalRepoLinksTest'
    },
    // The Portal's values: the views read a file's repository path off its fetch path
    neoConfig: {
        basePath            : '../../',
        releaseNotesBasePath: '.github/RELEASE_NOTES/'
    }
});

import {test, expect}                      from '@playwright/test';
import Neo                                 from '../../../../../src/Neo.mjs';
import * as core                           from '../../../../../src/core/_export.mjs';
import ContentComponent                    from '../../../../../src/app/content/Component.mjs';
import BlogComponent                       from '../../../../../apps/portal/view/news/blog/Component.mjs';
import LearnComponent                      from '../../../../../apps/portal/view/learn/Component.mjs';
import ReleaseComponent                    from '../../../../../apps/portal/view/news/release/Component.mjs';
import TimelineComponent                   from '../../../../../apps/portal/view/content/Component.mjs';
import {getSearchParams, rewriteRepoLinks} from '../../../../../apps/portal/Util.mjs';

test.describe('getSearchParams — Portal Learning deck selection', () => {
    test('campaign parameters parse without overriding the default deck', () => {
        const params = getSearchParams('?utm_source&utm_content=part=a%26b%3D%22release%22&utm_campaign=v14+launch');

        expect(params).toEqual({
            utm_source  : '',
            utm_content : 'part=a&b="release"',
            utm_campaign: 'v14 launch'
        });
        expect(params.deck).toBeUndefined()
    });

    test('an explicit deck takes the last value when the key is repeated', () => {
        expect(getSearchParams('?deck=learnneo&deck=training%2Ddeck')).toEqual({deck: 'training-deck'})
    });

    test('a missing or empty query produces an empty object', () => {
        expect(getSearchParams(null)).toEqual({});
        expect(getSearchParams('')).toEqual({});
        expect(getSearchParams('?')).toEqual({})
    })
});

/**
 * `rewriteRepoLinks()` and the four Portal Markdown views that call it after the engine's
 * `Neo.app.content.Component#rewriteLinks`. The views are driven through their real prototypes,
 * the way `LinkPredicateParity.spec.mjs` drives the engine, so each test runs the engine pass and the Portal
 * pass in the order a render does.
 */
const
    brain = 'https://github.com/neomjs/neo-agent-brain/',
    neo   = 'https://github.com/neomjs/neo/',
    link  = href => `<a href="${href}">x</a>`,
    hrefs = html => [...html.matchAll(/href=["']([^"']*)["']/g)].map(match => match[1]),
    // [authored href, expected href] pairs, rewritten as one document
    expectHrefs = (pairs, filePath) => {
        expect(hrefs(rewriteRepoLinks(pairs.map(([href]) => link(href)).join(''), filePath)))
            .toEqual(pairs.map(([, expected]) => expected))
    };

test.describe('rewriteRepoLinks — text written on GitHub (issue, pull request and discussion bodies)', () => {
    test('a repository path opens on GitHub, in the repository that holds it today', () => {
        expectHrefs([
            ['ai/services/knowledge-base/VectorService.mjs#L595', `${brain}blob/dev/ai/services/knowledge-base/VectorService.mjs#L595`],
            ['ai/deploy/docker-compose.test.yml',                 `${brain}blob/dev/ai/deploy/docker-compose.test.yml`],
            ['src/manager/DragCoordinator.mjs',                   `${neo}blob/dev/src/manager/DragCoordinator.mjs`],
            ['./ROADMAP.md',                                      `${neo}blob/dev/ROADMAP.md`],
            ['src/manager/',                                      `${neo}tree/dev/src/manager`]
        ])
    });

    test("GitHub's own `../blob/<ref>/` link keeps its ref; a pinned commit still holds `ai/` in neo", () => {
        expectHrefs([
            ['../blob/dev/ai/services/knowledge-base/VectorService.mjs#L1450', `${brain}blob/dev/ai/services/knowledge-base/VectorService.mjs#L1450`],
            ['../tree/dev/src/main/',                                          `${neo}tree/dev/src/main/`],
            ['../blob/0a1b2c3d4e/ai/scripts/bridge-daemon.mjs#L754',           `${neo}blob/0a1b2c3d4e/ai/scripts/bridge-daemon.mjs#L754`]
        ])
    });

    test('a learn/ page opens its Portal route', () => {
        expectHrefs([
            ['learn/benefits/Introduction.md#the-problem', '#/learn/benefits/Introduction#the-problem'],
            ['learn/blog/role-based-navigation.md',        '#/news/blog/role-based-navigation']
        ])
    });

    test('a GitHub link opens in a new tab unless its author chose a target; a Portal route stays in the tab', () => {
        expect(rewriteRepoLinks('<a href="src/Neo.mjs">x</a>'))
            .toBe(`<a href="${neo}blob/dev/src/Neo.mjs" target="_blank">x</a>`);

        expect(rewriteRepoLinks(`<a target="_self" href='src/Neo.mjs'>x</a>`))
            .toBe(`<a target="_self" href='${neo}blob/dev/src/Neo.mjs'>x</a>`);

        expect(rewriteRepoLinks('<a href="learn/Glossary.md">x</a>')).toBe('<a href="#/learn/Glossary">x</a>')
    });

    test('a link that already navigates, or names nothing in the repository, stays as authored', () => {
        const html = '<a id="top"></a>' + [
            '#/news/tickets/21122',
            '#the-problem',
            '/apps/portal/',
            'https://example.com/docs/Foo.md',
            'HTTPS://example.com/x',
            'mailto:team@example.com',
            'JSONFirstUIs.md',             // no top-level entry of that name
            '../../agentos/NeuralLink.md', // climbs above the repository root
            '3000'
        ].map(link).join('');

        expect(rewriteRepoLinks(html)).toBe(html)
    });

    test('a `$` in the href is copied, not read as a replacement pattern', () => {
        expectHrefs([['src/a$&b$1.mjs', `${neo}blob/dev/src/a$&b$1.mjs`]])
    })
});

test.describe('rewriteRepoLinks — a repository Markdown file', () => {
    test("a relative path resolves against the file's folder", () => {
        expectHrefs([
            ['../../../src/main/render/DomApiRenderer.mjs', `${neo}blob/dev/src/main/render/DomApiRenderer.mjs`],
            ['../../../.github/AI_QUICK_START.md',          `${neo}blob/dev/.github/AI_QUICK_START.md`],
            ['../../tree.json',                             `${neo}blob/dev/learn/tree.json`],
            ['../../../../examples/index.html',             '../../../../examples/index.html']
        ], 'learn/guides/advanced/Rendering.md')
    });

    test("`../blob/<ref>/` in a file is a path, not GitHub's issue-page link", () => {
        expectHrefs([['../blob/dev/src/Neo.mjs', '../blob/dev/src/Neo.mjs']], 'learn/README.md')
    })
});

test.describe('Portal Markdown views — engine pass, then rewriteRepoLinks()', () => {
    test('tickets, pull requests and discussions resolve from the repository root', () => {
        const html = link('ai/services/knowledge-base/VectorService.mjs#L595') + link('../blob/dev/src/Neo.mjs') + link('learn/benefits/Introduction.md');

        expect(hrefs(TimelineComponent.prototype.rewriteLinks.call({contentRoute: null, record: {id: 'issue-17343'}}, html))).toEqual([
            `${brain}blob/dev/ai/services/knowledge-base/VectorService.mjs#L595`,
            `${neo}blob/dev/src/Neo.mjs`,
            '#/learn/benefits/Introduction'
        ])
    });

    test('a release note resolves against .github/RELEASE_NOTES/', () => {
        const context = {
            contentRoute  : null,
            getContentPath: ReleaseComponent.prototype.getContentPath,
            record        : {id: '13.4.0', path: 'v13.4.0.md'}
        };

        expect(hrefs(ReleaseComponent.prototype.rewriteLinks.call(context, link('../../src/Neo.mjs') + link('v14.0.0.md')))).toEqual([
            `${neo}blob/dev/src/Neo.mjs`,
            `${neo}blob/dev/.github/RELEASE_NOTES/v14.0.0.md`
        ])
    });

    test('a guide keeps its learn routes and opens a source file on GitHub', () => {
        const context = {
            contentRoute    : '#/learn/',
            getContentPath  : LearnComponent.prototype.getContentPath,
            getStateProvider: () => ({getData: () => Neo.config.basePath + 'learn/', getStore: () => null}),
            record          : {id: 'benefits/Introduction'},
            resolveContentId: ContentComponent.prototype.resolveContentId
        };

        const html = link('../agentos/NeuralLink.md') + link('../../src/Neo.mjs') + link('../../.github/AI_QUICK_START.md');

        expect(hrefs(LearnComponent.prototype.rewriteLinks.call(context, html))).toEqual([
            '#/learn/agentos/NeuralLink',
            `${neo}blob/dev/src/Neo.mjs`,
            `${neo}blob/dev/.github/AI_QUICK_START.md`
        ])
    });

    test('a training deck page resolves against its own folder, not learn/', () => {
        const context = {
            contentRoute    : '#/learn/',
            getContentPath  : LearnComponent.prototype.getContentPath,
            getStateProvider: () => ({getData: () => Neo.config.basePath + 'resources/data/deck/training/', getStore: () => null}),
            record          : {id: 'Overview'},
            resolveContentId: ContentComponent.prototype.resolveContentId
        };

        expect(hrefs(LearnComponent.prototype.rewriteLinks.call(context, link('../../../../../src/Neo.mjs'))))
            .toEqual([`${neo}blob/dev/src/Neo.mjs`])
    });

    test('a blog post keeps its blog and learn routes and opens a source file on GitHub', () => {
        const context = {
            contentRoute    : '#/',
            getContentPath  : BlogComponent.prototype.getContentPath,
            record          : {id: 'blog/role-based-navigation', path: 'learn/blog/role-based-navigation.md'},
            resolveContentId: BlogComponent.prototype.resolveContentId
        };

        const html = link('other-post.md') + link('../guides/Foo.md') + link('../../apps/webdesktop/view/Viewport.mjs');

        expect(hrefs(BlogComponent.prototype.rewriteLinks.call(context, html))).toEqual([
            '#/news/blog/other-post',
            '#/learn/guides/Foo',
            `${neo}blob/dev/apps/webdesktop/view/Viewport.mjs`
        ])
    })
});
