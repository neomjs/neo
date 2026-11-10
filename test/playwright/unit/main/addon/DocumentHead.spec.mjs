import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'MainDocumentHeadUnit'}, mockMain: false});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

const previousSlot = Neo.main?.addon?.DocumentHead;
previousSlot && delete Neo.main.addon.DocumentHead;
const {default: DocumentHead} = await import('../../../../../src/main/addon/DocumentHead.mjs');
const originalDocument        = globalThis.document;

test.describe('Neo.main.addon.DocumentHead metadata', () => {
    let nodes, addon;

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
            appendChild(node) { node.parentNode = head; nodes.push(node) }
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
                    setAttribute(name, value) { this.attrs[name] = value }
                }
            }
        };
        addon = Object.create(DocumentHead.prototype)
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        previousSlot && (Neo.main.addon.DocumentHead = previousSlot)
    });

    test('description and canonical create and then update their existing tags', () => {
        addon.setDescription({value: 'First'});
        addon.setCanonical({url: 'https://example.test/first'});
        const [description, canonical] = nodes;

        expect(description.attrs).toEqual({name: 'description', content: 'First'});
        expect(canonical.attrs).toEqual({rel: 'canonical', href: 'https://example.test/first'});
        addon.setDescription({value: 'Second'});
        addon.setCanonical({url: 'https://example.test/second'});
        expect(nodes).toEqual([description, canonical]);
        expect(description.attrs.content).toBe('Second');
        expect(canonical.attrs.href).toBe('https://example.test/second')
    });

    test('combined update applies description, canonical and a generic value-envelope tag', () => {
        addon.update({description: 'Connect', canonicalUrl: 'https://example.test/services', title: 'Connect',
            tag: {tag: 'meta', property: 'og:title', content: 'Connect'}});

        expect(document.title).toBe('Connect');
        expect(nodes.map(node => node.attrs)).toEqual([
            {rel: 'canonical', href: 'https://example.test/services'},
            {name: 'description', content: 'Connect'},
            {property: 'og:title', content: 'Connect'}
        ])
    });

    test('update with named ldJson and tags array preserves existing neo-organism ld+json (#20688)', () => {
        addon.setLdJson({
            name : 'neo-organism',
            value: {'@context': 'https://schema.org', '@graph': [{name: 'Neo.mjs'}]}
        });

        addon.update({
            canonicalUrl: 'https://neomjs.com/learn/benefits/Introduction',
            description : 'What Neo is and why it exists.',
            ldJson      : {
                name : 'neo-route',
                value: {
                    '@context': 'https://schema.org',
                    '@type'   : 'TechArticle',
                    headline  : 'What Is Neo.mjs?',
                    url       : 'https://neomjs.com/learn/benefits/Introduction'
                }
            },
            tags: [
                {tag: 'meta', property: 'og:title',       content: 'What Is Neo.mjs?'},
                {tag: 'meta', property: 'og:description', content: 'What Neo is and why it exists.'},
                {tag: 'meta', property: 'og:url',         content: 'https://neomjs.com/learn/benefits/Introduction'}
            ],
            title: 'What Is Neo.mjs?'
        });

        const organismScript = document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-organism"]');
        const routeScript    = document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-route"]');

        expect(organismScript).toBeTruthy();
        expect(JSON.parse(organismScript.textContent)).toEqual({
            '@context': 'https://schema.org',
            '@graph'  : [{name: 'Neo.mjs'}]
        });

        expect(routeScript).toBeTruthy();
        expect(JSON.parse(routeScript.textContent)).toEqual({
            '@context': 'https://schema.org',
            '@type'   : 'TechArticle',
            headline  : 'What Is Neo.mjs?',
            url       : 'https://neomjs.com/learn/benefits/Introduction'
        });

        expect(document.head.querySelector('meta[property="og:title"]').attrs.content).toBe('What Is Neo.mjs?');
        expect(document.head.querySelector('meta[property="og:description"]').attrs.content).toBe('What Neo is and why it exists.');
        expect(document.head.querySelector('meta[property="og:url"]').attrs.content).toBe('https://neomjs.com/learn/benefits/Introduction');
    });

    test('Portal.service.Seo resolves route-specific metadata and updates canonical, OG, and neo-route ld+json (#20688)', async () => {
        const fs      = await import('fs-extra');
        const path    = await import('path');
        const seoJson = await fs.default.readJSON(path.default.resolve(process.cwd(), 'apps/portal/resources/data/seo.json'));

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
            const {default: SeoSingleton} = await import('../../../../../apps/portal/service/Seo.mjs');
            const SeoService              = Neo.create(SeoSingleton.constructor);
            await SeoService.ready();

            const learnMeta = SeoService.getMetadata('/learn/benefits/Introduction');
            expect(learnMeta).toEqual({
                title      : 'What Is Neo.mjs?',
                description: expect.stringContaining('On a normal night here'),
                schemaType : 'TechArticle',
                route      : '/learn/benefits/Introduction'
            });

            const blogMeta = SeoService.getMetadata('news/blog/a-workspace-that-can-leave-its-window/');
            expect(blogMeta).toEqual({
                title      : 'Move web app panels between windows—keep their state - Neo.mjs',
                description: expect.stringContaining('Move a grid into another browser window'),
                schemaType : 'BlogPosting',
                route      : '/news/blog/a-workspace-that-can-leave-its-window'
            });

            const releaseMeta = SeoService.getMetadata('/news/releases/13.4.0');
            expect(releaseMeta).toEqual({
                title      : 'Neo.mjs v13.4.0 Release Notes',
                description: expect.stringContaining('Release Type: A minor release'),
                schemaType : 'TechArticle',
                route      : '/news/releases/13.4.0'
            });

            const fallbackMeta = SeoService.getMetadata('/learn/unknown/FutureTopic');
            expect(fallbackMeta).toEqual({
                title      : 'Learn Neo.mjs',
                description: 'Learn the fundamentals of the Neo.mjs platform.',
                route      : '/learn/unknown/FutureTopic'
            });

            SeoService.onRouteChanged({
                hashString: '/learn/benefits/Introduction',
                windowId  : 'neo-window-1'
            });

            await expect.poll(() => updates.length).toBe(1);

            expect(updates[0]).toEqual({
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
        } finally {
            globalThis.fetch  = originalFetch;
            Neo.currentWorker = originalCurrentWorker
        }
    });
});
