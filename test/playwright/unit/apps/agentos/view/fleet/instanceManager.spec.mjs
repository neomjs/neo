import {setup} from '../../../../../setup.mjs';

const appName = 'FleetInstanceManagerTest';

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

test.describe('InstanceManager — the manage drawer, constructed (#17328)', () => {
    let InstanceManager, FleetInstances, createFleetProfile;

    const localId = 'fleet-profile:v1:http://127.0.0.1:8083/fleet';

    test.beforeAll(async () => {
        InstanceManager    = (await import('../../../../../../../apps/agentos/view/fleet/InstanceManager.mjs')).default;
        FleetInstances     = (await import('../../../../../../../apps/agentos/store/FleetInstances.mjs')).default;
        createFleetProfile = (await import('../../../../../../../apps/agentos/fleet/connectionProfiles.mjs')).createFleetProfile
    });

    const makeStore = () => Neo.create(FleetInstances, {data: [
        {...createFleetProfile({custodian: 'session-only', endpoint: 'http://127.0.0.1:8083/fleet', label: 'local'})}
    ]});

    const makePane = store => Neo.create(InstanceManager, {appName, boundProfileId: localId, instanceStore: store});

    test('the custodian ladder renders ALL THREE shapes with availability as TEXT — the unavailable legs teach instead of vanishing', () => {
        const store = makeStore(),
              pane  = makePane(store);

        const rows = pane.items[2].items.find(item => item.cls?.includes('fm-im-custodians')).vdom.cn;

        expect(rows).toHaveLength(3);
        expect(rows[0].cls).toContain('is-available');
        expect(rows[0].text).toContain('session-only');
        // the unavailable legs say WHAT they are and that they are unavailable — no internal
        // tracking ref in operator-facing text (it rots exactly like a ticket ref in a comment)
        expect(rows[1].cls).toContain('is-unavailable');
        expect(rows[1].text).toMatch(/electron-main — not available in this build/);
        expect(rows[2].cls).toContain('is-unavailable');
        expect(rows[2].text).toMatch(/env-indirection — not available in this build/);
        expect(rows.some(row => /#\d{4,}/.test(row.text))).toBe(false);

        pane.destroy();
        store.destroy()
    });

    test('the list marks the bound row with the WORD "bound" beside the badge — a second non-hue channel', () => {
        const store = makeStore(),
              pane  = makePane(store);

        const row = pane.getReference('instance-list').vdom.cn[0];

        expect(row.cls).toContain('is-bound');
        expect(row.cn[0].cn.map(cell => cell.text)).toContain('bound');
        expect(row.cn[1].text).toBe('Probe');
        expect(row.cn[2].text).toBe('Retire');

        pane.destroy();
        store.destroy()
    });

    test('selection flips the editor into label-edit mode: the endpoint field DISABLES (identity is immutable), the action retitles', () => {
        const store = makeStore(),
              pane  = makePane(store);

        pane.selectedProfileId = localId;

        expect(pane.getReference('endpoint-field').disabled).toBe(true);
        expect(pane.getReference('endpoint-field').value).toBe('http://127.0.0.1:8083/fleet');
        expect(pane.getReference('label-field').value).toBe('local');
        expect(pane.getReference('save-button').text).toBe('Save label');

        pane.selectedProfileId = null;
        expect(pane.getReference('endpoint-field').disabled).toBe(false);
        expect(pane.getReference('save-button').text).toBe('Add');

        pane.destroy();
        store.destroy()
    });

    test('save fires the intent with the field values — the C1 module (controller-side) stays the only validity authority', () => {
        const store = makeStore(),
              pane  = makePane(store),
              fired = [];

        pane.on('saveinstance', data => fired.push(data));

        pane.getReference('endpoint-field').value = 'https://fleet.example.io/fleet';
        pane.getReference('label-field').value    = 'cloud-eu';
        pane.onSaveClick();

        expect(fired).toHaveLength(1);
        expect(fired[0]).toMatchObject({endpoint: 'https://fleet.example.io/fleet', label: 'cloud-eu', profileId: null});

        pane.destroy();
        store.destroy()
    });

    test('CUSTODY-CRITICAL: both credential fields clear in the same tick their intents fire — entry to closure in one action, no Body-state residence', () => {
        const store = makeStore(),
              pane  = makePane(store),
              fired = [];

        pane.on('connectinstance', data => fired.push(['bearer', data.bearerToken, data.profileId]));
        pane.on('connectplane',    data => fired.push(['pat', data.credential, data.tenantUrl]));

        const bearerField = pane.getReference('bearer-field');
        const patField    = pane.getReference('pat-field');

        bearerField.value = 'e'.repeat(43);
        pane.onConnectClick();
        // the Text field normalizes empty to null — the point is the BEARER is gone from the field
        expect(bearerField.value).toBeNull();
        expect(fired[0]).toEqual(['bearer', 'e'.repeat(43), localId]);

        pane.getReference('tenant-url-field').value = 'https://mc.example.io';
        patField.value = 'ghp_exampletoken';
        pane.onAdmitClick();
        expect(patField.value).toBeNull();
        expect(fired[1]).toEqual(['pat', 'ghp_exampletoken', 'https://mc.example.io']);

        pane.destroy();
        store.destroy()
    });

    test('the notice line renders GIVEN outcomes verbatim with the tone as class — this surface invents no outcome text', () => {
        const store = makeStore(),
              pane  = makePane(store);

        pane.notice = {tone: 'refused', text: 'tenant endpoint unreachable'};

        const line = pane.getReference('notice-line');

        expect(line.text).toBe('tenant endpoint unreachable');
        expect(line.cls).toContain('is-refused');

        pane.notice = null;
        expect(pane.getReference('notice-line').text).toBe('');

        pane.destroy();
        store.destroy()
    })
});
