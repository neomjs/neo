import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'MainMermaidRenderingTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Mermaid        from '../../../../../src/main/addon/Mermaid.mjs';

/**
 * @summary A manually released library render, so the tests control the overlap without timers.
 * @returns {Object}
 */
function barrier() {
    let resolve, reject;
    const promise = new Promise((done, fail) => {resolve = done; reject = fail});

    return {promise, resolve, reject}
}

/**
 * @summary The element surface the addon uses; replacements retain distinct object identity.
 * @param {String} id
 * @param {String} [textContent='']
 * @returns {Object}
 */
function element(id, textContent='') {
    return {
        id, textContent, isConnected: true, children: [], style: {},
        removeAttribute() {},
        replaceChildren(...children) {
            this.children = children;
            this.textContent = children.map(child => child.textContent).join('')
        }
    }
}

/**
 * @summary The addon serializes the library's document work and discards obsolete queued targets.
 */
test.describe('Mermaid rendering ownership', () => {
    let addon, elements, errors, originalDocument, originalError;

    test.beforeEach(() => {
        originalDocument = globalThis.document;
        originalError = console.error;
        elements = new Map();
        errors = [];
        globalThis.document = {
            getElementById: id => elements.get(id),
            createElement : () => element('error')
        };
        console.error = (...args) => errors.push(args);
        addon = Neo.create(Mermaid, {preloadFilesDelay: false, useLazyLoading: false})
    });

    test.afterEach(() => {
        addon.destroy();
        console.error = originalError;
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument
    });

    test('serializes the shared library and coalesces queued source without changing the active node', async () => {
        const entered = barrier(), release = barrier(), calls = [],
              first   = element('first'), second = element('second');
        let active = 0, maximum = 0;

        elements.set(first.id, first);
        elements.set(second.id, second);
        addon.mermaid = {
            async run({nodes: [node]}) {
                const code = node.textContent;
                calls.push(code);
                maximum = Math.max(maximum, ++active);
                try {
                    if (code === 'initial') {
                        entered.resolve();
                        await release.promise
                    }
                    node.textContent = `svg:${code}`
                } finally {
                    active--
                }
            }
        };

        const initial = addon.render({id: first.id, code: 'initial'});
        await entered.promise;
        const obsolete = addon.render({id: first.id, code: 'obsolete'}),
              request  = {id: first.id, code: 'latest'},
              latest   = addon.render(request),
              other    = addon.render({id: second.id, code: 'other'});

        request.code = 'mutated after admission';
        try {
            expect(first.textContent, 'queued edits leave the library-owned node alone').toBe('initial')
        } finally {
            release.resolve();
            await Promise.all([initial, obsolete, latest, other])
        }

        expect(maximum).toBe(1);
        expect(calls).toEqual(['initial', 'latest', 'other']);
        expect(first.textContent).toBe('svg:latest');
        expect(second.textContent).toBe('svg:other');
        expect(addon.pendingRenders.size).toBe(0)
    });

    test('queued renders cannot mutate a replacement with a reused id or a removed element', async () => {
        const entered = barrier(), release = barrier(), calls = [],
              blocker = element('blocker'), old = element('reused', 'old'), removed = element('removed');

        [blocker, old, removed].forEach(node => elements.set(node.id, node));
        addon.mermaid = {
            async run({nodes: [node]}) {
                calls.push(node.textContent);
                if (node === blocker) {
                    entered.resolve();
                    await release.promise
                }
                node.textContent = `svg:${node.textContent}`
            }
        };

        const initial = addon.render({id: blocker.id, code: 'blocking'});
        await entered.promise;
        const stale       = addon.render({id: old.id, code: 'stale'}),
              gone        = addon.render({id: removed.id, code: 'removed'}),
              replacement = element(old.id, 'untouched');

        old.isConnected = false;
        removed.isConnected = false;
        elements.set(old.id, replacement);
        elements.delete(removed.id);
        await addon.render({id: 'missing', code: 'missing'});
        release.resolve();
        await Promise.all([initial, stale, gone]);

        expect(calls).toEqual(['blocking']);
        expect(replacement.textContent).toBe('untouched');
        expect(addon.pendingRenders.size).toBe(0);

        await addon.render({id: replacement.id, code: 'replacement'});
        expect(replacement.textContent).toBe('svg:replacement');
        expect(calls).toEqual(['blocking', 'replacement'])
    });

    test('an obsolete rejection paints no error and a current rejection remains inline without poisoning the queue', async () => {
        const entered = barrier(), release = barrier(), node = element('target');

        elements.set(node.id, node);
        addon.mermaid = {
            async run({nodes: [target]}) {
                const code = target.textContent;
                if (code === 'obsolete error') {
                    entered.resolve();
                    await release.promise;
                    throw new Error('obsolete failure')
                }
                if (code === 'current error') {
                    throw new Error('<img src=x onerror=alert(1)>')
                }
                target.textContent = `svg:${code}`
            }
        };

        const initial = addon.render({id: node.id, code: 'obsolete error'});
        await entered.promise;
        const latest = addon.render({id: node.id, code: 'latest'});

        release.resolve();
        await Promise.all([initial, latest]);
        expect(node.textContent).toBe('svg:latest');
        expect(node.children).toEqual([]);
        expect(errors).toEqual([]);

        await addon.render({id: node.id, code: 'current error'});
        expect(node.children).toHaveLength(1);
        expect(node.children[0].textContent).toBe('Mermaid Error: <img src=x onerror=alert(1)>');
        expect(node.children[0].innerHTML).toBeUndefined();
        expect(errors).toHaveLength(1);

        await addon.render({id: node.id, code: 'recovered'});
        expect(node.textContent).toBe('svg:recovered');
        expect(addon.pendingRenders.size).toBe(0)
    });

    test('destroying the addon skips queued targets and a late failure without touching deleted fields', async () => {
        const entered = barrier(), release = barrier(), calls = [],
              first   = element('first'), queuedTarget = element('queued', 'untouched');

        [first, queuedTarget].forEach(node => elements.set(node.id, node));
        addon.mermaid = {
            async run({nodes: [node]}) {
                calls.push(node.textContent);
                entered.resolve();
                await release.promise;
                throw new Error('late failure')
            }
        };

        const initial = addon.render({id: first.id, code: 'active'});
        await entered.promise;
        const queued   = addon.render({id: queuedTarget.id, code: 'never starts'}),
              requests = addon.pendingRenders;

        addon.destroy();
        release.resolve();
        await Promise.all([initial, queued, addon.render({id: first.id, code: 'after destroy'})]);

        expect(calls).toEqual(['active']);
        expect(first.textContent).toBe('active');
        expect(queuedTarget.textContent).toBe('untouched');
        expect(errors).toEqual([]);
        expect(requests.size).toBe(0)
    })
});
