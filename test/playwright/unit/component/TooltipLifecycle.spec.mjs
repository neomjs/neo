import {setup} from '../../setup.mjs';

const appName = 'ComponentTooltipLifecycleTest';

setup({appConfig: {name: appName}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Component       from '../../../../src/component/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Tooltip         from '../../../../src/tooltip/Base.mjs';

/**
 * @summary Pins `Neo.component.Base` tooltip lifecycle across async `import('../tooltip/Base.mjs')` boundaries,
 * shared-to-`ownInstance` reconfiguration, and owner `destroy()` teardown.
 */
test.describe('Neo.component.Base: tooltip lifecycle and destroy cleanup', () => {
    let created = [];

    const track = instance => {
        created.push(instance);
        return instance
    };

    const flushTooltipImport = async () => {
        await import('../../../../src/tooltip/Base.mjs');
        await Promise.resolve()
    };

    test.afterEach(() => {
        Neo.ns('Neo.tooltip', true).Base = Tooltip;

        while (created.length) {
            const instance = created.pop();
            instance?.isDestroyed || instance?.destroy?.()
        }
    });

    test('destroying a component before dynamic tooltip import settles emits no post-destroy write and leaks no ownInstance tooltip', async () => {
        const warnings = [],
              origWarn = console.warn;

        console.warn = (...args) => warnings.push(args.join(' '));

        try {
            delete Neo.tooltip.Base;

            const sharedOwner = track(Neo.create(Component, {
                appName,
                id     : 'tooltip-async-destroyed-shared',
                tooltip: 'Theme'
            }));

            const ownOwner = track(Neo.create(Component, {
                appName,
                id     : 'tooltip-async-destroyed-own',
                tooltip: {ownInstance: true, text: 'Dedicated'}
            }));

            sharedOwner.destroy();
            ownOwner.destroy();
            Neo.tooltip.Base = Tooltip;

            await flushTooltipImport();

            const leakedTooltips = [...InstanceManager.items.values()].filter(
                item => item instanceof Tooltip && item.componentId === 'tooltip-async-destroyed-own'
            );

            leakedTooltips.forEach(item => item.destroy());

            expect(warnings.filter(msg => msg.includes('was set after destroy'))).toEqual([]);
            expect(leakedTooltips).toHaveLength(0)
        } finally {
            Neo.tooltip.Base = Tooltip;
            console.warn     = origWarn
        }
    });

    test('clearing or cycling tooltip (A -> null -> A) while dynamic import is in flight cancels stale continuations', async () => {
        delete Neo.tooltip.Base;

        const cleared = track(Neo.create(Component, {
            appName,
            id     : 'tooltip-async-cleared',
            tooltip: 'First'
        }));

        cleared.tooltip = null;

        const cycled = track(Neo.create(Component, {
            appName,
            id     : 'tooltip-async-cycled',
            tooltip: 'Same'
        }));

        let   createCalls = 0;
        const origCreate  = cycled.createTooltip.bind(cycled);
        cycled.createTooltip = value => {
            createCalls++;
            return origCreate(value)
        };

        cycled.tooltip = null;
        cycled.tooltip = 'Same';

        Neo.tooltip.Base = Tooltip;
        await flushTooltipImport();

        expect(cleared.tooltip).toBeNull();
        expect(cleared.cls).not.toContain('neo-uses-shared-tooltip');
        expect(createCalls).toBe(1);
        expect(cycled.cls).toContain('neo-uses-shared-tooltip')
    });

    test('destroying a component destroys its ownInstance tooltip while preserving window shared singletons', () => {
        const sharedSingleton = track(Tooltip.createSingleton({mainView: null, name: appName}, 71)),
              ownOwner        = track(Neo.create(Component, {
                  appName,
                  id      : 'tooltip-own-owner',
                  tooltip : {ownInstance: true, showDelay: 50, text: 'Dedicated'},
                  windowId: 71
              })),
              sharedOwner     = track(Neo.create(Component, {
                  appName,
                  id      : 'tooltip-shared-owner',
                  tooltip : 'Shared',
                  windowId: 71
              })),
              ownTooltip      = ownOwner.tooltip;

        expect(ownTooltip).toBeInstanceOf(Tooltip);
        expect(ownTooltip.isDestroyed).toBeFalsy();

        ownOwner.destroy();
        sharedOwner.destroy();

        expect(ownTooltip.isDestroyed).toBe(true);
        expect(Neo.getComponent(ownTooltip.id)).toBeNull();
        expect(sharedSingleton.isDestroyed).toBeFalsy()
    });

    test('switching from a shared tooltip to ownInstance removes neo-uses-shared-tooltip', () => {
        const owner = track(Neo.create(Component, {
            appName,
            id     : 'tooltip-shared-to-own',
            tooltip: 'Shared first'
        }));

        expect(owner.cls).toContain('neo-uses-shared-tooltip');

        owner.tooltip = {ownInstance: true, text: 'Dedicated next'};

        expect(owner.tooltip).toBeInstanceOf(Tooltip);
        expect(owner.cls).not.toContain('neo-uses-shared-tooltip')
    })
});
