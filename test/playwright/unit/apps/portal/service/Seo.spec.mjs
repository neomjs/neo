import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'PortalServiceSeoUnit'}, mockMain: false});

import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

const __dirname            = path.dirname(fileURLToPath(import.meta.url));
const seoJsonPath          = path.resolve(__dirname, '../../../../../../apps/portal/resources/data/seo.json');
const seoJson              = JSON.parse(fs.readFileSync(seoJsonPath, 'utf-8'));
const previousDocumentHead = Neo.main?.addon?.DocumentHead;
previousDocumentHead && delete Neo.main.addon.DocumentHead;
const {default: DocumentHead} = await import('../../../../../../src/main/addon/DocumentHead.mjs');
const originalDocument        = globalThis.document;

test.describe('Portal.service.Seo (#20945)', () => {
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
            title: 'Neo.mjs - An Agent Institution',
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

    test('resolves synchronous route titles with zero fetch, stays in parity with non-leaf seo.json routes, updates DocumentHead#setTitle per windowId, and ignores stale leaf callbacks', async () => {
        const originalFetch         = globalThis.fetch;
        const originalCurrentWorker = Neo.currentWorker;
        const titleCalls            = [];
        const updateCalls           = [];
        let   fetchCount            = 0;

        globalThis.fetch = async () => {
            fetchCount++;
            throw new Error('Portal.service.Seo must not call fetch()')
        };

        Neo.currentWorker = {
            getAddon: async (name, windowId) => {
                expect(name).toBe('DocumentHead');
                return {
                    setTitle: async payload => {
                        titleCalls.push({requestedWindowId: windowId, ...payload});
                        addon.setTitle(payload)
                    },
                    update: async payload => {
                        updateCalls.push(payload);
                        addon.update(payload)
                    }
                }
            }
        };

        try {
            addon.setDescription({value: 'Static shell description'});
            addon.setLdJson({
                name : 'neo-organism',
                value: {'@context': 'https://schema.org', '@graph': [{name: 'Neo.mjs'}]}
            });

            const {default: SeoSingleton} = await import('../../../../../../apps/portal/service/Seo.mjs');
            const SeoService              = Neo.create(SeoSingleton.constructor);
            await SeoService.ready();

            expect(fetchCount).toBe(0);

            // Mechanical parity check: every top-level and published /examples/<family> route in seo.json
            // must resolve to the exact same title in Portal.service.Seo#getTitle
            for (const [route, meta] of Object.entries(seoJson)) {
                if (!route.startsWith('/learn/') && !route.startsWith('/news/blog/') && !route.startsWith('/news/releases/')) {
                    expect(SeoService.getTitle(route), `routeTitles mismatch for ${route}`).toBe(meta.title)
                }
            }

            expect(SeoService.getTitle('/examples/unlisted-family')).toBe(seoJson['/examples'].title);
            expect(SeoService.getTitle('/news/tickets/123')).toBe('Neo.mjs Tickets');
            expect(SeoService.getTitle('learn/benefits/Introduction/#overview')).toBe(seoJson['/learn'].title);

            // 1. Top-level route updates only DocumentHead#setTitle, leaving description and ld+json untouched
            await SeoService.onRouteChanged({
                hashString: '/services',
                windowId  : 'neo-window-1'
            });

            expect(titleCalls).toEqual([{
                requestedWindowId: 'neo-window-1',
                value            : 'Connect with Neo.mjs',
                windowId         : 'neo-window-1'
            }]);
            expect(updateCalls).toEqual([]);
            expect(document.title).toBe('Connect with Neo.mjs');
            expect(document.head.querySelector('meta[name="description"]').attrs.content).toBe('Static shell description');
            expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-organism"]')).toBeTruthy();
            expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-route"]')).toBeNull();

            // 2. Deep route sets section fallback immediately, then accepts matching leaf refinement for that window
            await SeoService.onRouteChanged({
                hashString: '/learn/benefits/Introduction#why',
                windowId  : 'neo-window-1'
            });
            expect(titleCalls.at(-1).value).toBe(seoJson['/learn'].title);

            const appliedLeaf = await SeoService.setRouteTitle({
                route   : '/learn/benefits/Introduction',
                title   : 'Introduction - Neo.mjs',
                windowId: 'neo-window-1'
            });
            expect(appliedLeaf).toBe(true);
            expect(titleCalls.at(-1)).toEqual({
                requestedWindowId: 'neo-window-1',
                value            : 'Introduction - Neo.mjs',
                windowId         : 'neo-window-1'
            });

            // 3. Multi-window isolation + stale async leaf protection
            await SeoService.onRouteChanged({
                hashString: '/news/videos',
                windowId  : 'neo-window-2'
            });
            await SeoService.onRouteChanged({
                hashString: '/examples/grid',
                windowId  : 'neo-window-1'
            });

            // Stale store callback for window 1's prior /learn route must be ignored
            const staleLeaf = await SeoService.setRouteTitle({
                route   : '/learn/benefits/Introduction',
                title   : 'Stale Title - Neo.mjs',
                windowId: 'neo-window-1'
            });
            expect(staleLeaf).toBe(false);
            expect(titleCalls.at(-1)).toEqual({
                requestedWindowId: 'neo-window-1',
                value            : 'Neo.mjs Grid & Table Examples',
                windowId         : 'neo-window-1'
            });
            expect(fetchCount).toBe(0);
        } finally {
            globalThis.fetch  = originalFetch;
            Neo.currentWorker = originalCurrentWorker
        }
    });
});
