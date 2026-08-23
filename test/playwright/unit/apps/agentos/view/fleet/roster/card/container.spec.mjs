import {setup} from '../../../../../../../setup.mjs';

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
import Neo            from '../../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../../src/core/_export.mjs';
import Instance       from '../../../../../../../../../src/manager/Instance.mjs';

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
        AgentCard  = (await import('../../../../../../../../../apps/agentos/view/fleet/roster/card/Container.mjs')).default;
        FleetAgent = (await import('../../../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store      = (await import('../../../../../../../../../src/data/Store.mjs')).default
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

    test('the presence band renders ONLY an observed band and clears to hidden — absence of signal, never a verdict', () => {
        const card = createCard({
            agentId : 'clio',
            state   : 'off',
            presence: {source: 'fleet:presenceState', state: 'online', confidence: 'observed', lastSeenAt: '2026-08-09T11:00:00.000Z'}
        });

        const band = () => card.down({reference: 'card-presence'});

        // an OBSERVED band renders beside the honest session state — never fused into it
        expect(band().hidden).toBe(false);
        expect(band().text).toBe('◉ online');
        expect(card.down({reference: 'card-state'}).text).toBe('benched / offline');

        // the producer degrades to unknown → the band disappears entirely (no fabricated offline)
        applySet(card, {presence: {source: 'fleet:presenceState', state: 'unknown', confidence: 'none', lastSeenAt: null, reason: 'presence read failed'}});
        expect(band().hidden).toBe(true);

        // an out-of-vocabulary band is refused at the render layer too — the closed-set discipline
        applySet(card, {presence: {source: 'fleet:presenceState', state: 'levitating', confidence: 'observed', lastSeenAt: null}});
        expect(band().hidden).toBe(true);

        card.destroy()
    });

    test('the chip names every deviating axis and carries the ledger\'s a11y pair — asserted on the RENDERED node', () => {
        const card = createCard({
            agentId : 'vega',
            state   : 'ok',
            wake    : {source: 'fleet:wakeState', state: 'off', confidence: 'observed'},
            throttle: {source: 'fleet:throttleState', state: 'rate-limited', confidence: 'observed'}
        });

        const chip = card.down({reference: 'card-telltale'});

        // ONE chip for two simultaneous exceptions — the incident this answers had both at once, and
        // the density contract buys pixels with exceptions, so two must not cost two chips
        expect(chip.hidden).toBe(false);
        // every deviation names its AXIS: a bare `rate-limited` saves six characters and costs the
        // reader the question the chip exists to answer. Deterministic wake-before-throttle.
        expect(chip.text).toBe('wake off · throttle rate-limited');

        // a screen-reader user gets the chip ONLY through aria-label; the hover answers the axis the
        // chip had no room for, without a drill-in
        expect(chip.vdom['aria-label']).toBe('Telltale: wake off, throttle rate-limited');
        expect(chip.vdom.title).toBe('wake: off · throttle: rate-limited');

        card.destroy()
    });

    test('a recovered agent clears the chip AND its labels — no stale claim on an invisible node', () => {
        const card = createCard({
            agentId: 'vega', state: 'ok',
            wake   : {source: 'fleet:wakeState', state: 'off', confidence: 'observed'}
        });

        expect(card.down({reference: 'card-telltale'}).hidden).toBe(false);

        applySet(card, {wake: {source: 'fleet:wakeState', state: 'on', confidence: 'observed'}});

        const chip = card.down({reference: 'card-telltale'});

        // hiding the node is not enough: a stale aria-label survives on a hidden element and is still
        // read out, so the screen reader would report a wake failure on an agent that is now fine
        expect(chip.hidden).toBe(true);
        expect(chip.vdom['aria-label']).toBeFalsy();
        expect(chip.vdom.title).toBeFalsy();

        card.destroy()
    });

    test('the source strip summarizes health in place; absent runtime renders the dot unobserved and never pulses (#15536)', () => {
        const card     = createCard({agentId: 'vega', state: 'ok'}),
              beforeId = card.id,
              strip    = card.down({reference: 'source-strip'}),
              stripId  = strip.id,
              stateDot = card.down({ntype: 'fm-state-dot'});

        // all sources wired + observed → nominal earns ZERO pixels (the exception-only strip: the
        // permanent "all sources nominal" line carried no operator meaning — the operator verdict
        // this partition ships); the dot pulses live
        expect(strip.hidden).toBe(true);
        expect(strip.text).toBe('');
        expect(stateDot.state).toBe('ok');
        expect(stateDot.live).toBe(true);

        // repo ANSWERED-missing with a retained cause + runtime not-wired: only the answered
        // abnormality renders (name + reason — the rendered-exception bar), while the not-wired
        // runtime is expected absence — zero pixels on the strip exactly as it carries zero
        // attention weight (ONE interpretation). The dot resolves unobserved (participation-
        // active, session unobserved — never a benched verdict), the control cluster disables —
        // in place.
        applySet(card, {sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired',     confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'missing',   confidence: 'none', reason: 'no repository status answered for this agent'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none', reason: 'runtime probe refused'}
        }});

        expect(card.id).toBe(beforeId);
        expect(card.down({reference: 'source-strip'}).id).toBe(stripId);   // same instance, updated in place
        expect(strip.hidden).toBe(false);   // an ANSWERED abnormality is the exception the strip exists for
        expect(strip.text).toBe('Repository not nominal · no repository status answered for this agent');
        expect(strip.vdom['aria-label']).toBe('Source health: Repository not nominal. Repository: no repository status answered for this agent.');
        expect(strip.cls).toContain('fm-strip-bad');
        expect(stateDot.state).toBe('unobserved');
        expect(stateDot.live).toBe(false);
        expect(card.down({reference: 'control-toggle'}).iconCls).toBe('fa-solid fa-stop');
        expect(card.down({reference: 'control-toggle'}).disabled).toBe(true);
        expect(card.down({reference: 'control-restart'}).hidden).toBe(false);
        expect(card.down({reference: 'control-restart'}).disabled).toBe(true);
        // the runtime-source gating is shown by the disabled controls + the strip, NOT duplicated in the
        // control-status line (which is reserved for the control round-trip: pending / timeout / rejected)
        expect(card.down({reference: 'control-status'}).hidden).toBe(true);

        // all wired again (runtime merely INFERRED): the strip recovers to zero pixels and the
        // controls re-enable, but the dot does NOT pulse — an inferred runtime is ok, not a live
        // observation
        applySet(card, {sources: {
            ...observedSources,
            runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'inferred'}
        }});
        expect(strip.hidden).toBe(true);
        expect(stateDot.state).toBe('ok');
        expect(stateDot.live).toBe(false);
        expect(card.down({reference: 'control-toggle'}).disabled).toBe(false);

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

    test('RA-2 a11y: the icon-only inline verbs carry a CONTEXTUAL, subject-named aria-label on the vdom ROOT — not the no-op `ariaLabel` config (#15536)', () => {
        // The ⋯ overflow menu was dropped on operator UX direction (2026-07-19): a generic 3-dots trigger
        // read as "no one knows what that means", so the narrow row keeps the REAL Start/Stop + Restart
        // glyphs inline. They are icon-only (`.neo-button-text` is display:none), so the aria-label IS
        // their only accessible name — and it must reach the DOM through the vdom ROOT (changeVdomRootKey),
        // because `ariaLabel` is undeclared in Neo and sets a memory property with ZERO DOM effect (Emmy
        // RA-2 falsified the memory-only claim). The power verb is CONTEXTUAL, matching the toggle; every
        // verb names its subject (the FM roster names what it acts on).
        const card = createCard({agentId: 'vega', state: 'off'});

        const toggle  = card.down({reference: 'control-toggle'}),
              restart = card.down({reference: 'control-restart'});

        // off → the toggle's DOM name is "Start <subject>"; restart names its subject too. The trailing
        // subject (non-empty after the verb) proves the roster names WHAT it acts on, not a bare verb.
        expect(toggle.vdom['aria-label']).toMatch(/^Start .+/);
        expect(restart.vdom['aria-label']).toMatch(/^Restart .+/);

        // running → the SAME toggle's DOM name flips to "Stop <subject>" — read from the live record, so
        // the accessible name tracks state without a second control (the state itself is shown on the card)
        applySet(card, {state: 'ok'});
        expect(toggle.vdom['aria-label']).toMatch(/^Stop .+/);

        card.destroy()
    });

    test('selection ownership: the resident name is plain identity text, never a second drill control', () => {
        const card = createCard({agentId: 'vega', displayName: 'Vega', state: 'ok'});

        // The host list's real li is the one selection/drill target. Keeping the name as a plain
        // Component prevents two competing keyboard/click seams inside one row; lifecycle verbs
        // remain the card's only native controls.
        const name = card.down({reference: 'card-name'});

        expect(name.ntype).toBe('component');
        expect(name.vdom.tag).toBeUndefined();
        expect(name.text).toBe('Vega');
        expect(card.getController().onCardSelect).toBeUndefined();

        card.destroy()
    });

    test('a11y shape (gate-1): the card is content inside the host li; only lifecycle verbs are native Buttons (#14619)', () => {
        const card = createCard({agentId: 'vega', displayName: 'Vega', state: 'ok'});

        // The List owns semantic HTML (`ul > li`) and selection. The AgentCard is only the li's
        // product surface, so it must not duplicate the implicit listitem role or add a tab stop.
        expect(card.vdom.role).toBeUndefined();
        expect(card.vdom.tabIndex ?? null).toBeNull();
        expect(card.vdom['aria-label'] ?? null).toBeNull();

        const
            name    = card.down({reference: 'card-name'}),
            toggle  = card.down({reference: 'control-toggle'}),
            restart = card.down({reference: 'control-restart'});

        expect(name.ntype).toBe('component');
        expect(name.text).toBe('Vega');
        expect(toggle.vdom.tag).toBe('button');
        expect(restart.vdom.tag).toBe('button');

        // the accessible name is record-derived display state — a rename updates it in place (never a re-key)
        applySet(card, {displayName: 'Vega (renamed)'});
        expect(name.text).toBe('Vega (renamed)');

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

        // control-status-priority: a NEW attempt takes visual priority over a stale reason (the
        // clear-on-new-intent nuance, render side)
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
        // runtime not-wired resolves a participation-active row to 'unobserved' (no session evidence,
        // no benched verdict); but a pending action is something WE know (we sent the intent), so it
        // takes precedence over the gate
        const card = createCard({agentId: 'vega', state: 'ok', sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired',     confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired',     confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}
        }});

        // resolved state renders 'unobserved' with no pending action (participation-active, session unobserved)
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('unobserved');

        applySet(card, {pendingAction: 'start'});
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('starting');

        card.destroy()
    });

    test('1.4.1 State line: the state renders as text beside the dot, from stateLabel — the colour-independent channel (#15512)', () => {
        const card = createCard({agentId: 'vega', state: 'wedged'});

        // the visible word is the redundant NON-colour carrier WCAG 1.4.1 requires — the dot's hue is no
        // longer the sole signal. In the D-synthesis identity column the state-line pairs the two channels
        // at one glance: [state-dot] [state text] adjacent, beneath the name-line's drill name.
        const stateRefs = card.down({reference: 'state-line'}).items.map(item => item.reference);
        expect(stateRefs.slice(0, 2)).toEqual(['state-dot', 'card-state']);
        expect(card.down({reference: 'name-line'}).items[0].reference).toBe('card-name');

        // the word comes from stateLabel — the SAME closed-set resolver StateDot names ITSELF with, so the
        // card can never introduce a second state vocabulary; colour (dot) and word derive from one state
        expect(card.down({reference: 'card-state'}).text).toBe('wedged');
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('wedged');

        card.destroy()
    });

    test('1.4.1 State line: the word follows displayState through pending + source-gated transitions — one vocabulary, never stale (#15512)', () => {
        const card      = createCard({agentId: 'vega', state: 'ok'}),
              stateText = () => card.down({reference: 'card-state'}).text;

        expect(stateText()).toBe('working');

        // a pending intent renders the TRANSITIONAL word, matching the dot — never the stale resolved word
        applySet(card, {pendingAction: 'stop'});
        expect(stateText()).toBe('stopping');
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('stopping');

        // missing runtime evidence resolves a participation-active row to 'unobserved' — the word
        // degrades WITH the dot from the shared vocabulary (never a false 'benched / offline'
        // verdict, never fabricated liveness)
        applySet(card, {pendingAction: null, sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired',     confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired',     confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}
        }});
        expect(stateText()).toBe('unobserved');
        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('unobserved');

        card.destroy()
    });

    test('1.4.1 State line: an unrecognized state still READS via the word even as the dot safely degrades to off (#15512)', () => {
        // stateLabel passes an unknown state through LITERALLY while stateClass degrades the dot to off:
        // a new runtime state the palette can't yet colour is still legible as TEXT — the word rescues the
        // exact case where colour alone would silently show "off" for something that is not off.
        const card = createCard({agentId: 'vega', state: 'quarantined'}),
              dot  = card.down({ntype: 'fm-state-dot'});

        expect(card.down({reference: 'card-state'}).text).toBe('quarantined');
        expect(dot.state).toBe('quarantined');   // the config passes through…
        expect(dot.cls).toContain('fm-state-off'); // …while the dot's own class degrades to the off token

        card.destroy()
    });

    test('state-honesty: a roster-only ACTIVE resident renders `unobserved` — never `benched / offline`, never fabricated liveness (#15625)', () => {
        // the derived sample path: participation truth `state: 'ok'`, NO runtime source at all —
        // the card must not claim the resident is working (no session evidence) and must not
        // claim they are benched (a false participation verdict)
        const card = createCard({agentId: 'phoebe', state: 'ok', sources: {}}),
              dot  = card.down({ntype: 'fm-state-dot'});

        expect(dot.state).toBe('unobserved');
        expect(card.down({reference: 'card-state'}).text).toBe('unobserved');
        // the pulse stays observation-gated — unobserved never renders live
        expect(dot.live).toBe(false);

        card.destroy()
    });

    test('state-honesty: an un-wired `off` row renders `external harness` — supervision vocabulary only where supervision exists', () => {
        // REVERSES the prior state-honesty mapping deliberately, under the newer operator
        // ratification (the default-state contract): without a wired runtime there is no
        // supervision contract, so "benched / offline" was a fact about FLEET presented as a
        // verdict about the agent — falsified live against seats visibly working in their own
        // harnesses. The participation fact still renders; its vocabulary is now neutral and
        // carries no attention weight.
        const card = createCard({agentId: 'gemini', state: 'off', sources: {}});

        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('external');
        expect(card.down({reference: 'card-state'}).text).toBe('external harness');

        card.destroy()
    });

    test('state-honesty: a wired-and-stopped seat KEEPS `benched / offline` — the supervision verdict survives where supervision exists', () => {
        // the partition's other half: Fleet manages this seat (wired runtime) and knows it stopped
        const card = createCard({agentId: 'vega', state: 'off'});

        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('off');
        expect(card.down({reference: 'card-state'}).text).toBe('benched / offline');

        card.destroy()
    });

    test('state-honesty: a wired runtime renders the row state as session truth — the resolver leaves the live path untouched (#15625)', () => {
        const card = createCard({agentId: 'vega', state: 'idle'});

        expect(card.down({ntype: 'fm-state-dot'}).state).toBe('idle');
        expect(card.down({reference: 'card-state'}).text).toBe('idle');

        card.destroy()
    });

    test('density (#14592): the open-lane count badge renders a REPORTED count beside the lane line — in place, pluralized honestly (#14598)', () => {
        const card  = createCard({agentId: 'vega', laneLine: 'harness-UI shell + left-rail nav', openLaneCount: 17, state: 'ok'});
        const badge = () => card.down({reference: 'card-lane-count'});

        // the measured 7–17 open lanes cannot read as one line: the line keeps the CURRENT lane,
        // the badge carries the honest total. A short lane renders whole (one fm-lane-whole span);
        // the head+tail middle elision only engages for a long lane.
        // lane-is-text-node: inert text node (not html/innerHTML) — remote lane strings must never execute
        expect(card.down({reference: 'card-lane'}).vdom.cn[0].text).toBe('harness-UI shell + left-rail nav');
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

    test('name slot: the display name renders with its provenance chip; a rename re-renders IN PLACE — same instance, never a re-key (§2.3.2, #14641)', () => {
        const
            card       = createCard({agentId: 'vega', displayName: 'Vega', state: 'ok'}),
            beforeId   = card.id,
            name       = () => card.down({reference: 'card-name'}),
            provenance = () => card.down({reference: 'name-provenance'});

        expect(name().text).toBe('Vega');
        expect(name().cls).not.toContain('fm-card-name-id');

        // provenance is stated, reachable, and honest: declared display state, trail not yet
        // wired — the quiet glyph on the density surface, the words on title/aria
        expect(provenance().hidden).toBe(false);
        expect(provenance().text).toBe('◇');
        expect(provenance().cls).toContain('is-declared-proxy');
        expect(provenance().vdom.title).toContain('declared display state');
        expect(provenance().vdom.title).toContain('vega');
        expect(provenance().vdom['aria-label']).toBe(provenance().vdom.title);

        // the §2.3.2 fixture: a rename mutates DISPLAY STATE on the SAME card instance
        applySet(card, {displayName: 'Vega Prime'});
        expect(card.id).toBe(beforeId);
        expect(name().text).toBe('Vega Prime');
        expect(provenance().vdom.title).toContain('Vega Prime');

        card.destroy()
    });

    test('name slot: no display name → the durable id renders as the drill target in the mono register, chip says so (#14641)', () => {
        const
            card       = createCard({agentId: 'guest-agent-7', displayName: null, state: 'ok'}),
            name       = () => card.down({reference: 'card-name'}),
            provenance = () => card.down({reference: 'name-provenance'});

        // never a blank drill target: the never-renamed anchor itself renders, register-flagged —
        // and NO chip beside it (the mono register IS the signal; a chip would state it twice)
        expect(name().text).toBe('guest-agent-7');
        expect(name().cls).toContain('fm-card-name-id');
        expect(provenance().hidden).toBe(true);
        expect(provenance().cls).toContain('is-durable-id');

        // a later rename flips the register back — in place, same instance
        const beforeId = card.id;

        applySet(card, {displayName: 'Guest Seven'});
        expect(card.id).toBe(beforeId);
        expect(name().text).toBe('Guest Seven');
        expect(name().cls).not.toContain('fm-card-name-id');
        expect(provenance().hidden).toBe(false);
        expect(provenance().text).toBe('◇');

        card.destroy()
    });

    test('strip-is-status (#15536): the strip is a pure role=status INERT text node — meaning survives colour removal and no innerHTML sink carries the summary', () => {
        const
            card  = createCard({agentId: 'vega', state: 'ok'}),
            strip = () => card.down({reference: 'source-strip'});

        // the role must reach the DOM through the vdom ROOT — a role that only lived in memory would
        // announce nothing, and this strip is the card's source live-region. Nominal renders ZERO
        // pixels (the exception-only contract), so the node exists hidden with no text to announce.
        expect(strip().vdom.role).toBe('status');
        expect(strip().hidden).toBe(true);
        expect(strip().text).toBe('');
        expect(strip().html ?? null).toBeNull();
        expect(strip().vdom.html ?? null).toBeNull();

        // no disclosure affordance on a non-interactive status node — the card-name drill IS the card's
        // one route to full facts. A ▸ expander would need this to become a container or carry a
        // handler; assert neither, so reintroducing one fails here instead of passing quietly.
        expect(strip().ntype).toBe('component');
        expect(strip().handler ?? null).toBeNull();

        // the exception path is where the word renders — an INERT text node, never innerHTML.
        // `html` would make safety a property the summariser must preserve forever (it composes
        // from a frozen label map + a producer-bounded reason today, so there is no live exploit)
        // rather than one the card cannot get wrong. The fixture is an ANSWERED abnormality — the
        // only class that renders under the one-interpretation rule.
        applySet(card, {sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired',   confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired',   confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'missing', confidence: 'none'}
        }});

        expect(strip().hidden).toBe(false);
        expect(strip().cls).toContain('fm-strip-bad');
        expect(strip().vdom['aria-label']).toBe('Source health: Runtime not nominal.');
        expect(strip().text).toBe('Runtime not nominal');
        // the sink stays closed ACROSS an update, not merely at construct time
        expect(strip().html ?? null).toBeNull();
        expect(strip().vdom.html ?? null).toBeNull();

        // defense in depth, and the reason the historic `html:` was never exploitable: the summariser
        // is CLOSED over adapter data. A hostile `source` literal off the fleet wire is read only for
        // the expected-producer COMPARISON in normalizeSourceFact, so it fails the row closed and can
        // never reach the rendered word. This pins the contract's "controlled literal from the
        // summariser, never adapter prose" as a WITNESS rather than a claim in prose.
        const hostile = '<img src=x onerror="alert(1)">';

        applySet(card, {sources: {
            roster    : {source: 'fleet:listAgents',  state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus', state: 'wired', confidence: 'observed'},
            runtime   : {source: hostile,             state: 'wired', confidence: 'observed'}
        }});

        // the hostile producer literal fails producer validation → the fact reads `invalid` and
        // RENDERS as an answered abnormality — and the containment is that the rendered words are
        // the summariser's frozen literals: the hostile SOURCE string appears nowhere (only the
        // validation fallback rides the line). The exact match IS the witness.
        expect(strip().hidden).toBe(false);
        expect(strip().text).toBe('Runtime not nominal · source fact failed producer validation');
        expect(strip().html ?? null).toBeNull();

        // the REASON is the one adapter-authored string that now rides a rendered line — pin its
        // containment: a hostile reason on an ANSWERED abnormality renders as an inert text node
        // (the vdom `html` sinks stay null), so escaping is never a property the summariser must
        // remember to preserve.
        applySet(card, {sources: {
            roster    : {source: 'fleet:listAgents',    state: 'wired',   confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired',   confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'missing', confidence: 'none', reason: hostile}
        }});

        expect(strip().hidden).toBe(false);
        expect(strip().text).toBe(`Runtime not nominal · ${hostile}`);
        expect(strip().html ?? null).toBeNull();
        expect(strip().vdom.html ?? null).toBeNull();

        card.destroy()
    });

    test('lane-elision-distinguishes (#15536): two lanes sharing a long prefix collapse to the SAME head yet keep DIFFERENT tails — the shared-prefix falsifier, without hover', () => {
        // The AC's falsifier, using the same two fixtures the AgentCardSynthesisRenderNL goldens render
        // (both share "control-plane", both carry a 2-digit overflow count) so the unit and the e2e
        // cannot drift apart. The goldens catch a VISUAL regression; this owns the SEMANTIC claim, which
        // a regenerated baseline could otherwise bless away.
        const
            laneA = 'control-plane restart actuator R3 seam reconciliation across the multi-window dock topology',
            laneB = 'control-plane deployment-state bridge self-heal recent-event-limit tuning + overlay migration',
            cut   = line => AgentCard.elideLaneLine(line);

        // both elide (each is past the two-line clamp), so each yields a head+tail pair, never `whole`
        expect(cut(laneA).whole).toBeUndefined();
        expect(cut(laneB).whole).toBeUndefined();

        // the HEADS are identical — that is what makes this a real falsifier rather than a happy path:
        // a head-only elision would render these two distinct lanes as the same visible fragment
        expect(cut(laneA).head).toBe(cut(laneB).head);

        // ...and the preserved TAILS are what still tell them apart, each non-empty
        expect(cut(laneA).tail).not.toBe(cut(laneB).tail);
        expect(cut(laneA).tail.length).toBeGreaterThan(0);
        expect(cut(laneB).tail.length).toBeGreaterThan(0);

        // rendered: the distinguishing tail reaches the DOM as its own inert text node, with NO hover or
        // title fallback carrying the truth — a tooltip-only tail would fail the touch-access AC
        const
            card = createCard({agentId: 'vega', laneLine: laneA, openLaneCount: 23, state: 'ok'}),
            lane = () => card.down({reference: 'card-lane'});

        expect(lane().vdom.cn).toHaveLength(2);
        expect(lane().vdom.cn[0].cls).toContain('fm-lane-elide');
        expect(lane().vdom.cn[1].cls).toContain('fm-lane-tail');
        expect(lane().vdom.cn[1].text).toBe(cut(laneA).tail);
        expect(lane().vdom.cn[1].html ?? null).toBeNull();      // inert node, not innerHTML
        expect(lane().vdom.title ?? null).toBeNull();           // the tail is VISIBLE, never hover-only

        // re-seating onto the sibling lane keeps the same instance and swaps only the tail — the badge
        // count is a separate axis and must not be what distinguishes them
        const laneId = lane().id;

        applySet(card, {laneLine: laneB, openLaneCount: 17});
        expect(lane().id).toBe(laneId);
        expect(lane().vdom.cn[0].text).toBe(cut(laneB).head);
        expect(lane().vdom.cn[1].text).toBe(cut(laneB).tail);
        expect(card.down({reference: 'card-lane-count'}).text).toBe('17 lanes');

        card.destroy()
    });

    test('avatar-persists (#15536): a null avatarUrl keeps the slot and its accessible name — the head row never collapses, and no lifecycle state hides the face', () => {
        const
            card   = createCard({agentId: 'vega', displayName: 'Vega', avatarUrl: 'vega.png', state: 'ok'}),
            avatar = () => card.down({reference: 'card-avatar'});

        expect(avatar().src).toBe('vega.png');
        expect(avatar().alt).toBe('Vega');
        expect(avatar().hidden).toBe(false);

        // avatarUrl dropped (absent or unreachable picture) → the SLOT SURVIVES: src goes null while the
        // component stays mounted and visible, so the head row keeps its geometry instead of reflowing
        // the identity column. `hidden: true` here would be exactly the demotion the operator invariant
        // bans, and the alt is RETAINED so the face slot still names its resident.
        const avatarId = avatar().id;

        applySet(card, {avatarUrl: null});
        expect(avatar().id).toBe(avatarId);          // same instance — updated in place, never re-keyed
        expect(avatar().src ?? null).toBeNull();
        expect(avatar().hidden).toBe(false);
        expect(avatar().alt).toBe('Vega');

        // ...and no lifecycle state hides it either: a benched row still shows the face, which is the
        // fast-recognition / fleet-individuality anchor the invariant protects
        applySet(card, {state: 'off', sources: null});
        expect(avatar().hidden).toBe(false);
        expect(avatar().alt).toBe('Vega');

        // NOTE: width-mode persistence (narrow 294 / regular 360 / roomy 720, both themes) is NOT a unit
        // concern — those modes are card-owned SCSS @container rules, witnessed by the goldens in
        // test/playwright/e2e/agentos/AgentCardSynthesisRenderNL.spec.mjs. This spec owns the
        // data-driven half only; the checklist entry cites both witnesses, not this one alone.
        card.destroy()
    });

    test('verbs-in-flow (#15536): both lifecycle verbs are real always-rendered native Buttons — no overflow trigger, no hover-only reveal, a visible power verb in EVERY state', () => {
        const
            card    = createCard({agentId: 'vega', displayName: 'Vega', state: 'off'}),
            verbs   = () => card.down({reference: 'control-verbs'}),
            toggle  = () => card.down({reference: 'control-toggle'}),
            restart = () => card.down({reference: 'control-restart'});

        // the ⋯ overflow trigger was dropped on operator UX direction (2026-07-19: a generic 3-dots
        // trigger read as "no one knows what that means"). Assert the rail holds EXACTLY the two real
        // verbs, so a later "just tuck them behind a menu" fails here rather than passing quietly.
        expect(verbs().items).toHaveLength(2);
        expect(verbs().items.map(item => item.vdom.tag)).toEqual(['button', 'button']);
        expect(verbs().hidden).toBe(false);

        // native <button>s sit in ordinary Tab order — that is what makes this not a hover-only reveal.
        // A hover-gated control would have to be hidden or aria-hidden at rest; neither is.
        expect(toggle().hidden).toBe(false);
        expect(toggle().vdom['aria-hidden'] ?? null).toBeNull();

        // stopped: the power verb offers the only meaningful action, restart is withheld
        expect(toggle().iconCls).toBe('fa-solid fa-play');
        expect(restart().hidden).toBe(true);

        // the toggle is CONTEXTUAL but never ABSENT — every running-side state keeps a visible power
        // verb whose glyph follows the state, and restart becomes meaningful
        for (const state of ['ok', 'idle', 'wedged', 'limited']) {
            applySet(card, {state});
            expect(toggle().hidden,  `toggle stays visible in ${state}`).toBe(false);
            expect(toggle().iconCls, `toggle glyph follows ${state}`).toBe('fa-solid fa-stop');
            expect(restart().hidden, `restart is offered in ${state}`).toBe(false)
        }

        // back to stopped — the verb is still there, just contextual again (never an empty rail)
        applySet(card, {state: 'off'});
        expect(toggle().hidden).toBe(false);
        expect(toggle().iconCls).toBe('fa-solid fa-play');
        expect(restart().hidden).toBe(true);

        // NOTE: the 44px narrow touch target is a card-owned @container rule; the AgentCardSynthesisRenderNL
        // goldens witness the width modes. This spec owns the structural half — the verbs exist, stay in
        // flow, and stay visible regardless of lifecycle state.
        card.destroy()
    })
});
