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

test.describe('Fleet cockpit AgentCard — resident card rendering its roster record (#14755)', () => {
    let AgentCard, FleetAgent, Store;

    const
        stores          = [],
        observedSources = {
            roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
        };

    // a real store-backed record — the production shape (an AgentOS.store.FleetRoster row). The
    // store mirrors FleetRoster's keyProperty (the collection default 'id' would shadow the model's).
    const makeRecord = data => {
        const row   = {...data, sources: data.sources === undefined ? observedSources : data.sources},
              store = Neo.create(Store, {keyProperty: 'agentId', model: FleetAgent, data: [row]});

        stores.push(store);

        return store.get(data.agentId)
    };

    const createCard = data => Neo.create(AgentCard, {appName, record: makeRecord(data)});

    // in the cockpit composition the GRID routes the store's recordChange to the card; standalone
    // card units drive the same seam directly: mutate the record, then apply it.
    const applySet = (card, values) => {
        card.record.set(values);
        card.applyRecord()
    };

    test.beforeAll(async () => {
        AgentCard  = (await import('../../../../../../../apps/agentos/view/fleet/AgentCard.mjs')).default;
        FleetAgent = (await import('../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store      = (await import('../../../../../../../src/data/Store.mjs')).default
    });

    test.afterAll(() => {
        stores.forEach(store => store.destroy());
        stores.length = 0
    });

    test('is a data-driven card composing the class primitives + the avatar — one record surface, zero providers', () => {
        const card = createCard({
            agentId: 'vega', avatarUrl: 'vega.png', displayName: 'Vega', family: 'claude', engineTag: 'opus-4.8', state: 'wedged'
        });

        // the roster record is the single data surface (no per-card state.Provider)
        expect(card.record.agentId).toBe('vega');
        expect(card.stateProvider ?? null).toBeNull();

        // composes the class primitives (FamilyRail + StateDot) and the avatar Image, fed from the record
        expect(card.down({ntype: 'fm-family-rail'}).family).toBe('claude');
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('wedged');
        expect(card.down({ntype: 'image'}).src).toBe('vega.png');
        expect(card.down({reference: 'card-name'}).text).toBe('Vega');
        expect(card.down({reference: 'card-engine'}).text).toBe('opus-4.8');

        card.destroy()
    });

    test('a plain field-bag record renders the same snapshot — the dock-blueprint restore shape', () => {
        const card = Neo.create(AgentCard, {appName, record: {agentId: 'ghost', displayName: 'Ghost', sources: observedSources, state: 'ok'}});

        expect(card.down({reference: 'card-name'}).text).toBe('Ghost');
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('ok');

        card.destroy()
    });

    test('source markers update in place; absent runtime fails the state dot closed and never pulses', () => {
        const card     = createCard({agentId: 'vega', state: 'ok'}),
              beforeId = card.id,
              runtime  = card.down({reference: 'source-runtime'}),
              markerId = runtime.id,
              stateDot = card.down({ntype: 'fm-state-dot'});

        expect(runtime.text).toBe('RUN OBSERVED');
        expect(stateDot.state).toBe('ok');
        expect(stateDot.live).toBe(true);

        applySet(card, {sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'missing', confidence: 'none'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}
        }});

        expect(card.id).toBe(beforeId);
        expect(card.down({reference: 'source-runtime'}).id).toBe(markerId);
        expect(runtime.text).toBe('RUN NOT WIRED');
        expect(card.down({reference: 'source-repo-status'}).text).toBe('REP MISSING');
        expect(stateDot.state).toBe('off');
        expect(stateDot.live).toBe(false);
        expect(card.down({reference: 'control-toggle'}).iconCls).toBe('fa-solid fa-stop');
        expect(card.down({reference: 'control-toggle'}).disabled).toBe(true);
        expect(card.down({reference: 'control-restart'}).hidden).toBe(false);
        expect(card.down({reference: 'control-restart'}).disabled).toBe(true);
        expect(card.down({reference: 'control-status'}).text).toBe('NOT WIRED');

        applySet(card, {sources: {
            ...observedSources,
            runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'inferred'}
        }});
        expect(runtime.text).toBe('RUN INFERRED');
        expect(stateDot.state).toBe('ok');
        expect(stateDot.live).toBe(false);
        expect(card.down({reference: 'control-toggle'}).disabled).toBe(false);
        expect(card.down({reference: 'control-status'}).hidden).toBe(true);

        card.destroy()
    });

    test('ADR-0032: avatar/name/engine are display state over the durable id — a record write re-renders in place, never a re-key', () => {
        const card     = createCard({agentId: 'vega', displayName: 'Vega', avatarUrl: 'a.png', engineTag: 'opus-4.8', state: 'ok'});
        const beforeId = card.id;

        applySet(card, {displayName: 'Vega (renamed)', avatarUrl: 'b.png', engineTag: 'fable-5'});

        // the SAME instance — identity is the durable agentId, not the presentation
        expect(card.id).toBe(beforeId);
        expect(card.record.agentId).toBe('vega');
        expect(card.down({reference: 'card-name'}).text).toBe('Vega (renamed)');
        expect(card.down({ntype: 'image'}).src).toBe('b.png');
        expect(card.down({reference: 'card-engine'}).text).toBe('fable-5');
        // a display-state change never disturbs the session-state axis
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('ok');

        card.destroy()
    });

    test('family rebind in place (§2.3.3) — a cross-family swap is the SAME resident, not a new self', () => {
        const card     = createCard({agentId: 'vega', family: 'claude', state: 'ok'});
        const beforeId = card.id;

        applySet(card, {family: 'gpt'});

        expect(card.id).toBe(beforeId);
        expect(card.down({ntype: 'fm-family-rail'}).family).toBe('gpt');

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
        applySet(card, {state: 'ok'});
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

    test('drill-in (gate-1): the dedicated native drill Button fires ONE agentSelect {agentId}', () => {
        const card  = createCard({agentId: 'vega', displayName: 'Vega', state: 'ok'});
        const fired = [];

        card.on('agentSelect', data => fired.push(data));

        // the drill target is a dedicated native <button> (the resident's name), NOT the card root — so the
        // controller no longer needs the old key/control-path carve-out (toggle/restart are separate sibling
        // Buttons with their own lifecycleIntent handlers that never reach onCardSelect). Activation fires
        // ONE agentSelect; the controller reads the durable agentId off the record, intent-only.
        const drill = card.down({reference: 'card-name'});
        expect(drill.vdom.tag).toBe('button');
        expect(drill.text).toBe('Vega');

        card.getController().onCardSelect({component: drill});
        expect(fired).toMatchObject([{agentId: 'vega'}]);

        card.destroy()
    });

    test('a11y shape (gate-1): a non-interactive listitem card + a native drill Button announced by the resident name (#14619)', () => {
        const card = createCard({agentId: 'vega', displayName: 'Vega', state: 'ok'});

        // the card ROOT is a non-interactive listitem — NOT role=button, NOT focusable, NO card-level
        // aria-label. The FM roster is a ranked responsive list, not a 2D data matrix, so the card is a
        // list item and keyboard operability lives on its native child Buttons (drill / toggle / restart).
        expect(card.vdom.role).toBe('listitem');
        expect(card.vdom.tabIndex ?? null).toBeNull();
        expect(card.vdom['aria-label'] ?? null).toBeNull();

        // the drill is a dedicated native <button> whose accessible name IS the resident's name (it
        // announces "Vega, button"); native Enter/Space activation is a browser behavior proven in the
        // mounted whitebox-e2e. Its cls carries `neo-selection` so the FleetGrid drill-to-drill Up/Down
        // jump's scroll-suppression is scoped to the drill target, not the whole card.
        const drill = card.down({reference: 'card-name'});
        expect(drill.vdom.tag).toBe('button');
        expect(drill.text).toBe('Vega');
        expect(drill.cls).toContain('fm-card-drill');
        expect(drill.cls).toContain('neo-selection');

        // the accessible name is record-derived display state — a rename updates it in place (never a re-key)
        applySet(card, {displayName: 'Vega (renamed)'});
        expect(drill.text).toBe('Vega (renamed)');

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
        applySet(card, {pendingAction: 'restart'});
        expect(verbs().every(button => button.disabled)).toBe(true);
        expect(status().hidden).toBe(false);
        expect(status().text).toBe('restart…');

        // Lane-C rejected it → the honest reason renders; never an optimistic success
        applySet(card, {controlReason: {action: 'restart', kind: 'rejected', reason: 'harness offline'}, pendingAction: null});
        expect(status().hidden).toBe(false);
        expect(status().text).toBe('⚠ rejected: harness offline');

        // a NEW attempt takes visual priority over a stale reason (the clear-on-new-intent nuance, render side)
        applySet(card, {pendingAction: 'start'});
        expect(status().text).toBe('start…');

        card.destroy()
    });

    test('observe: a pending action renders the state dot as a distinct transitional state, never the stale resolved one (#14978)', () => {
        const card = createCard({agentId: 'vega', state: 'off'});
        const dot  = () => card.down({ntype: 'fm-state-dot'});

        // off + nothing pending: the dot is the resolved off state
        expect(dot().state).toBe('off');

        // a start intent is in flight → the primary glyph must read 'starting', not the stale 'off'
        // (which reads as "stopped" and disagrees with the 'start…' status text)
        applySet(card, {pendingAction: 'start'});
        expect(dot().state).toBe('starting');
        expect(dot().live).toBe(false);

        // a stop intent in flight → 'stopping'; restart (transitioning toward running) → 'starting'
        applySet(card, {pendingAction: 'stop'});
        expect(dot().state).toBe('stopping');
        applySet(card, {pendingAction: 'restart'});
        expect(dot().state).toBe('starting');

        // the intent settles: pending clears, the dot returns to the resolved runtime state
        applySet(card, {pendingAction: null, state: 'ok'});
        expect(dot().state).toBe('ok');

        card.destroy()
    });

    test('observe: a transitional state is a first-party fact — it renders even when the runtime source is not wired (#14978)', () => {
        // runtime not-wired normally gates the resolved state to 'off' (missing evidence can't render live);
        // but a pending action is something WE know (we sent the intent), so it takes precedence over the gate
        const card = createCard({agentId: 'vega', state: 'ok', sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired',     confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired',     confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}
        }});

        // resolved state gates to 'off' with no pending action (no runtime evidence)
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('off');

        applySet(card, {pendingAction: 'start'});
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('starting');

        card.destroy()
    });

    test('density (#14592): the open-lane count badge renders a REPORTED count beside the lane line — in place, pluralized honestly (#14598)', () => {
        const card  = createCard({agentId: 'vega', laneLine: 'harness-UI shell + left-rail nav', openLaneCount: 17, state: 'ok'});
        const badge = () => card.down({reference: 'card-lane-count'});

        // the measured 7–17 open lanes cannot read as one line: the line keeps the CURRENT lane,
        // the badge carries the honest total
        expect(card.down({reference: 'card-lane'}).text).toBe('harness-UI shell + left-rail nav');
        expect(badge().hidden).toBe(false);
        expect(badge().text).toBe('17 lanes');

        // display state over the durable id — a count change re-renders in place, never a re-key
        const beforeId = card.id;
        applySet(card, {openLaneCount: 1});
        expect(card.id).toBe(beforeId);
        expect(badge().text).toBe('1 lane');

        // the producer withdraws its report → the badge disappears with it
        applySet(card, {openLaneCount: null});
        expect(badge().hidden).toBe(true);

        card.destroy()
    });

    test('density (#14592): an UNREPORTED lane count renders NO badge — unknown never poses as zero (#14598)', () => {
        // store-backed record without the field → the model default (null) → no badge
        const card  = createCard({agentId: 'ada', state: 'ok'});
        const badge = () => card.down({reference: 'card-lane-count'});

        expect(badge().hidden).toBe(true);
        expect(badge().text ?? '').toBe('');

        // zero open lanes is a report of NOTHING open — still no badge: the state axis already
        // reads "free"; a "0 lanes" pill is noise, not glance value
        applySet(card, {openLaneCount: 0});
        expect(badge().hidden).toBe(true);

        // the dock-blueprint field bag (perspective restore) renders its snapshot the same way
        const snapshot = Neo.create(AgentCard, {appName, record: {agentId: 'ghost', openLaneCount: 9, sources: observedSources, state: 'ok'}});
        expect(snapshot.down({reference: 'card-lane-count'}).hidden).toBe(false);
        expect(snapshot.down({reference: 'card-lane-count'}).text).toBe('9 lanes');

        card.destroy();
        snapshot.destroy()
    });

    test('B4 honest state: unauthorized disables the whole cluster with its reason; timeout renders stale-pending with retry still open (#14611)', () => {
        const card   = createCard({agentId: 'vega', state: 'ok'});
        const verbs  = () => card.down({reference: 'control-verbs'}).items;
        const status = () => card.down({reference: 'control-status'});

        // unauthorized (Lane-C denied / bridge unavailable) → the cluster DISABLES with the reason, not a
        // live button beside a warning: you cannot retry into a closed door (the accepted B4/C2 contract)
        applySet(card, {controlReason: {action: 'start', kind: 'unauthorized', reason: 'Fleet Registry bridge unavailable'}, pendingAction: null});
        expect(verbs().every(button => button.disabled)).toBe(true);
        expect(status().text).toBe('⚠ unauthorized: Fleet Registry bridge unavailable');

        // timeout → the outcome is UNKNOWN (the verb may still be running, we lost the answer) → stale-pending:
        // an unfinished "…", NOT a resolved "⚠" failure, and retry stays OPEN (the cluster re-enables)
        applySet(card, {controlReason: {action: 'restart', kind: 'timeout', reason: 'restart timed out after 30000ms'}, pendingAction: null});
        expect(status().text).toBe('restart… stale — no response');
        expect(verbs()[0].disabled).toBe(false);

        card.destroy()
    });
});
