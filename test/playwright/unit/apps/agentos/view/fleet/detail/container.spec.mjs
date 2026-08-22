import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetAgentDetailTest';

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
import Instance       from '../../../../../../../../src/manager/Instance.mjs';

/**
 * @summary Tests for the FM cockpit AgentDetail drill-in view — the identity
 * header (name-as-display-state over the durable id, engine-as-metadata, family rebind in place,
 * no role fields) over the four SSOT panes, each freshness-labeled per §2.2.1 (fresh/stale/lost
 * from a wired ledger, honest `unobserved` until a feed lands). `now` is injected + pinned so the
 * freshness contract renders deterministically.
 */
test.describe('Fleet cockpit AgentDetail — drill-in inspector (#14608)', () => {
    let AgentDetail, AgentDefinition, FleetAgent, FleetTenants, Store;

    const
        stores          = [],
        // a fixed clock + observations at fixed offsets; a wired runtime so the state dot can render live
        NOW             = Date.parse('2026-07-12T00:00:00.000Z'),
        observedSources = {
            roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
        };

    // a real store-backed record — the production shape (an AgentOS.store.FleetRoster row). The store
    // mirrors FleetRoster's keyProperty (the collection default 'id' would shadow the model's).
    const makeRecord = data => {
        const row = {
                  // mirrors production: the roster DTO carries the mailbox identity authority beside
                  // the registry key. A fixture without it is a resident the mailbox cannot verify —
                  // valid, but not the default case, so tests opt INTO that by passing null.
                  githubUsername: data.githubUsername === undefined ? `neo-${data.agentId}` : data.githubUsername,
                  ...data,
                  sources: data.sources === undefined ? observedSources : data.sources
              },
              store = Neo.create(Store, {keyProperty: 'agentId', model: FleetAgent, data: [row]});

        stores.push(store);

        return store.get(data.agentId)
    };

    const createDetail = (data, config = {}) => Neo.create(AgentDetail, {appName, now: NOW, record: makeRecord(data), ...config});

    // an adapter-shaped mirror snapshot (the `fleetMailboxMirror` verb's envelope)
    const mirrorSnapshot = (subjectAgentId, rows = []) => ({
        capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt: '2026-07-12T00:00:00.000Z', reason: null},
        admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId, checkedAt: '2026-07-12T00:00:00.000Z', reason: null},
        page      : {limit: 50, offset: 0, count: rows.length},
        rows      : rows.map(row => ({
            from          : '@neo-gpt',
            recipientClass: 'agent',
            priority      : 'normal',
            status        : 'unread',
            taskState     : null,
            partOfThread  : null,
            relatedTickets: [],
            wakeSuppressed: false,
            sentAt        : '2026-07-12T00:00:00.000Z',
            readAt        : null,
            ...row
        }))
    });

    // the cockpit routes the store's recordChange to the view; standalone units drive the same seam.
    const applySet = (detail, values) => {
        detail.record.set(values);
        detail.applyRecord()
    };

    const chip = (detail, key) => detail.down({reference: `pane-${key}-freshness`});
    const body = (detail, key) => detail.down({reference: `pane-${key}-body`});

    test.beforeAll(async () => {
        AgentDetail     = (await import('../../../../../../../../apps/agentos/view/fleet/detail/Container.mjs')).default;
        AgentDefinition = (await import('../../../../../../../../apps/agentos/model/AgentDefinition.mjs')).default;
        FleetAgent      = (await import('../../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        FleetTenants    = (await import('../../../../../../../../apps/agentos/store/FleetTenants.mjs')).default;
        Store           = (await import('../../../../../../../../src/data/Store.mjs')).default
    });

    test.afterAll(() => {
        stores.forEach(store => store.destroy());
        stores.length = 0
    });

    test('no record → the honest empty state; header + tabs hidden until a resident is selected', () => {
        const detail = Neo.create(AgentDetail, {appName});

        expect(detail.down({reference: 'detail-empty'}).hidden).toBe(false);
        expect(detail.down({reference: 'detail-header'}).hidden).toBe(true);
        // the visibility gate is the TAB container (Status + Mailbox ride inside it)
        expect(detail.down({reference: 'detail-tabs'}).hidden).toBe(true);

        detail.destroy()
    });

    test('the detail body is a tab container: Status panes + the COUNTLESS Mailbox tab; the mailbox follows the record', () => {
        const detail = Neo.create(AgentDetail, {appName});
        const tabs   = detail.down({reference: 'detail-tabs'});

        // tab 1 = the four status panes (untouched inside), tab 2 = the mailbox pane — both
        // reachable references inside the tab container's card structure
        expect(detail.down({reference: 'detail-panes'})).toBeTruthy();
        expect(detail.down({reference: 'mailbox-pane'})).toBeTruthy();

        // countless by design: the tab-bar buttons carry plain 'Status' / 'Mailbox' — no badge,
        // no count (an unread count would imply operator-side read tracking that deliberately
        // does not exist)
        const buttonTexts = tabs.getTabBar().items.map(button => button.text);
        expect(buttonTexts).toEqual(['Status', 'Mailbox', 'Configuration']);

        // the mailbox pane's record follows the drill-in (its snapshot is wiring-injected)
        detail.record = {agentId: '@neo-gpt', displayName: 'Euclid'};
        expect(detail.down({reference: 'mailbox-pane'}).record?.agentId).toBe('@neo-gpt');

        detail.record = null;
        expect(detail.down({reference: 'mailbox-pane'}).record).toBe(null);

        detail.destroy()
    });

    test('a11y: the drill is a named landmark region that survives a record re-seat (#14619)', () => {
        const detail = createDetail({
            agentId: 'vega', displayName: 'Vega', family: 'claude', engineTag: 'opus-4.8', state: 'ok'
        });

        // the drill is a named landmark region so screen-reader users land in a labeled region on
        // drill-in (not an unnamed pane)
        expect(detail.vdom.role).toBe('region');
        expect(detail.vdom['aria-label']).toBe('Agent detail');

        // applyRecord re-seats via child-reference .set() and never replaces the root, so the region
        // MUST survive a re-seat — a returning agent selection must not silently drop the landmark
        applySet(detail, {displayName: 'Vega Prime'});
        expect(detail.vdom.role).toBe('region');
        expect(detail.vdom['aria-label']).toBe('Agent detail');

        detail.destroy()
    });

    test('a selected resident renders the ADR-0032 identity header + reveals the panes; no per-view provider', () => {
        const detail = createDetail({
            agentId: 'vega', avatarUrl: 'vega.png', displayName: 'Vega', family: 'claude', engineTag: 'opus-4.8', state: 'ok'
        });

        // one record surface, zero providers
        expect(detail.record.agentId).toBe('vega');
        expect(detail.stateProvider ?? null).toBeNull();

        // empty state gone, header + panes shown
        expect(detail.down({reference: 'detail-empty'}).hidden).toBe(true);
        expect(detail.down({reference: 'detail-header'}).hidden).toBe(false);
        expect(detail.down({reference: 'detail-panes'}).hidden).toBe(false);

        // identity header: family rail + state dot + name/engine/id from the record
        expect(detail.down({ntype: 'fm-family-rail'}).family).toBe('claude');
        expect(detail.down({ntype: 'fm-state-dot'}).state).toBe('ok');
        expect(detail.down({ntype: 'image'}).src).toBe('vega.png');
        expect(detail.down({reference: 'detail-name'}).text).toBe('Vega');
        expect(detail.down({reference: 'detail-engine'}).text).toBe('opus-4.8');
        // the durable anchor is always shown — name is display state OVER it (§2.3.2)
        expect(detail.down({reference: 'detail-id'}).text).toBe('vega');

        detail.destroy()
    });

    test('ADR-0032 §2.3.2: name/engine are display state over the durable id — a rename re-renders in place, never a re-key', () => {
        const detail   = createDetail({agentId: 'vega', displayName: 'Vega', engineTag: 'opus-4.8', state: 'ok'});
        const beforeId = detail.id;

        applySet(detail, {displayName: 'Vega (renamed)', engineTag: 'fable-5'});

        expect(detail.id).toBe(beforeId);           // the SAME instance — identity is the durable id
        expect(detail.record.agentId).toBe('vega');
        expect(detail.down({reference: 'detail-name'}).text).toBe('Vega (renamed)');
        expect(detail.down({reference: 'detail-engine'}).text).toBe('fable-5');
        expect(detail.down({reference: 'detail-id'}).text).toBe('vega');

        detail.destroy()
    });

    test('ADR-0032 §2.3.3: a cross-family swap rebinds the rail in place — the SAME resident, not a new self', () => {
        const detail   = createDetail({agentId: 'vega', family: 'claude', state: 'ok'});
        const beforeId = detail.id;

        applySet(detail, {family: 'gpt'});

        expect(detail.id).toBe(beforeId);
        expect(detail.down({ntype: 'fm-family-rail'}).family).toBe('gpt');

        detail.destroy()
    });

    test('a null displayName falls back to the durable id, never a blank name slot', () => {
        const detail = createDetail({agentId: 'neo-gpt-emmy', displayName: null, state: 'ok'});

        expect(detail.down({reference: 'detail-name'}).text).toBe('neo-gpt-emmy');

        detail.destroy()
    });

    test('participationStatus renders as availability (not a role); an unstamped status hides the line', () => {
        const detail = createDetail({agentId: 'gem', participationStatus: 'operator_benched', state: 'off'});

        const line = detail.down({reference: 'detail-participation'});
        expect(line.hidden).toBe(false);
        expect(line.text).toBe('operator benched');

        // null (no identity-root fact) → hidden, never guessed
        applySet(detail, {participationStatus: null});
        expect(detail.down({reference: 'detail-participation'}).hidden).toBe(true);

        detail.destroy()
    });

    test('the state dot is gated on a wired runtime source — missing runtime evidence never renders live', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'});

        expect(detail.down({ntype: 'fm-state-dot'}).state).toBe('ok');
        expect(detail.down({ntype: 'fm-state-dot'}).live).toBe(true);

        // missing runtime evidence resolves a participation-active resident to 'unobserved' — the
        // SAME truth the grid card renders (one resolver, three surfaces), never live, never a
        // false benched verdict
        applySet(detail, {sources: {
            ...observedSources,
            runtime: {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}
        }});
        expect(detail.down({ntype: 'fm-state-dot'}).state).toBe('unobserved');
        expect(detail.down({ntype: 'fm-state-dot'}).live).toBe(false);

        detail.destroy()
    });

    test('§2.2.1 freshness: each pane renders its ledger class — fresh/stale/lost from observedAt, unobserved with no ledger', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'}, {
            paneLedgers: {
                'thought-stream': {observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: 30_000}, // 10s → fresh
                lane            : {observedAt: '2026-07-11T23:58:30.000Z', freshnessTtl: 30_000}, // 90s → stale
                repo            : {lost: true}                                                    // explicit → lost
                // prs: no ledger → unobserved
            }
        });

        expect(chip(detail, 'thought-stream').cls).toContain('is-fresh');
        expect(chip(detail, 'thought-stream').text).toBe('updated 10s ago');
        expect(chip(detail, 'lane').cls).toContain('is-stale');
        expect(chip(detail, 'repo').cls).toContain('is-lost');
        expect(chip(detail, 'prs').cls).toContain('is-unobserved');
        expect(chip(detail, 'prs').text).toBe('not observed — source not wired');

        detail.destroy()
    });

    test('§2.2.1 freshness re-labels reactively when a feed stamps a new observation (paneLedgers set)', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'});

        // no ledgers → all unobserved
        expect(chip(detail, 'lane').cls).toContain('is-unobserved');

        // a feed wires the lane ledger → the pane sharpens to timestamped freshness, no re-seat
        detail.paneLedgers = {lane: {observedAt: '2026-07-11T23:59:55.000Z', freshnessTtl: 30_000}}; // 5s → fresh
        expect(chip(detail, 'lane').cls).toContain('is-fresh');
        expect(chip(detail, 'lane').text).toBe('updated 5s ago');

        detail.destroy()
    });

    test('the lane pane body renders the record-known lane line + open-lane count; feed-gated panes degrade honestly', () => {
        const detail = createDetail({agentId: 'vega', laneLine: 'FM cockpit agent detail view', openLaneCount: 17, state: 'ok'});

        expect(body(detail, 'lane').text).toBe('FM cockpit agent detail view · 17 open lanes');
        // a feed-gated pane never fabricates a stream
        expect(body(detail, 'thought-stream').text).toBe('awaiting live feed');

        // no lane reported → honest fallback, no fabricated count
        applySet(detail, {laneLine: null, openLaneCount: null});
        expect(body(detail, 'lane').text).toBe('no current lane reported');

        detail.destroy()
    });

    test('a hostile producer reason reaches the readout as TEXT, never as markup (@neo-gpt\'s exact probe)', () => {
        // The describer was never wrong: it returns the producer's reason as DATA, exactly as asked.
        // The view then interpolated that data into an `html` string, and Neo routes `html` to
        // innerHTML — so a remote adapter's sentence about its own failure became executable in the
        // cockpit. telltale.spec.mjs cannot see this: it asks what the describer RETURNS, and the
        // defect lives in what the view DOES with it. That gap is why the probe belongs here.
        //
        // The reason is the one string on this surface nobody in this repo writes.
        const hostile = '<img src=x onerror=globalThis.PWNED=1>',
              detail  = createDetail({
                  agentId : 'vega',
                  state   : 'ok',
                  wake    : {state: 'on'},
                  throttle: {source: 'fleet:throttle', state: 'unknown', confidence: 'none', reason: hostile}
              });

        const telltale = detail.down({reference: 'detail-telltale'});

        // the sink itself: ANY html on this node re-opens the hole regardless of today's content
        expect(telltale.html).toBeFalsy();

        const nodes = telltale.vdom.cn ?? [],
              texts = nodes.map(node => node.text ?? '');

        // carried, inert, and still READABLE — an operator needs the producer's evidence, so escaping
        // it out of existence would be its own defect
        expect(texts.some(text => text.includes(hostile))).toBe(true);

        // …and nowhere as markup, on any node
        nodes.forEach(node => {
            expect(node.html).toBeFalsy();
            (node.cls ?? []).forEach(cls => expect(cls).not.toContain('<'))
        });

        expect(globalThis.PWNED).toBeUndefined();

        delete globalThis.PWNED;
        detail.destroy()
    });

    test('an honest reason still renders alongside both axes — the guard must not eat the evidence', () => {
        const detail = createDetail({
            agentId : 'vega',
            state   : 'ok',
            wake    : {state: 'on'},
            throttle: {source: 'fleet:throttle', state: 'unknown', confidence: 'none', reason: 'no throttle reader injected'}
        });

        const texts = (detail.down({reference: 'detail-telltale'}).vdom.cn ?? []).map(node => node.text ?? '');

        // both axes always, and the reason with them: the detail is the opposite of the card's
        // exception-based chip
        expect(texts.some(text => text.includes('no throttle reader injected'))).toBe(true);
        expect(texts.some(text => text.includes('throttle: unknown'))).toBe(true);
        expect(texts.some(text => text.includes('wake: on'))).toBe(true);

        detail.destroy()
    });

    test('the drill-in states all three source facts unconditionally — the counterpart to the card\'s one word-line', () => {
        // the default fixture wires all three (roster/repo/runtime observed). The detail is the opposite
        // of the card's exception-based strip: every source states itself, with its producer, always —
        // an operator who drilled in needs "runtime: wired, observed by X" confirmed, never omitted.
        const detail  = createDetail({agentId: 'vega', state: 'ok'}),
              sources = detail.down({reference: 'detail-sources'});

        // the same sink guard the telltale carries: ANY html on this node re-opens the innerHTML hole
        expect(sources.html).toBeFalsy();

        const texts = (sources.vdom.cn ?? []).map(node => node.text ?? '');

        // all three, in full words, each with confidence AND its producer literal — the provenance the
        // compact card had no room for, which is the entire point of the drill-in
        expect(texts.some(text => text.includes('Runtime: wired · observed'))).toBe(true);
        expect(texts.some(text => text.includes('Repository: wired · observed'))).toBe(true);
        expect(texts.some(text => text.includes('Roster: wired · observed'))).toBe(true);
        expect(texts.some(text => text.includes('fleet:runtimeStatus'))).toBe(true);

        detail.destroy()
    });

    test('a not-wired source states its condition in TEXT and earns the state colour — never colour alone', () => {
        // runtime reader absent → normalizeFleetSources fails it closed to not-wired. The detail must SAY
        // "not wired", not merely tint it — colour is never the sole bearer of the meaning (WCAG 1.4.1).
        const detail = createDetail({
            agentId: 'vega',
            state  : 'ok',
            sources: {
                roster    : {source: 'fleet:listAgents',  state: 'wired', confidence: 'observed'},
                repoStatus: {source: 'fleet:fleetStatus', state: 'wired', confidence: 'observed'},
                runtime   : null // absent → fails closed to not-wired + none
            }
        });

        const nodes       = detail.down({reference: 'detail-sources'}).vdom.cn ?? [],
              runtimeNode = nodes.find(node => (node.text ?? '').startsWith('Runtime:'));

        expect(runtimeNode.text).toContain('not wired');
        expect(runtimeNode.cls).toContain('fm-detail-sources-not-wired');

        // the readout stays unconditional — the two wired sources still state themselves
        const texts = nodes.map(node => node.text ?? '');
        expect(texts.some(text => text.includes('Repository: wired · observed'))).toBe(true);
        expect(texts.some(text => text.includes('Roster: wired · observed'))).toBe(true);

        detail.destroy()
    });

    test('§2.2.1 wall-clock aging: a later `now` re-classifies fresh → lost in place (time-reactive, not just re-seat)', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'}, {
            paneLedgers: {lane: {observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: 30_000}} // 10s before NOW → fresh
        });
        expect(chip(detail, 'lane').cls).toContain('is-fresh');

        // 5 minutes of wall clock later (past 4×TTL) → the SAME pane ages to lost, same instance, no
        // re-seat. Production driver: startFreshnessAging()'s timer re-runs applyPaneFreshness off the
        // live Date.now(); here the injected clock advances deterministically through afterSetNow.
        const beforeId = detail.id;
        detail.now = Date.parse('2026-07-12T00:05:00.000Z');
        expect(detail.id).toBe(beforeId);
        expect(chip(detail, 'lane').cls).toContain('is-lost');

        detail.destroy()
    });

    test('§2.2.1 the MAILBOX chip ages off the owner clock too — a fresh mailbox cannot stay fresh forever', () => {
        const detail  = createDetail({agentId: 'vega', state: 'ok'}),
              mailbox = detail.down({reference: 'mailbox-pane'});

        // a snapshot captured 10s before NOW, against the pane's 60s TTL → fresh
        mailbox.set({
            now     : NOW,
            snapshot: {
                capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt: '2026-07-11T23:59:50.000Z', reason: null},
                admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-vega', checkedAt: '2026-07-11T23:59:50.000Z', reason: null},
                page      : {limit: 50, offset: 0, count: 0},
                rows      : []
            }
        });
        expect(mailbox.getReference('mailbox-freshness').cls).toContain('is-fresh');

        // 5 minutes of wall clock later, SAME snapshot: the chip must decay. Production driver is
        // the owner's startFreshnessAging loop nudging the pane; here the injected clock advances it
        // deterministically through the same applySnapshot path.
        mailbox.now = Date.parse('2026-07-12T00:05:00.000Z');

        expect(mailbox.getReference('mailbox-freshness').cls).not.toContain('is-fresh');
        expect(mailbox.snapshot, 'aging re-labels; it never drops the data').not.toBe(null);

        detail.destroy()
    });

    test('the drill READS the mirror through the Fleet seam — the pane is fed by the verb, not by injection', async () => {
        const calls = [];

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {
            fleetMailboxMirror: async params => {
                calls.push(params);
                return mirrorSnapshot('@neo-vega', [{messageId: 'MESSAGE:real', subject: 'from the verb'}])
            }
        }};

        try {
            const detail  = createDetail({agentId: 'vega', state: 'ok'}),
                  mailbox = detail.down({reference: 'mailbox-pane'});

            await detail.loadMailboxMirror();

            // the drill itself issues the read — no injection, no manual kick required
            expect(calls.length).toBeGreaterThan(0);
            // Every read is scoped to THIS subject's MAILBOX identity — a mirror read for anyone
            // else is a leak. Note it asks for `@neo-vega`, not the registry key `vega`: the two are
            // different id spaces, and asking with the key would request a subject that does not exist.
            expect(calls.every(params => params.subjectAgentId === '@neo-vega')).toBe(true);
            expect(mailbox.getPaneState()).toBe('rows');
            expect(mailbox.snapshot.rows[0].subject).toBe('from the verb');

            detail.destroy()
        } finally {
            delete globalThis.AgentOS?.fleet
        }
    });

    test('race: a stale in-flight read for A can never land on B', async () => {
        let releaseVega;

        const vegaRead = new Promise(resolve => { releaseVega = resolve });

        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {
            fleetMailboxMirror: async ({subjectAgentId}) =>
                subjectAgentId === 'vega' ? vegaRead : mirrorSnapshot('@neo-ada', [{messageId: 'MESSAGE:ada', subject: 'ada mail'}])
        }};

        try {
            const detail  = createDetail({agentId: 'vega', state: 'ok'}),
                  mailbox = detail.down({reference: 'mailbox-pane'});

            const pending = detail.loadMailboxMirror();          // vega's read hangs

            detail.record = makeRecord({agentId: 'ada', state: 'ok'});   // drill B while A is in flight
            await detail.loadMailboxMirror();                     // ada's read lands first

            releaseVega(mirrorSnapshot('@neo-vega', [{messageId: 'MESSAGE:vega', subject: 'VEGA PRIVATE MAIL'}]));
            await pending;                                        // vega's stale read resolves LAST

            // the newest drill wins: vega's late answer must be dropped on the floor, not rendered
            expect(mailbox.record.agentId).toBe('ada');
            expect(JSON.stringify(mailbox.snapshot)).not.toContain('VEGA PRIVATE MAIL');
            expect(mailbox.snapshot.rows[0].subject).toBe('ada mail');

            detail.destroy()
        } finally {
            delete globalThis.AgentOS?.fleet
        }
    });

    test('the read fails closed: an absent verb or a throw leaves the pane honestly unobserved', async () => {
        (globalThis.AgentOS ??= {}).fleet = {registryBridge: {}};   // bridge without the verb

        try {
            const detail  = createDetail({agentId: 'vega', state: 'ok'}),
                  mailbox = detail.down({reference: 'mailbox-pane'});

            await detail.loadMailboxMirror();
            expect(mailbox.snapshot).toBe(null);
            expect(mailbox.getPaneState()).toBe('unobserved');

            globalThis.AgentOS.fleet.registryBridge = {fleetMailboxMirror: async () => { throw new Error('bridge boom') }};
            await detail.loadMailboxMirror();

            // never a fabricated snapshot, and never "no mail" for a read that did not happen
            expect(mailbox.snapshot).toBe(null);
            expect(mailbox.getPaneState()).toBe('unobserved');

            detail.destroy()
        } finally {
            delete globalThis.AgentOS?.fleet
        }
    });

    test('subject possession: a re-seat onto a DIFFERENT resident drops the previous subject mail', () => {
        const detail  = createDetail({agentId: 'vega', state: 'ok'}),
              mailbox = detail.down({reference: 'mailbox-pane'});

        // the wiring has supplied vega's inbox
        mailbox.snapshot = {
            capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt: '2026-07-12T00:00:00.000Z', reason: null},
            admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-vega', checkedAt: '2026-07-12T00:00:00.000Z', reason: null},
            page      : {limit: 50, offset: 0, count: 1},
            rows      : [{messageId: 'MESSAGE:vega-only', subject: 'vega private mail', from: '@neo-gpt', recipientClass: 'agent', priority: 'high', status: 'unread', taskState: null, partOfThread: null, relatedTickets: [], wakeSuppressed: false, sentAt: '2026-07-12T00:00:00.000Z', readAt: null}]
        };
        expect(mailbox.getPaneState()).toBe('rows');

        // drill a DIFFERENT resident: vega's mail must not render under ada's name
        detail.record = makeRecord({agentId: 'ada', state: 'ok'});

        expect(mailbox.record.agentId).toBe('ada');
        expect(mailbox.snapshot, "a subject's mail cannot survive onto another subject").toBe(null);
        expect(mailbox.getPaneState()).toBe('unobserved');

        detail.destroy()
    });

    test('subject possession: a SAME-subject re-seat (roster refresh) keeps the snapshot', () => {
        const detail   = createDetail({agentId: 'vega', state: 'ok'}),
              mailbox  = detail.down({reference: 'mailbox-pane'}),
              snapshot = {
                  capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt: '2026-07-12T00:00:00.000Z', reason: null},
                  admission : {state: 'granted', viewerIdentity: '@tobiu', subjectAgentId: '@neo-vega', checkedAt: '2026-07-12T00:00:00.000Z', reason: null},
                  page      : {limit: 50, offset: 0, count: 0},
                  rows      : []
              };

        mailbox.snapshot = snapshot;

        // a roster refresh restamps the SAME resident — dropping the inbox here would blank a
        // correct pane on every poll
        applySet(detail, {state: 'starting'});

        // deep-equal, not identity: the reactive config layer may hand back an equal object, and
        // the contract is that the subject's mail SURVIVES a same-subject re-seat
        expect(mailbox.snapshot).toEqual(snapshot);
        expect(mailbox.getPaneState()).toBe('empty');

        detail.destroy()
    });

    test('the configuration tab joins on the registry key and degrades honestly without a definition (#15242)', () => {
        const definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        stores.push(definitions);

        const
            detail = createDetail({agentId: 'ada', displayName: 'Ada'}, {agentDefinitions: definitions}),
            card   = detail.getReference('config-pane');

        // the join: FleetAgent.agentId === AgentDefinition.id (the Fleet Registry key)
        expect(card.record).toBe(definitions.get('ada'));

        // a resident with NO stored definition renders the tab's honest empty line — never a
        // fabricated config, and never the keeper-view's off-context "select an agent" copy
        detail.record = makeRecord({agentId: 'ghost', displayName: 'Ghost'});
        expect(card.record).toBeNull();
        expect(JSON.stringify(card.vdom.cn)).toContain('no stored definition');

        detail.destroy()
    });

    test('the configuration tab receives the exact provider tenant Store and tracks its live availability', () => {
        const
            definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
                {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
            ]}),
            tenants = Neo.create(FleetTenants, {data: [{
                id: 'tenant-a', endpoint: 'https://tenant.example.com', status: 'connected'
            }]});

        stores.push(definitions, tenants);

        const
            detail = createDetail(
                {agentId: 'ada', displayName: 'Ada'},
                {agentDefinitions: definitions, fleetTenants: tenants}
            ),
            card = detail.getReference('config-pane');

        expect(card.tenantStore).toBe(tenants);
        expect(JSON.stringify(card.vdom.cn)).toContain('https://tenant.example.com');
        expect(JSON.stringify(card.vdom.cn)).not.toContain('Unavailable');

        tenants.get('tenant-a').set({status: 'disconnected'});

        expect(JSON.stringify(card.vdom.cn)).toContain('https://tenant.example.com · Unavailable');

        const replacement = Neo.create(FleetTenants, {data: [{
            id: 'tenant-b', endpoint: 'https://replacement.example.com', status: 'connected'
        }]});

        stores.push(replacement);
        detail.fleetTenants = replacement;

        expect(card.tenantStore).toBe(replacement);
        expect(JSON.stringify(card.vdom.cn)).toContain('https://replacement.example.com');

        detail.destroy()
    });

    test('a config intent from the tab runs the shared round-trip: readback lands on the record, status renders (#15242)', async () => {
        const definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        stores.push(definitions);

        const detail = createDetail({agentId: 'ada', displayName: 'Ada'}, {agentDefinitions: definitions});

        // AgentOS is the APP NAMESPACE — deleting it would unregister every AgentOS.* class for
        // the tests that follow in this worker. Stub the `fleet` key only, and restore it.
        const priorFleet = globalThis.AgentOS?.fleet;

        globalThis.AgentOS ??= {};
        globalThis.AgentOS.fleet = {registryBridge: {configureAgent: async intent => {
            // the runner curates the wire intent: no event envelope may cross
            expect(Object.keys(intent).sort()).toEqual(['harnessType', 'id']);
            return {status: 'accepted', agent: {id: 'ada', harnessType: intent.harnessType, mcpServers: null}}
        }}};

        await detail.onConfigIntent({id: 'ada', harnessType: 'claude-code', source: 'evt-noise'});

        // only the RESPONSE mutated the record; the tab's card re-rendered through its own sink
        expect(definitions.get('ada').harnessType).toBe('claude-code');
        expect(JSON.stringify(detail.getReference('config-pane').vdom.cn)).toContain('Configuration saved.');

        globalThis.AgentOS.fleet = priorFleet;
        detail.destroy()
    });

    test('an external definition write (another owner\'s readback) refreshes the seated tab in place (#15242)', () => {
        const definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        stores.push(definitions);

        const detail = createDetail({agentId: 'ada', displayName: 'Ada'}, {agentDefinitions: definitions});

        // e.g. the Accounts keeper-view lands an accepted readback on the SAME store record —
        // record identity unchanged, so the card's reactive `record` never re-fires; the store's
        // recordChange → the detail's refresh keeps the tab live (the same-record contract).
        // statusText is asserted because the card renders it RAW — a harnessType would render its
        // registry LABEL (or the fail-closed "Unknown harness"), making the raw string a blind probe.
        definitions.get('ada').set({statusText: 'externally refreshed'});

        expect(JSON.stringify(detail.getReference('config-pane').vdom.cn)).toContain('externally refreshed');

        detail.destroy()
    });

    test('a definition ADDED after mount seats the tab; REMOVED clears it to the honest empty state (#15440)', () => {
        const definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: []});
        stores.push(definitions);

        const
            detail = createDetail({agentId: 'ada', displayName: 'Ada'}, {agentDefinitions: definitions}),
            card   = detail.getReference('config-pane');

        // mounted BEFORE its definition exists — the honest empty line, not a fabricated config
        expect(card.record).toBeNull();

        // membership delivers the definition later (e.g. the S5 zone's accepted readback upsert)
        definitions.add({id: 'ada', githubUsername: 'ada', harnessType: 'codex'});
        expect(card.record).toBe(definitions.get('ada'));

        // removal must clear the seat — a removed definition rendering on is a stale ghost
        definitions.remove(definitions.get('ada'));
        expect(card.record).toBeNull();

        detail.destroy()
    });

    test('a wholesale reload re-seats the tab onto the NEW record instance (#15440)', () => {
        const definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        stores.push(definitions);

        const
            detail = createDetail({agentId: 'ada', displayName: 'Ada'}, {agentDefinitions: definitions}),
            card   = detail.getReference('config-pane'),
            first  = definitions.get('ada');

        expect(card.record).toBe(first);

        // a reload replaces membership wholesale: same id, NEW record instance — the reactive
        // `record` config would suppress a same-identity write, so the re-seat must carry the swap
        definitions.clear();
        definitions.add({id: 'ada', githubUsername: 'ada', harnessType: 'claude-code'});

        const second = definitions.get('ada');

        expect(second).not.toBe(first);
        expect(card.record).toBe(second);

        detail.destroy()
    });

    test('destroy detaches the provider-owned store listeners — no zombie re-seat, no zombie recordChange (#15440)', () => {
        const definitions = Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data: [
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]});
        stores.push(definitions);

        // the spies must be installed BEFORE construction: the listener registry captures the fn
        // ref at on() time, so only a pre-construct prototype patch makes the registered ref the spy
        const
            calls             = {mutation: 0, recordChange: 0},
            originalMutation  = AgentDetail.prototype.onDefinitionsStoreMutation,
            originalRecChange = AgentDetail.prototype.onDefinitionRecordChange;

        AgentDetail.prototype.onDefinitionsStoreMutation = function(...args) {
            calls.mutation++;
            return originalMutation.apply(this, args)
        };
        AgentDetail.prototype.onDefinitionRecordChange = function(...args) {
            calls.recordChange++;
            return originalRecChange.apply(this, args)
        };

        try {
            const detail = createDetail({agentId: 'ada', displayName: 'Ada'}, {agentDefinitions: definitions});

            // positive control: the live listeners DO fire through real store mutations
            definitions.add({id: 'grace', githubUsername: 'grace', harnessType: 'codex'});
            definitions.get('ada').set({statusText: 'still alive'});

            const alive = {...calls};
            expect(alive.mutation).toBeGreaterThan(0);
            expect(alive.recordChange).toBeGreaterThan(0);

            detail.destroy();

            // the store OUTLIVES the view (provider-owned) — post-destroy mutations must not reach it
            definitions.add({id: 'clio', githubUsername: 'clio', harnessType: 'codex'});
            definitions.get('ada').set({statusText: 'after teardown'});

            expect(calls.mutation).toBe(alive.mutation);
            expect(calls.recordChange).toBe(alive.recordChange)
        } finally {
            AgentDetail.prototype.onDefinitionsStoreMutation = originalMutation;
            AgentDetail.prototype.onDefinitionRecordChange   = originalRecChange
        }
    });
});
