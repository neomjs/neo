import {setup} from '../../../../../setup.mjs';

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
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import Instance       from '../../../../../../../src/manager/Instance.mjs';

test.describe('InstanceSwitcher — the chrome scope control, constructed (#17328)', () => {
    let InstanceSwitcher, FleetInstances, createFleetProfile;

    const localId = 'fleet-profile:v1:http://127.0.0.1:8083/fleet';

    test.beforeAll(async () => {
        InstanceSwitcher   = (await import('../../../../../../../apps/agentos/view/fleet/InstanceSwitcher.mjs')).default;
        FleetInstances     = (await import('../../../../../../../apps/agentos/store/FleetInstances.mjs')).default;
        createFleetProfile = (await import('../../../../../../../apps/agentos/fleet/connectionProfiles.mjs')).createFleetProfile
    });

    const makeStore = () => Neo.create(FleetInstances, {data: [
        {...createFleetProfile({custodian: 'session-only', endpoint: 'http://127.0.0.1:8083/fleet', label: 'local'})},
        {...createFleetProfile({custodian: 'session-only', endpoint: 'https://fleet.example.io/fleet', label: 'cloud-eu'})}
    ]});

    test('the accessible name IS the tested surface: "Instance: <label> — <state word>" (the review-adopted AC), with the dot as a decorated second channel', () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});

        const trigger = switcher.vdom.cn[0];

        expect(trigger['aria-label']).toBe('Instance: local — connected');
        expect(trigger.cn[0].cls).toContain('fm-state-dot');
        expect(trigger.cn[0].cls).toContain('fm-state-ok');
        expect(trigger.cn[0]['aria-hidden']).toBe('true');
        expect(trigger.cn[1].text).toBe('local');

        // menu closed: the reveal panel does not exist (dismissed chrome leaves the tree)
        expect(switcher.vdom.cn).toHaveLength(1);

        switcher.destroy();
        store.destroy()
    });

    test('honest absence: an unknown bound profile renders the endpoint-less fallback, never an invented identity', () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: 'fleet-profile:v1:http://gone/fleet', instanceState: 'off', instanceStore: store});

        expect(switcher.vdom.cn[0]['aria-label']).toBe('Instance: no instance — not connected');

        switcher.destroy();
        store.destroy()
    });

    test('the open menu renders every profile row + the manage terminal row; the BOUND row is marked structurally (aria-checked + is-bound), never hue-alone', () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store, menuOpen: true});

        const menu = switcher.vdom.cn[1];

        expect(menu.role).toBe('menu');
        // 2 profile rows + separator + manage row
        expect(menu.cn).toHaveLength(4);

        const [cloudRow, localRow] = [menu.cn.find(r => r.cn?.[1]?.text === 'cloud-eu'), menu.cn.find(r => r.cn?.[1]?.text === 'local')];

        expect(localRow.cls).toContain('is-bound');
        expect(localRow['aria-checked']).toBe('true');
        expect(cloudRow.cls).not.toContain('is-bound');
        expect(cloudRow['aria-checked']).toBe('false');

        // an unreachable/unbound instance stays PICKABLE — a broken profile must remain fixable
        expect(cloudRow.tag).toBe('button');
        expect(cloudRow.cn[2].text).toBe('https://fleet.example.io/fleet');
        expect(cloudRow.cn[3].text).toBe('session-only');

        expect(menu.cn[3].cls).toContain('fm-instance-manage');

        switcher.destroy();
        store.destroy()
    });

    test('row pick fires the switch INTENT with the profileId and closes the menu; picking the bound row only closes — no churn reconnect', () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store, menuOpen: true});
        const fired    = [];

        switcher.on('switchinstance', data => fired.push(data.profileId));

        const cloudId = 'fleet-profile:v1:https://fleet.example.io/fleet';

        switcher.onSwitcherRowClick({path: [{data: {profileId: cloudId}}]});
        expect(fired).toEqual([cloudId]);
        expect(switcher.menuOpen).toBe(false);

        switcher.menuOpen = true;
        switcher.onSwitcherRowClick({path: [{data: {profileId: localId}}]});
        expect(fired).toEqual([cloudId]);
        expect(switcher.menuOpen).toBe(false);

        switcher.destroy();
        store.destroy()
    });

    test('the manage row fires its intent; a roster load re-renders the label without a reactive-data detour', () => {
        const store    = makeStore();
        const switcher = Neo.create(InstanceSwitcher, {appName, boundProfileId: localId, instanceState: 'ok', instanceStore: store});
        const fired    = [];

        switcher.on('manageinstances', () => fired.push(true));
        switcher.onSwitcherManageClick({});
        expect(fired).toHaveLength(1);

        // label edit lands in the store → the load event path re-renders the chip
        store.get(localId).label = 'renamed';
        store.fire('load');
        expect(switcher.vdom.cn[0].cn[1].text).toBe('renamed');

        switcher.destroy();
        store.destroy()
    })
});
