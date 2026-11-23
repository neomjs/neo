import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'PortalServiceSeoUnit'}, mockMain: false});

import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

import {extractExampleFamilyDefinitions, getExampleFamilySeo} from '../../../../../../buildScripts/docs/seo/seoJson.mjs';

const __dirname         = path.dirname(fileURLToPath(import.meta.url));
const seoJsonPath       = path.resolve(__dirname, '../../../../../../apps/portal/resources/data/seo.json');
const seoJson           = JSON.parse(fs.readFileSync(seoJsonPath, 'utf-8'));
const familyDefinitions = extractExampleFamilyDefinitions(fs.readFileSync(
    path.resolve(__dirname, '../../../../../../apps/portal/view/examples/MainContainer.mjs'), 'utf-8'
)).filter(definition => definition.family);
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
                if (!route.startsWith('/learn/') && !route.startsWith('/news/blog/') && !route.startsWith('/news/releases/') && !route.endsWith('.html')) {
                    expect(SeoService.getTitle(route), `routeTitles mismatch for ${route}`).toBe(meta.title)
                }
            }

            expect(SeoService.getTitle('/examples/unlisted-family')).toBe(seoJson['/examples'].title);

            // Published or not: a family whose first cover lands later publishes this same title
            for (const definition of familyDefinitions) {
                expect(SeoService.getTitle(definition.route), definition.route).toBe(getExampleFamilySeo(definition).title)
            }
            expect(SeoService.getTitle('/news/tickets/123')).toBe('GitHub Issue Archive — Neo.mjs');
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
                value            : 'JavaScript Data Grid Examples — 100k Rows in a Web Worker | Neo.mjs',
                windowId         : 'neo-window-1'
            });
            expect(fetchCount).toBe(0);
        } finally {
            globalThis.fetch  = originalFetch;
            Neo.currentWorker = originalCurrentWorker
        }
    });

    test('handles real HashHistory + ViewportController + Blog MainContainerController ordering, navigation away, superseded getAddon lookups, and multi-window isolation', async () => {
        const originalCurrentWorker = Neo.currentWorker,
              originalLocalStorage  = Neo.main?.addon?.LocalStorage,
              originalMain          = Neo.Main,
              titleCallsByWindow    = {
                  'neo-window-1': [],
                  'neo-window-2': []
              },
              deferredAddons        = [];
        let   interceptWindow1Addon = false;

        Neo.Main = {
            setRoute() {},
            windowCloseAll() {}
        };
        Neo.ns('Neo.main.addon', true);
        Neo.main.addon.LocalStorage = {
            readLocalStorageItem  : async () => ({value: null}),
            updateLocalStorageItem: async () => {}
        };

        Neo.currentWorker = {
            on() {},
            un() {},
            getAddon: async (name, windowId) => {
                expect(name).toBe('DocumentHead');

                const sink = {
                    setTitle: async ({value, windowId: targetWin}) => {
                        titleCallsByWindow[targetWin].push(value);
                        addon.setTitle({value, windowId: targetWin})
                    }
                };

                if (interceptWindow1Addon && windowId === 'neo-window-1') {
                    return new Promise(resolve => {
                        deferredAddons.push(() => resolve(sink))
                    })
                }

                return sink
            }
        };

        const [{default: HashHistory}, {default: Observable}, {default: ViewportController}, {default: BlogController}] = await Promise.all([
            import('../../../../../../src/util/HashHistory.mjs'),
            import('../../../../../../src/core/Observable.mjs'),
            import('../../../../../../apps/portal/view/ViewportController.mjs'),
            import('../../../../../../apps/portal/view/news/blog/MainContainerController.mjs')
        ]);

        class MockBlogTreeStore extends core.Base {
            static observable = true;
            static config = {
                className: 'Test.Unit.Portal.Service.Seo.MockBlogTreeStore'
            };

            records = new Map();

            get(id) {
                return this.records.get(id) || null
            }

            getCount() {
                return this.records.size
            }

            loadRecords(entries) {
                for (const entry of entries) {
                    this.records.set(entry.id, entry)
                }
                this.fire('load', {items: entries})
            }

            clearRecords() {
                this.records.clear()
            }
        }
        MockBlogTreeStore = Neo.setupClass(MockBlogTreeStore);

        const createWindowHarness = (windowId, order = 'viewport-first') => {
            const store         = Neo.create(MockBlogTreeStore),
                  stateProvider = {
                      data: {currentPageRecord: null},
                      getStore(key) {
                          expect(key).toBe('tree');
                          return store
                      },
                      // The ViewportController writes the theme on screen here at boot
                      setData(data) {
                          Object.assign(this.data, data)
                      }
                  },
                  mainContent   = {layout: {activeIndex: null, ntype: 'card'}},
                  tree          = {
                      routePrefix: null,
                      async expandAndScrollToItem() {},
                      expandParents() {}
                  },
                  viewportComp  = {
                      id           : `mock-viewport-${windowId}`,
                      isConstructed: true,
                      stateProvider,
                      windowId,
                      down({reference}) {
                          return reference === 'main-content' ? mainContent : null
                      },
                      getController() { return null },
                      getItem(key) { return key === 'main-content' ? mainContent : null },
                      getStateProvider() { return stateProvider },
                      getTheme() { return 'neo-theme-neo-dark' }
                  },
                  blogComp      = {
                      id           : `mock-blog-${windowId}`,
                      isConstructed: true,
                      stateProvider,
                      windowId,
                      down({reference}) {
                          return reference === 'tree' ? tree : null
                      },
                      getController() { return null },
                      getStateProvider() { return stateProvider }
                  };

            let viewportController, blogController;

            if (order === 'viewport-first') {
                viewportController = Neo.create(ViewportController, {component: viewportComp, windowId});
                blogController     = Neo.create(BlogController,     {component: blogComp,     windowId})
            } else {
                blogController     = Neo.create(BlogController,     {component: blogComp,     windowId});
                viewportController = Neo.create(ViewportController, {component: viewportComp, windowId})
            }

            return {
                blogController,
                store,
                viewportController,
                destroy() {
                    blogController.destroy();
                    viewportController.destroy();
                    store.destroy()
                }
            }
        };

        const flushAsync = () => new Promise(resolve => setTimeout(resolve, 25));
        let   win1       = createWindowHarness('neo-window-1', 'viewport-first'),
            win2 = createWindowHarness('neo-window-2', 'blog-first');

        try {
            // 1. Warm leaf in viewport-first controller order: /services -> /news/blog/warm-post
            win1.store.loadRecords([{id: 'blog/warm-post', name: 'Warm Post One'}]);
            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/services', windowId: 'neo-window-1'});
            await flushAsync();
            expect(titleCallsByWindow['neo-window-1'].at(-1)).toBe('Connect with Neo.mjs');

            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/news/blog/warm-post', windowId: 'neo-window-1'});
            await flushAsync();
            expect(titleCallsByWindow['neo-window-1'].at(-1)).toBe('Warm Post One - Neo.mjs');

            // 2. Warm leaf in blog-first controller order on window 2: /about-us -> /news/blog/warm-post-two
            win2.store.loadRecords([{id: 'blog/warm-post-two', name: 'Warm Post Two'}]);
            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/about-us', windowId: 'neo-window-2'});
            await flushAsync();
            expect(titleCallsByWindow['neo-window-2'].at(-1)).toBe('About Us - Neo.mjs');

            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/news/blog/warm-post-two', windowId: 'neo-window-2'});
            await flushAsync();
            expect(titleCallsByWindow['neo-window-2'].at(-1)).toBe('Warm Post Two - Neo.mjs');

            // 3. Delayed leaf selection + navigation away on window 1, with window 2 delayed leaf as isolation control
            win1.store.clearRecords();
            win2.store.clearRecords();

            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/news/blog/cold-post-one', windowId: 'neo-window-1'});
            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/news/blog/cold-post-two', windowId: 'neo-window-2'});
            await flushAsync();

            expect(titleCallsByWindow['neo-window-1'].at(-1)).toBe(seoJson['/news/blog'].title);
            expect(titleCallsByWindow['neo-window-2'].at(-1)).toBe(seoJson['/news/blog'].title);

            // Navigate window 1 away to /services BEFORE its blog store resolves
            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/services', windowId: 'neo-window-1'});
            await flushAsync();
            expect(titleCallsByWindow['neo-window-1'].at(-1)).toBe('Connect with Neo.mjs');

            // Now resolve both delayed blog stores (store.on('load', select, delay: 10))
            win1.store.loadRecords([{id: 'blog/cold-post-one', name: 'Stale Cold Post One'}]);
            win2.store.loadRecords([{id: 'blog/cold-post-two', name: 'Resolved Cold Post Two'}]);
            await flushAsync();

            expect(titleCallsByWindow['neo-window-1'].at(-1)).toBe('Connect with Neo.mjs');
            expect(titleCallsByWindow['neo-window-1']).not.toContain('Stale Cold Post One - Neo.mjs');
            expect(titleCallsByWindow['neo-window-2'].at(-1)).toBe('Resolved Cold Post Two - Neo.mjs');

            // 4. Out-of-order async getAddon('DocumentHead', windowId) resolution cannot issue a late stale write
            titleCallsByWindow['neo-window-1'].length = 0;
            titleCallsByWindow['neo-window-2'].length = 0;
            interceptWindow1Addon = true;

            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/about-us', windowId: 'neo-window-1'});
            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/news/videos', windowId: 'neo-window-1'});
            HashHistory.push({appName: 'Portal', hash: {}, hashString: '/docs', windowId: 'neo-window-2'});

            await Promise.resolve();
            expect(deferredAddons.length).toBe(2);

            // Resolve newer Videos lookup FIRST, then older About Us lookup LAST
            deferredAddons[1]();
            await flushAsync();
            expect(titleCallsByWindow['neo-window-1']).toEqual(['Videos & Live Demos — Multi-Window Web Apps & Agent OS | Neo.mjs']);

            deferredAddons[0]();
            await flushAsync();
            expect(titleCallsByWindow['neo-window-1']).toEqual(['Videos & Live Demos — Multi-Window Web Apps & Agent OS | Neo.mjs']);
            expect(titleCallsByWindow['neo-window-2']).toEqual([seoJson['/docs'].title]);
        } finally {
            win1.destroy();
            win2.destroy();
            delete HashHistory.stacks['neo-window-1'];
            delete HashHistory.stacks['neo-window-2'];
            Neo.currentWorker = originalCurrentWorker;
            if (originalMain === undefined) {
                delete Neo.Main
            } else {
                Neo.Main = originalMain
            }
            if (originalLocalStorage === undefined) {
                delete Neo.main.addon.LocalStorage
            } else {
                Neo.main.addon.LocalStorage = originalLocalStorage
            }
        }
    });
});
