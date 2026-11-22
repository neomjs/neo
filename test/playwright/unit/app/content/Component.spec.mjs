import {setup} from '../../../setup.mjs';

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Content        from '../../../../../src/app/content/Component.mjs';
import Store          from '../../../../../src/data/Store.mjs';
import ContentSection from '../../../../../apps/portal/model/ContentSection.mjs';
import PortalContent  from '../../../../../apps/portal/view/content/Component.mjs';
import ContentStore   from '../../../../../apps/portal/store/Content.mjs';

const appName = 'ContentRequestTest';

setup({appConfig: {name: appName}});

/** @summary Captures the record change's promise while isolating HTTP settlement from Markdown rendering. */
class DeferredContent extends Content {
    static config = {
        className          : 'Test.Unit.App.Content.DeferredContent',
        updateSectionsStore: false
    }

    afterSetRecord(value, oldValue) {
        this.recordChange = super.afterSetRecord(value, oldValue);
        return this.recordChange
    }

    afterSetValue() {}

    getContentPath({id}) {
        return id
    }
}

Neo.setupClass(DeferredContent);

test.describe('article request settlement', () => {
    let component, store, requests, observations, scrolls, originalFetch, originalObserver, originalScroll;

    test.beforeEach(() => {
        requests         = [];
        observations     = [];
        scrolls          = [];
        originalFetch    = globalThis.fetch;
        originalObserver = Neo.main.addon.IntersectionObserver;
        originalScroll   = Neo.main.DomAccess.scrollTo;

        globalThis.fetch = async path => {
            const {promise, resolve} = Promise.withResolvers();
            requests.push({path, resolve});
            return {text: () => promise}
        };
        Neo.main.addon.IntersectionObserver = {observe: config => observations.push(config)};
        Neo.main.DomAccess.scrollTo        = config => scrolls.push(config);
        component = Neo.create(DeferredContent, {appName});
        component.timeout = () => Promise.resolve();
        store = Neo.create(ContentStore, {data: [{id: 'A', name: 'Guide A'}, {id: 'B', name: 'Guide B'}]})
    });

    test.afterEach(() => {
        if (!component.isDestroyed) component.destroy();
        store.destroy();

        globalThis.fetch            = originalFetch;
        Neo.main.DomAccess.scrollTo = originalScroll;

        if (originalObserver === undefined) {
            delete Neo.main.addon.IntersectionObserver
        } else {
            Neo.main.addon.IntersectionObserver = originalObserver
        }
    });

    test('only the latest article publishes when navigation revisits the same record', async () => {
        component.record = store.get('A');
        const firstA = component.recordChange;

        component.record = store.get('B');
        const visitB = component.recordChange;

        component.record = store.get('A');
        const latestA = component.recordChange;

        expect(requests.map(({path}) => path)).toEqual(['A', 'B', 'A']);
        requests[2].resolve('latest A');
        await latestA;
        requests[0].resolve('obsolete A');
        requests[1].resolve('obsolete B');
        await Promise.all([firstA, visitB]);

        expect(component.value).toBe('latest A');
        expect(observations).toHaveLength(1);
        expect(observations[0].observe).toEqual(['.neo-h2', '.neo-h3']);
        expect(scrolls).toHaveLength(1)
    });

    for (const action of ['clear', 'destroy']) {
        test(`a delayed response does not publish after ${action}`, async () => {
            component.record = store.get('A');
            const visit = component.recordChange;

            if (action === 'clear') {
                component.record = null
            } else {
                component.destroy()
            }

            requests[0].resolve('obsolete article');
            await visit;

            expect(component.value).not.toBe('obsolete article');
            expect(observations).toHaveLength(0)
        })
    }

    test('a previous route cannot scroll after the current route starts', async () => {
        component.record = store.get('A');
        requests[0].resolve('first A');
        await component.recordChange;

        const delayedScroll = Promise.withResolvers(),
              scrollQueued  = Promise.withResolvers();

        component.timeout = () => {
            scrollQueued.resolve();
            return delayedScroll.promise
        };

        component.record = store.get('B');
        const visitB = component.recordChange;
        requests[1].resolve('B');
        await scrollQueued.promise;

        component.record = store.get('A');
        const latestA = component.recordChange;
        delayedScroll.resolve();
        await visitB;
        expect(scrolls).toHaveLength(0);

        component.timeout = () => Promise.resolve();
        requests[2].resolve('latest A');
        await latestA;
        expect(scrolls).toHaveLength(1)
    });

    test('destroying the view cancels a pending route scroll', async () => {
        component.record = store.get('A');
        requests[0].resolve('A');
        await component.recordChange;

        const scrollQueued = Promise.withResolvers();
        component.timeout = delay => {
            const pending = Content.prototype.timeout.call(component, delay);
            scrollQueued.resolve();
            return pending
        };

        component.record = store.get('B');
        const visitB = component.recordChange;
        requests[1].resolve('B');
        await scrollQueued.promise;
        component.destroy();

        await visitB;
        expect(scrolls).toHaveLength(0)
    });

    test('each article publishes its own set of unique routed sections', async () => {
        const sections   = Neo.create(Store, {model: ContentSection}),
              selections = [];

        component.routeSections = true;
        component.updateSectionsStore = true;
        component.getStateProvider = () => ({getStore: () => sections});
        component.afterSetValue = value => component.modifyMarkdown(value);
        component.promiseUpdate = async () => {};
        component.on('routeSection', ({record}) => selections.push(record?.anchor ?? null));

        try {
            component.record = store.get('A');
            requests[0].resolve([
                '# Use `setState` with [a controller](guide.md)',
                '## Tips &amp; Tricks',
                '### Tips &amp; Tricks'
            ].join('\n'));
            await component.recordChange;

            expect(sections.getCount()).toBe(3);
            expect(sections.getAt(0).anchor).toBe('use-setstate-with-a-controller');
            expect(sections.getAt(1).anchor).toBe('tips--tricks');
            expect(sections.getAt(2).anchor).toBe('tips--tricks-1');

            component.record = store.get('B');
            requests[1].resolve('# Tips &amp; Tricks');
            await component.recordChange;

            expect(sections.getCount()).toBe(1);
            expect(sections.getAt(0).anchor).toBe('tips--tricks');

            component.record = store.get('A');
            requests[2].resolve('An article without headings.');
            await component.recordChange;

            expect(sections.getCount()).toBe(0);
            expect(selections).toEqual(['use-setstate-with-a-controller', 'tips--tricks', null])
        } finally {
            sections.destroy()
        }
    });

    test('the timeline shares request settlement and keeps its observer selector', () => {
        expect(PortalContent.prototype.doFetchContent).toBe(Content.prototype.doFetchContent);
        expect(PortalContent.prototype.contentObserverSelectors).toEqual(['.neo-timeline-item[data-record-id]'])
    })
});
