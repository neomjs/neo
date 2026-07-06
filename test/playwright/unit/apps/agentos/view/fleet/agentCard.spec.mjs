import {setup} from '../../../../../setup.mjs';

const appName = 'FleetAgentCardTest';

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

test.describe('Fleet cockpit AgentCard — resident card composing the class primitives + avatar (#14755)', () => {
    let AgentCard;

    const readData = (card, key) => card.getStateProvider().getDataConfig(key).get();

    const createCard = data => Neo.create(AgentCard, {appName, stateProvider: {data}});

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../apps/agentos/view/fleet/AgentCard.mjs');
        AgentCard = mod.default
    });

    test('is a data-driven card composing the class primitives + the avatar — one provider surface', () => {
        const card = createCard({
            agentId: 'vega', avatarUrl: 'vega.png', displayName: 'Vega', family: 'claude', engineTag: 'opus-4.8', state: 'wedged'
        });

        // the per-card provider is the single binding surface (data-driven, no per-field config threading)
        expect(card.getStateProvider()).not.toBeNull();
        expect(readData(card, 'state')).toBe('wedged');
        expect(readData(card, 'family')).toBe('claude');
        expect(readData(card, 'avatarUrl')).toBe('vega.png');

        // composes the class primitives (FamilyRail + StateDot) and the avatar Image
        expect(card.down({ntype: 'fm-family-rail'})).toBeTruthy();
        expect(card.down({ntype: 'fm-state-dot'})).toBeTruthy();
        expect(card.down({ntype: 'image'})).toBeTruthy();

        card.destroy()
    });

    test('ADR-0032: avatar/name/engine are display state over the durable id — setState re-renders in place, never a re-key', () => {
        const card     = createCard({agentId: 'vega', displayName: 'Vega', avatarUrl: 'a.png', engineTag: 'opus-4.8', state: 'ok'});
        const beforeId = card.id;

        card.setState({displayName: 'Vega (renamed)', avatarUrl: 'b.png', engineTag: 'fable-5'});

        // the SAME instance — identity is the durable agentId, not the presentation
        expect(card.id).toBe(beforeId);
        expect(readData(card, 'agentId')).toBe('vega');
        expect(readData(card, 'displayName')).toBe('Vega (renamed)');
        expect(readData(card, 'avatarUrl')).toBe('b.png');
        expect(readData(card, 'engineTag')).toBe('fable-5');
        // a display-state change never disturbs the session-state axis
        expect(readData(card, 'state')).toBe('ok');

        card.destroy()
    });

    test('family rebind in place (§2.3.3) — a cross-family swap is the SAME resident, not a new self', () => {
        const card     = createCard({agentId: 'vega', family: 'claude', state: 'ok'});
        const beforeId = card.id;

        card.setState('family', 'gpt');

        expect(card.id).toBe(beforeId);
        expect(readData(card, 'family')).toBe('gpt')

        card.destroy()
    });

    test('B4: a control fires one lifecycleIntent {action, agentId} — the forward seam Lane-C (C2) consumes; the card never calls the bridge (#14611)', () => {
        const card  = createCard({agentId: 'vega', state: 'off'});
        const fired = [];

        card.on('lifecycleIntent', data => fired.push(data));

        const verbs   = card.down({reference: 'control-verbs'});
        const toggle  = verbs.items[0];
        const restart = verbs.items[1];
        expect(restart.action).toBe('restart');

        // off → the toggle IS start (▶) and restart is hidden (a stopped resident starts via the toggle;
        // no disabled play beside a redundant restart)
        expect(toggle.iconCls).toBe('fa-solid fa-play');
        expect(restart.hidden).toBe(true);
        card.getController().onToggleLifecycle();
        expect(fired).toMatchObject([{action: 'start', agentId: 'vega'}]);

        // running → the SAME toggle is now stop (■) and restart appears
        fired.length = 0;
        card.setState('state', 'ok');
        expect(toggle.iconCls).toBe('fa-solid fa-stop');
        expect(restart.hidden).toBe(false);
        card.getController().onToggleLifecycle();
        expect(fired).toMatchObject([{action: 'stop', agentId: 'vega'}]);

        // restart fires restart; the card never calls the bridge — that round-trip is Lane-C (B4÷C2)
        fired.length = 0;
        card.getController().onLifecycleIntent({component: restart});
        expect(fired).toMatchObject([{action: 'restart', agentId: 'vega'}]);

        card.destroy()
    });

    test('B4 honest state: a pending action disables every verb + renders it pending; a controlReason renders the reason — no optimistic success (#14611)', () => {
        const card   = createCard({agentId: 'vega', state: 'idle'});
        const verbs  = () => card.down({reference: 'control-verbs'}).items;
        const status = () => card.down({reference: 'control-status'});

        // idle + nothing pending: the power toggle is enabled, the status line is hidden
        expect(verbs()[0].disabled).toBe(false);
        expect(status().hidden).toBe(true);

        // Lane-C set a verb in flight → controls disabled (no second intent mid-round-trip); pending rendered
        card.setState('pendingAction', 'restart');
        expect(verbs().every(button => button.disabled)).toBe(true);
        expect(status().hidden).toBe(false);
        expect(status().text).toBe('restart…');

        // Lane-C rejected it → the honest reason renders; never an optimistic success
        card.setState({controlReason: {action: 'restart', kind: 'rejected', reason: 'harness offline'}, pendingAction: null});
        expect(status().hidden).toBe(false);
        expect(status().text).toBe('⚠ rejected: harness offline');

        // a NEW attempt takes visual priority over a stale reason (the clear-on-new-intent nuance, render side)
        card.setState('pendingAction', 'start');
        expect(status().text).toBe('start…');

        card.destroy()
    });
});
