import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetInstanceSwitcherTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs';

test.describe('InstanceSwitcher — framework button + Store-backed menu (#17367)', () => {
    let Button, InstanceSwitcher, FleetInstances, createFleetProfile;

    const
        localId = 'fleet-profile:v1:http://127.0.0.1:8083/fleet',
        cloudId = 'fleet-profile:v1:https://fleet.example.io/fleet';

    test.beforeAll(async () => {
        Button             = (await import('../../../../../../../../src/button/Base.mjs')).default;
        InstanceSwitcher   = (await import('../../../../../../../../apps/agentos/view/fleet/instances/SwitcherButton.mjs')).default;
        FleetInstances     = (await import('../../../../../../../../apps/agentos/store/FleetInstances.mjs')).default;
        createFleetProfile = (await import('../../../../../../../../apps/agentos/fleet/connectionProfiles.mjs')).createFleetProfile
    });

    const makeStore = () => Neo.create(FleetInstances, {data: [
        {...createFleetProfile({custodian: 'session-only', endpoint: 'http://127.0.0.1:8083/fleet', label: 'local'})},
        {...createFleetProfile({custodian: 'session-only', endpoint: 'https://fleet.example.io/fleet', label: 'cloud-eu'})}
    ]});

    const waitForMenu = async switcher => {
        await expect.poll(() => Boolean(switcher.menuList)).toBe(true);
        return switcher.menuList
    };

    test('the switcher IS a button.Base and keeps the exact accessible-name contract', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});
        const root     = switcher.getVdomRoot();

        expect(switcher).toBeInstanceOf(Button);
        expect(root.tag).toBe('button');
        expect(root['aria-haspopup']).toBe('menu');
        expect(root['aria-expanded']).toBe('false');
        expect(root['aria-label']).toBe('Instance: local — connected');
        expect(switcher.textNode.cn[0].cls).toEqual(expect.arrayContaining(['fm-state-dot', 'fm-state-ok']));
        expect(switcher.textNode.cn[0]['aria-hidden']).toBe('true');
        expect(switcher.textNode.cn[1].text).toBe('local');

        const menu = await waitForMenu(switcher);
        expect(menu.store).toBe(store);
        expect(menu.autoDestroyStore).toBe(false);

        switcher.destroy();
        expect(store.isDestroyed).not.toBe(true);
        store.destroy()
    });

    test('honest absence: an unknown bound profile renders the endpoint-less fallback', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: 'fleet-profile:v1:http://gone/fleet', instanceState: 'off', instanceStore: store});

        expect(switcher.getVdomRoot()['aria-label']).toBe('Instance: no instance — not connected');

        await waitForMenu(switcher);
        switcher.destroy();
        store.destroy()
    });

    test('menu.List renders the provider Store records plus one terminal manage item; bound state is structural', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});
        const menu     = await waitForMenu(switcher);

        menu.createItems(true);

        expect(menu.getVdomRoot().role).toBe('menu');
        expect(menu.vdom.cn).toHaveLength(4);

        const
            profileRows = menu.vdom.cn.filter(item => item.cls?.includes('fm-instance-row')),
            localRow    = profileRows.find(item => item['data-profile-id'] === localId),
            cloudRow    = profileRows.find(item => item['data-profile-id'] === cloudId);

        expect(profileRows).toHaveLength(2);
        expect(localRow.role).toBe('menuitemradio');
        expect(localRow.cls).toContain('is-bound');
        expect(localRow['aria-checked']).toBe('true');
        expect(cloudRow.cls).not.toContain('is-bound');
        expect(cloudRow['aria-checked']).toBe('false');
        expect(cloudRow.cn[1].text).toBe('cloud-eu');
        expect(cloudRow.cn[2].text).toBe('https://fleet.example.io/fleet');
        expect(cloudRow.cn[3].text).toBe('session-only');
        expect(menu.vdom.cn.at(-1).cls).toContain('fm-instance-manage');
        expect(menu.vdom.cn.at(-1).role).toBe('menuitem');

        switcher.destroy();
        store.destroy()
    });

    test('Store add while the menu is hidden rebuilds the Store-backed profile rows', async () => {
        const
            localProfile = {...createFleetProfile({
                custodian: 'session-only',
                endpoint : 'http://127.0.0.1:8083/fleet',
                label    : 'local'
            })},
            cloudProfile = {...createFleetProfile({
                custodian: 'session-only',
                endpoint : 'https://fleet.example.io/fleet',
                label    : 'cloud-eu'
            })},
            store        = Neo.create(FleetInstances, {data: [localProfile]}),
            switcher     = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store}),
            menu         = await waitForMenu(switcher),
            profileRows  = () => menu.vdom.cn.filter(item => item.cls?.includes('fm-instance-row'));

        menu.createItems(true);

        expect(menu.hidden).toBe(true);
        expect(profileRows()).toHaveLength(1);

        store.add(cloudProfile);

        expect(menu.hidden).toBe(true);
        expect(profileRows()).toHaveLength(2);
        expect(profileRows().map(item => item['data-profile-id'])).toEqual([cloudId, localId]);

        switcher.destroy();
        store.destroy()
    });

    test('profile and manage choices preserve the controller-facing intent contracts', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});
        const switched = [], managed = [];

        switcher.on('switchinstance', data => switched.push(data.profileId));
        switcher.on('manageinstances', data => managed.push(data.source));

        switcher.onInstanceMenuSelect(store.get(cloudId));
        switcher.onInstanceMenuSelect(store.get(localId));
        switcher.onInstanceMenuManage();

        expect(switched).toEqual([cloudId]);
        expect(managed).toEqual([switcher.id]);

        await waitForMenu(switcher);
        switcher.destroy();
        store.destroy()
    });

    test('a state-word change replaces the trigger content without rebuilding the menu row set', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});
        const menu     = await waitForMenu(switcher);

        menu.createItems(true);

        const
            rowSetBefore    = menu.vdom.cn,
            triggerBefore   = switcher.textNode.cn,
            createItemsBase = menu.createItems;
        let rebuilds = 0;

        menu.createItems = () => rebuilds++;
        switcher.instanceState = 'limited';

        expect(rebuilds).toBe(0);
        expect(menu.vdom.cn).toBe(rowSetBefore);
        expect(switcher.textNode.cn).not.toBe(triggerBefore);
        expect(switcher.getVdomRoot()['aria-label']).toBe('Instance: local — degraded');

        menu.createItems = createItemsBase;
        switcher.destroy();
        store.destroy()
    });

    test('the body-level floating menu carries the owner viewport skin on every open', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});
        const menu     = await waitForMenu(switcher);

        switcher.getTheme = () => 'neo-theme-neo-light';
        switcher.syncMenuTheme(menu);

        expect(menu.cls).toContain('neo-theme-neo-light');
        expect(menu.cls).not.toContain('neo-theme-neo-dark');

        switcher.getTheme = () => 'neo-theme-neo-dark';
        switcher.syncMenuTheme(menu);

        expect(menu.cls).toContain('neo-theme-neo-dark');
        expect(menu.cls).not.toContain('neo-theme-neo-light');

        switcher.destroy();
        store.destroy()
    });

    test('roster load refreshes the trigger label while the menu owns its Store-driven rows', async () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});

        store.get(localId).label = 'renamed';
        store.fire('load');

        expect(switcher.textNode.cn[1].text).toBe('renamed');

        await waitForMenu(switcher);
        switcher.destroy();
        store.destroy()
    })
});
