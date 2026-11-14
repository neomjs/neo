import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'PortalServiceSeoUnit'}, mockMain: false});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const previousDocumentHead = Neo.main?.addon?.DocumentHead;
previousDocumentHead && delete Neo.main.addon.DocumentHead;
const {default: DocumentHead} = await import('../../../../../../src/main/addon/DocumentHead.mjs');
const originalDocument        = globalThis.document;

test.describe('Portal.service.Seo (#20688)', () => {
    let addon, nodes;

    test.beforeEach(() => {
        nodes = [];
        const head = {
            querySelector(selector) {
                return nodes.find(node =>
                    selector === `${node.tag}[name="${node.attrs.name}"]` ||
                    selector === `${node.tag}[property="${node.attrs.property}"]` ||
                    selector === `${node.tag}[rel="${node.attrs.rel}"]` ||
                    (node.tag === 'script' && node.type === 'application/ld+json' && (
                        selector === 'script[type="application/ld+json"]' ||
                        selector === `script[type="application/ld+json"][data-schema-name="${node.dataset.schemaName}"]`
                    ))
                ) || null
            },
            appendChild(node) { node.parentNode = head; nodes.push(node) },
            removeChild(node) {
                const index = nodes.indexOf(node);
                if (index !== -1) nodes.splice(index, 1);
                node.parentNode = null
            }
        };
        globalThis.document = {
            head,
            title: '',
            createElement(tag) {
                if (tag !== 'meta' && tag !== 'link' && tag !== 'script') throw new Error(`unexpected tag: ${tag}`);
                return {
                    tag,
                    attrs      : {},
                    dataset    : {},
                    textContent: '',
                    type       : '',
                    remove() { this.parentNode?.removeChild?.(this) },
                    setAttribute(name, value) { this.attrs[name] = value }
                }
            }
        };
        addon = Object.create(DocumentHead.prototype)
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        previousDocumentHead && (Neo.main.addon.DocumentHead = previousDocumentHead)
    });

    test('resolves route-specific metadata, normalizes /home canonical URL, and clears neo-route ld+json on fallback routes', async () => {
        const seoJson               = await fs.readJSON(path.resolve(process.cwd(), 'apps/portal/resources/data/seo.json'));
        const originalFetch         = globalThis.fetch;
        const originalCurrentWorker = Neo.currentWorker;
        const updates               = [];

        globalThis.fetch = async () => ({
            ok  : true,
            json: async () => seoJson
        });

        Neo.currentWorker = {
            getAddon: async () => ({
                update: async payload => {
                    updates.push(payload);
                    addon.update(payload)
                }
            })
        };

        try {
            addon.setLdJson({
                name : 'neo-organism',
                value: {'@context': 'https://schema.org', '@graph': [{name: 'Neo.mjs'}]}
            });

            const {default: SeoSingleton} = await import('../../../../../../apps/portal/service/Seo.mjs');
            const SeoService              = Neo.create(SeoSingleton.constructor);
            await SeoService.ready();

            const indexHtml         = await fs.readFile(path.resolve(process.cwd(), 'apps/portal/index.html'), 'utf-8');
            const expectedHomeTitle = seoJson['/'].title;
            const expectedHomeDesc  = seoJson['/'].description;

            expect(expectedHomeTitle).toBe('Neo.mjs - An Agent Institution');
            expect(indexHtml).toContain(`<title>${expectedHomeTitle}</title>`);
            expect(indexHtml).toContain(`<meta name="description" content="${expectedHomeDesc}">`);
            expect(expectedHomeDesc).not.toMatch(/\bframework\b/i);

            const homeMeta = SeoService.getMetadata('/home');
            expect(homeMeta).toEqual({
                title      : expectedHomeTitle,
                description: expectedHomeDesc,
                lastmod    : seoJson['/home'].lastmod,
                route      : '/home'
            });

            const rootMeta = SeoService.getMetadata('/');
            expect(rootMeta).toEqual({
                title      : expectedHomeTitle,
                description: expectedHomeDesc,
                lastmod    : seoJson['/'].lastmod,
                route      : '/'
            });

            const learnMeta = SeoService.getMetadata('/learn/benefits/Introduction');
            expect(learnMeta).toEqual({
                title      : 'What Is Neo.mjs?',
                description: expect.stringContaining('On a normal night here'),
                lastmod    : seoJson['/learn/benefits/Introduction'].lastmod,
                schemaType : 'TechArticle',
                route      : '/learn/benefits/Introduction'
            });

            const blogMeta = SeoService.getMetadata('news/blog/a-workspace-that-can-leave-its-window/');
            expect(blogMeta).toEqual({
                title      : 'Move web app panels between windows—keep their state - Neo.mjs',
                description: expect.stringContaining('Move a grid into another browser window'),
                lastmod    : seoJson['/news/blog/a-workspace-that-can-leave-its-window'].lastmod,
                schemaType : 'BlogPosting',
                route      : '/news/blog/a-workspace-that-can-leave-its-window'
            });

            const releaseMeta = SeoService.getMetadata('/news/releases/13.4.0');
            expect(releaseMeta).toEqual({
                title      : 'Neo.mjs v13.4.0 Release Notes',
                description: expect.stringContaining('Release Type: A minor release'),
                lastmod    : seoJson['/news/releases/13.4.0'].lastmod,
                schemaType : 'TechArticle',
                route      : '/news/releases/13.4.0'
            });

            const fallbackMeta = SeoService.getMetadata('/news/tickets/123');
            expect(fallbackMeta).toEqual({
                title      : 'Neo.mjs News',
                description: 'Latest updates, blogs, and releases for the Neo.mjs platform.',
                lastmod    : seoJson['/news'].lastmod,
                route      : '/news/tickets/123'
            });

            const gridFamilyMeta = SeoService.getMetadata('/examples/grid');
            expect(gridFamilyMeta).toEqual({
                title      : 'Neo.mjs Grid & Table Examples',
                description: seoJson['/examples/grid'].description,
                lastmod    : seoJson['/examples/grid'].lastmod,
                schemaType : 'CollectionPage',
                route      : '/examples/grid'
            });

            const expectedExamplesTitle = 'Live JavaScript Examples — Web Worker Grids & Multi-Window UI | Neo.mjs';
            expect(seoJson['/examples'].title).toBe(expectedExamplesTitle);

            const unlistedFamilyMeta = SeoService.getMetadata('/examples/unlisted-family');
            expect(unlistedFamilyMeta).toEqual({
                title      : seoJson['/examples'].title,
                description: seoJson['/examples'].description,
                lastmod    : seoJson['/examples'].lastmod,
                route      : '/examples'
            });

            const legacyBuildMeta = SeoService.getMetadata('/examples/dist_prod');
            expect(legacyBuildMeta).toEqual({
                title      : seoJson['/examples'].title,
                description: seoJson['/examples'].description,
                lastmod    : seoJson['/examples'].lastmod,
                route      : '/examples'
            });

            // 1. /home resolves canonicalUrl and og:url to https://neomjs.com/
            SeoService.onRouteChanged({
                hashString: '/home',
                windowId  : 'neo-window-1'
            });

            await expect.poll(() => updates.length).toBe(1);

            expect(updates[0]).toEqual({
                canonicalUrl: 'https://neomjs.com/',
                description : homeMeta.description,
                ldJson      : {
                    name : 'neo-route',
                    value: {
                        '@context' : 'https://schema.org',
                        '@type'    : 'WebPage',
                        headline   : expectedHomeTitle,
                        name       : expectedHomeTitle,
                        description: homeMeta.description,
                        url        : 'https://neomjs.com/',
                        isPartOf   : {'@id': 'https://neomjs.com/#website'}
                    }
                },
                tags: [
                    {tag: 'meta', property: 'og:title',       content: expectedHomeTitle},
                    {tag: 'meta', property: 'og:description', content: homeMeta.description},
                    {tag: 'meta', property: 'og:url',         content: 'https://neomjs.com/'}
                ],
                title   : expectedHomeTitle,
                windowId: 'neo-window-1'
            });

            // 2. Exact deep route emits neo-route ld+json with its own headline
            SeoService.onRouteChanged({
                hashString: '/learn/benefits/Introduction',
                windowId  : 'neo-window-1'
            });

            await expect.poll(() => updates.length).toBe(2);

            expect(updates[1]).toEqual({
                canonicalUrl: 'https://neomjs.com/learn/benefits/Introduction',
                description : learnMeta.description,
                ldJson      : {
                    name : 'neo-route',
                    value: {
                        '@context' : 'https://schema.org',
                        '@type'    : 'TechArticle',
                        headline   : 'What Is Neo.mjs?',
                        name       : 'What Is Neo.mjs?',
                        description: learnMeta.description,
                        url        : 'https://neomjs.com/learn/benefits/Introduction',
                        isPartOf   : {'@id': 'https://neomjs.com/#website'}
                    }
                },
                tags: [
                    {tag: 'meta', property: 'og:title',       content: 'What Is Neo.mjs?'},
                    {tag: 'meta', property: 'og:description', content: learnMeta.description},
                    {tag: 'meta', property: 'og:url',         content: 'https://neomjs.com/learn/benefits/Introduction'}
                ],
                title   : 'What Is Neo.mjs?',
                windowId: 'neo-window-1'
            });
            expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-route"]')).toBeTruthy();

            // 3. Fallback route without its own entry keeps its canonical URL and clears neo-route ld+json
            SeoService.onRouteChanged({
                hashString: '/news/tickets/123',
                windowId  : 'neo-window-1'
            });

            await expect.poll(() => updates.length).toBe(3);

            expect(updates[2]).toEqual({
                canonicalUrl: 'https://neomjs.com/news/tickets/123',
                description : fallbackMeta.description,
                ldJson      : {
                    name : 'neo-route',
                    value: null
                },
                tags: [
                    {tag: 'meta', property: 'og:title',       content: 'Neo.mjs News'},
                    {tag: 'meta', property: 'og:description', content: fallbackMeta.description},
                    {tag: 'meta', property: 'og:url',         content: 'https://neomjs.com/news/tickets/123'}
                ],
                title   : 'Neo.mjs News',
                windowId: 'neo-window-1'
            });
            expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-route"]')).toBeNull();
            expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-organism"]')).toBeTruthy();

            // 4. Unlisted /examples/* sub-route canonicalizes to https://neomjs.com/examples
            SeoService.onRouteChanged({
                hashString: '/examples/unlisted-family',
                windowId  : 'neo-window-1'
            });

            await expect.poll(() => updates.length).toBe(4);

            expect(updates[3].canonicalUrl).toBe('https://neomjs.com/examples');
            expect(updates[3].title).toBe(seoJson['/examples'].title);
            expect(updates[3].tags).toContainEqual({
                tag     : 'meta',
                property: 'og:url',
                content : 'https://neomjs.com/examples'
            });

            // 5. Root '/' route resolves exact seo.json['/'] metadata and https://neomjs.com/ canonical URL
            SeoService.onRouteChanged({
                hashString: '/',
                windowId  : 'neo-window-1'
            });

            await expect.poll(() => updates.length).toBe(5);

            expect(updates[4]).toEqual({
                canonicalUrl: 'https://neomjs.com/',
                description : expectedHomeDesc,
                ldJson      : {
                    name : 'neo-route',
                    value: {
                        '@context' : 'https://schema.org',
                        '@type'    : 'WebPage',
                        headline   : expectedHomeTitle,
                        name       : expectedHomeTitle,
                        description: expectedHomeDesc,
                        url        : 'https://neomjs.com/',
                        isPartOf   : {'@id': 'https://neomjs.com/#website'}
                    }
                },
                tags: [
                    {tag: 'meta', property: 'og:title',       content: expectedHomeTitle},
                    {tag: 'meta', property: 'og:description', content: expectedHomeDesc},
                    {tag: 'meta', property: 'og:url',         content: 'https://neomjs.com/'}
                ],
                title   : expectedHomeTitle,
                windowId: 'neo-window-1'
            });
        } finally {
            globalThis.fetch  = originalFetch;
            Neo.currentWorker = originalCurrentWorker
        }
    });

    test('falls back to /home metadata when legacy seo.json fixture omits / (#20917)', async () => {
        const originalFetch = globalThis.fetch;

        globalThis.fetch = async () => ({
            ok  : true,
            json: async () => ({
                '/home': {
                    title      : 'Legacy Home Title',
                    description: 'Legacy home description.'
                }
            })
        });

        try {
            const {default: SeoSingleton} = await import('../../../../../../apps/portal/service/Seo.mjs');
            const SeoService              = Neo.create(SeoSingleton.constructor);
            await SeoService.ready();

            expect(SeoService.getMetadata('/')).toEqual({
                title      : 'Legacy Home Title',
                description: 'Legacy home description.',
                route      : '/home'
            });
        } finally {
            globalThis.fetch = originalFetch
        }
    });
});
