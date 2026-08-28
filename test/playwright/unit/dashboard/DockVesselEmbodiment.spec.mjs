import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DockVesselEmbodimentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Component from '../../../../src/component/Base.mjs';
import Container from '../../../../src/container/Base.mjs';

import {
    createDockVesselEmbodiment,
    createDockVesselProxyEmbodiment
} from '../../../../src/dashboard/dock/window/VesselEmbodiment.mjs';

test.describe('Neo.dashboard.dock.window.VesselEmbodiment (#15396)', () => {
    let embodiment, pane, proxyEmbodiment, source, target;

    test.beforeEach(() => {
        source = Neo.create(Container, {
            items: [
                {module: Component, html: 'before'},
                {module: Component, html: 'live'},
                {module: Component, html: 'after'}
            ]
        });
        target = Neo.create(Container, {items: []});
        pane   = source.items[1];

        embodiment = createDockVesselEmbodiment({
            resolvePane  : itemId => itemId === 'live' ? pane : null,
            resolveTarget: windowId => windowId === 'admitted-window' ? target : null
        })
    });

    test.afterEach(() => {
        proxyEmbodiment?.destroy();
        proxyEmbodiment = null;
        embodiment?.destroy();
        source?.isDestroyed || source?.destroy();
        target?.isDestroyed || target?.destroy()
    });

    test('stages the same pane in the vessel while preserving the source card slot', async () => {
        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(true);
        expect(target.items).toEqual([pane]);
        expect(source.items).toHaveLength(3);
        expect(source.items[1]).not.toBe(pane);
        expect(source.items[1].cls).toContain('neo-dashboard-dock-vessel-placeholder');
        expect(source.items[1].hidden, 'the active source slot must never become an invisible void').toBe(false);
        expect(source.items[1].isLoading, 'staging must explain the temporary render ownership').toBe(
            'Moving pane to another window…'
        );
        expect(source.items[1].role, 'the transition explanation must be announced as status').toBe('status');
        expect(embodiment.isStaged('live')).toBe(true)
    });

    test('restores through the placeholder live index after sibling structure shifts', async () => {
        await embodiment.stage({itemId: 'live', windowId: 'admitted-window'});
        source.insert(0, {module: Component, html: 'new first'}, true);

        expect(embodiment.restore({itemId: 'live', windowId: 'admitted-window'})).toBe(true);
        expect(source.items[2]).toBe(pane);
        expect(target.items).not.toContain(pane);
        expect(embodiment.isStaged('live')).toBe(false)
    });

    test('promotion leaves the exact placeholder for committed projection cleanup', async () => {
        await embodiment.stage({itemId: 'live', windowId: 'admitted-window'});

        const placeholder = source.items[1];

        expect(embodiment.promote({itemId: 'live', windowId: 'admitted-window'})).toBe(true);
        expect(source.items[1]).toBe(placeholder);
        expect(target.items).toEqual([pane]);
        expect(embodiment.isStaged('live')).toBe(false)
    });

    test('a different or replayed vessel cannot steal an already-staged pane', async () => {
        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(true);
        expect(embodiment.stage({itemId: 'live', windowId: 'forged-window'})).toBe(false);
        expect(embodiment.restore({itemId: 'live', windowId: 'forged-window'})).toBe(false);
        expect(target.items).toEqual([pane]);
        expect(source.items[1].cls).toContain('neo-dashboard-dock-vessel-placeholder')
    });

    test('target insertion rejection restores the pane and retires the transient record', async () => {
        target.add = () => {
            throw new Error('target insertion rejected')
        };

        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(false);
        expect(source.items).toHaveLength(3);
        expect(source.items[1]).toBe(pane);
        expect(source.items.some(item => item.cls?.includes('neo-dashboard-dock-vessel-placeholder'))).toBe(false);
        expect(target.items).toEqual([]);
        expect(embodiment.isStaged('live')).toBe(false)
    });

    test('target update rejection restores the pane from the vessel through the live placeholder slot', async () => {
        const targetAdd = target.add.bind(target);

        target.add = item => {
            const result = targetAdd(item);

            target.promiseUpdate = async () => {
                throw new Error('target update rejected')
            };

            return result
        };

        await expect(embodiment.stage({itemId: 'live', windowId: 'admitted-window'})).resolves.toBe(false);
        expect(source.items).toHaveLength(3);
        expect(source.items[1]).toBe(pane);
        expect(source.items.some(item => item.cls?.includes('neo-dashboard-dock-vessel-placeholder'))).toBe(false);
        expect(target.items).toEqual([]);
        expect(embodiment.isStaged('live')).toBe(false)
    })

    test('a parked source renderer cannot veto the target readability settlement', async () => {
        source.promiseUpdate = () => {
            throw new Error('parked source renderer does not acknowledge frames')
        };

        await expect(embodiment.stage({
            itemId  : 'live',
            windowId: 'admitted-window'
        })).resolves.toBe(true);

        expect(target.items).toEqual([pane]);
        expect(source.items[1].cls).toContain('neo-dashboard-dock-vessel-placeholder');
        expect(embodiment.isStaged('live')).toBe(true)
    })

    test('publication does not wait forever on a parked source transaction', async () => {
        let sourceStarted = false;

        source.promiseUpdate = () => {
            sourceStarted = true;

            return new Promise(() => {})
        };

        await expect(embodiment.stage({
            itemId  : 'live',
            windowId: 'admitted-window'
        })).resolves.toBe(true);
        expect(sourceStarted).toBe(true);
        expect(target.items).toEqual([pane]);
        expect(embodiment.isStaged('live')).toBe(true)
    })
});

test.describe('Neo.dashboard.DockVesselProxyEmbodiment (#16090)', () => {
    let pane, proxyEmbodiment, source;

    test.beforeEach(() => {
        source = Neo.create(Container, {
            items: [
                {module: Component, html: 'before'},
                {module: Component, html: 'live'},
                {module: Component, html: 'after'}
            ]
        });
        pane = source.items[1];
        pane.dockItemId = 'live'
    });

    test.afterEach(() => {
        proxyEmbodiment?.destroy();
        source?.isDestroyed || source?.destroy()
    });

    /**
     * @summary Creates a non-mounted proxy fixture that preserves live children on destroy.
     * @param {Object} [options={}]
     * @param {Boolean} [options.deferFirst=false]
     * @returns {Object}
     */
    function createFixture({deferFirst=false}={}) {
        const
            proxies        = [],
            sourceSortZone = {
                getDragProxyConfig: () => ({
                    cls: ['neo-tab-header-toolbar', 'neo-dock-dragproxy', 'neo-theme-dark']
                }),
                windowId: 'source-window'
            };
        let resolveFirst,
            sourceUpdateCount = 0,
            targetUpdateCount = 0;

        const sourcePromiseUpdate = source.promiseUpdate.bind(source);

        source.promiseUpdate = (...args) => {
            sourceUpdateCount++;

            return sourcePromiseUpdate(...args)
        };

        proxyEmbodiment = createDockVesselProxyEmbodiment({
            createProxy: config => {
                const proxy = Neo.create(Container, {
                    cls  : config.cls,
                    items: []
                });

                proxy.height   = config.height;
                proxy.style    = config.style;
                proxy.width    = config.width;
                proxy.windowId = config.windowId;

                const proxyPromiseUpdate = proxy.promiseUpdate.bind(proxy);

                proxy.promiseUpdate = (...args) => {
                    targetUpdateCount++;

                    return deferFirst && proxies.length === 0
                        ? new Promise(resolve => resolveFirst = resolve)
                        : proxyPromiseUpdate(...args)
                };

                const destroy = proxy.destroy.bind(proxy);

                proxy.destroy = (...args) => {
                    proxy.items = [];
                    destroy(...args)
                };

                proxies.push(proxy);

                return proxy
            },
            resolvePane       : itemId => itemId === 'live' ? pane : null,
            resolveProxyConfig: ({sourceSortZone: zone}) => ({
                appName: 'DockVesselProxyEmbodimentTest',
                cls    : zone.getDragProxyConfig().cls
            })
        });

        return {
            move(x=20, sourceWindowId) {
                return proxyEmbodiment.move({
                    draggedItem   : pane,
                    proxyRect     : {height: 80, width: 160, x, y: 30},
                    sourceSortZone,
                    sourceWindowId,
                    targetWindowId: 'target-window'
                })
            },
            proxies,
            resolveFirst: () => resolveFirst?.(),
            updateCounts: () => ({source: sourceUpdateCount, target: targetUpdateCount})
        }
    }

    test('one target-local proxy follows pointer geometry and restores the exact parked-popup slot', async () => {
        const fixture = createFixture();

        expect(fixture.move()).toBe(true);
        expect(fixture.move(75)).toBe(true);
        expect(fixture.proxies).toHaveLength(1);

        await expect.poll(() => proxyEmbodiment.snapshot('live')?.settled).toBe(true);

        expect(fixture.updateCounts()).toEqual({source: 1, target: 1});
        expect(proxyEmbodiment.snapshot('live')).toMatchObject({
            cls           : expect.arrayContaining([
                'neo-tab-header-toolbar',
                'neo-dock-dragproxy',
                'neo-theme-dark'
            ]),
            itemId        : 'live',
            ownsPane      : true,
            settled       : true,
            sourceWindowId: 'source-window',
            targetWindowId: 'target-window',
            visible       : true
        });
        expect(fixture.proxies[0].style).toMatchObject({left: '75px', top: '30px'});
        expect(fixture.proxies[0].cls).toEqual(expect.arrayContaining([
            'neo-tab-header-toolbar',
            'neo-dock-dragproxy',
            'neo-theme-dark'
        ]));
        expect(source.items[1].cls).toContain('neo-dashboard-dock-vessel-placeholder');

        expect(proxyEmbodiment.restore({itemId: 'live'})).toBe(true);
        expect(source.items[1]).toBe(pane);
        expect(pane.isDestroyed).toBeFalsy();
        expect(fixture.proxies[0].isDestroyed).toBe(true);
        expect(proxyEmbodiment.snapshot('live')).toBeNull();
        expect(proxyEmbodiment.restore({itemId: 'live'})).toBe(false)
    });

    test('retained readability begins only after the exact proxy renderer generation settles', async () => {
        const fixture = createFixture({deferFirst: true});
        let observed;

        expect(fixture.move()).toBe(true);

        const settlement = proxyEmbodiment.whenSettled({
            itemId        : 'live',
            sourceWindowId: 'source-window',
            targetWindowId: 'target-window'
        }).then(value => observed = value);

        await Promise.resolve();
        expect(observed, 'synchronous staging is not renderer settlement').toBeUndefined();

        fixture.resolveFirst();

        await expect(settlement).resolves.toBe(true);
        expect(proxyEmbodiment.snapshot('live')).toMatchObject({
            ownsPane: true,
            settled : true,
            visible : true
        })
    });

    test('the parked popup identity overrides the originating sort-zone window', async () => {
        const fixture = createFixture();

        expect(fixture.move(20, 'parked-popup-window')).toBe(true);
        await expect.poll(() => proxyEmbodiment.snapshot('live')?.settled).toBe(true);

        expect(proxyEmbodiment.snapshot('live')).toMatchObject({
            sourceWindowId: 'parked-popup-window',
            targetWindowId: 'target-window'
        });
        expect(proxyEmbodiment.restoreByWindow('source-window')).toBe(false);
        expect(proxyEmbodiment.restoreByWindow('parked-popup-window')).toBe(true);
        expect(source.items[1]).toBe(pane)
    });

    test('commit promotion preserves pane identity while retiring the transient proxy exact-once', async () => {
        const fixture = createFixture();

        expect(fixture.move()).toBe(true);
        await expect.poll(() => proxyEmbodiment.snapshot('live')?.settled).toBe(true);

        const placeholder = source.items[1];

        expect(proxyEmbodiment.promote({
            itemId        : 'live',
            sourceWindowId: 'source-window',
            targetWindowId: 'target-window'
        })).toBe(true);
        expect(source.items[1]).toBe(placeholder);
        expect(pane.isDestroyed).toBeFalsy();
        expect(fixture.proxies[0].isDestroyed).toBe(true);
        expect(proxyEmbodiment.snapshot('live')).toBeNull();
        expect(proxyEmbodiment.promote({itemId: 'live'})).toBe(false)
    });

    test('a late predecessor settlement cannot retire a restored successor generation', async () => {
        const fixture = createFixture({deferFirst: true});

        expect(fixture.move()).toBe(true);
        expect(proxyEmbodiment.restore({itemId: 'live'})).toBe(true);
        expect(fixture.move(90)).toBe(true);

        await expect.poll(() => proxyEmbodiment.snapshot('live')?.settled).toBe(true);

        const successor = proxyEmbodiment.snapshot('live');

        fixture.resolveFirst();
        await Promise.resolve();
        await Promise.resolve();

        expect(successor.generation).toBe(2);
        await expect(proxyEmbodiment.whenSettled({
            itemId        : 'live',
            sourceWindowId: 'source-window',
            targetWindowId: 'target-window'
        })).resolves.toBe(true);
        expect(proxyEmbodiment.snapshot('live')).toMatchObject({
            generation: 2,
            ownsPane  : true,
            settled   : true,
            visible   : true
        });
        expect(fixture.proxies[0].isDestroyed).toBe(true);
        expect(fixture.proxies[1].isDestroyed).toBeFalsy()
    });

    test('disconnect cleanup matches either exact participating window and is idempotent', async () => {
        const fixture = createFixture();

        expect(fixture.move()).toBe(true);

        expect(proxyEmbodiment.restoreByWindow('unrelated-window')).toBe(false);
        expect(proxyEmbodiment.snapshot('live')).not.toBeNull();
        expect(proxyEmbodiment.restoreByWindow('source-window')).toBe(true);
        expect(proxyEmbodiment.restoreByWindow('target-window')).toBe(false);
        expect(source.items[1]).toBe(pane)
    })
});
