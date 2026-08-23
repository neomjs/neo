import {setup} from '../../../../setup.mjs';

const appName = 'FleetActivityComposerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary The producer for the slot `FleetControlBridge` has consumed since it was written.
 *
 * Events merge trivially; SIGHT does not — and that asymmetry is the whole reason this module exists.
 * A degraded adapter contributes zero events, which is byte-identical to a healthy adapter on a quiet
 * fleet. The event list therefore cannot carry the difference, and the capability is the only place it
 * can survive. Every test below is aimed at that single claim: the composite never reports more sight
 * than it has.
 */
test.describe('fleetActivityComposer — composing two truths means composing two capabilities', () => {
    let createFleetActivityReadSource;

    const wired = (events = [], counts = []) => async () => ({
        capability: {source: 'fleet:a2a', state: 'wired', confidence: 'observed'},
        counts,
        events
    });

    const degraded = (source, reason) => async () => ({
        capability: {source, state: 'degraded', confidence: 'none', reason},
        events    : []
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/fleet/fleetActivityComposer.mjs');
        createFleetActivityReadSource = mod.createFleetActivityReadSource
    });

    test('both adapters wired → the composite may claim wired, and the feed merges newest-first', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : wired([{occurredAt: '2026-07-16T11:00:00.000Z', eventId: 'a2a-old'}]),
            readPrLaneSnapshot: wired([{occurredAt: '2026-07-16T12:00:00.000Z', eventId: 'pr-new'}])
        });

        const {capability, events} = await source.readActivitySnapshot();

        expect(capability.state).toBe('wired');
        expect(capability.confidence).toBe('observed');
        expect(capability.reason).toBeNull();
        // one feed, not two lists stapled together
        expect(events.map(event => event.eventId)).toEqual(['pr-new', 'a2a-old'])
    });

    test('keeps only producer-complete source counts — never promotes a partial slot into a fleet total', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot: wired([], [{
                source    : 'memory-core:mailbox',
                scope     : 'total',
                value     : 2159,
                complete  : true,
                capturedAt: '2026-08-22T21:00:00.000Z'
            }, {
                source    : 'memory-core:mailbox',
                scope     : 'last24h',
                value     : 42,
                complete  : false,
                capturedAt: '2026-08-22T21:00:00.000Z'
            }]),
            readPrLaneSnapshot: wired([], [{scope: 'total', value: 999, complete: true, capturedAt: '2026-08-22T21:00:00.000Z'}])
        });

        const {counts} = await source.readActivitySnapshot();

        expect(counts).toEqual([{
            source    : 'memory-core:mailbox',
            scope     : 'total',
            value     : 2159,
            complete  : true,
            capturedAt: '2026-08-22T21:00:00.000Z'
        }])
    });

    test('drops missing identities and collapses repeated producer ids newest-first', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot: wired([
                {eventId: 'a2a:one', occurredAt: '2026-07-16T11:00:00.000Z'},
                {occurredAt: '2026-07-16T11:30:00.000Z'}
            ]),
            readPrLaneSnapshot: wired([
                {eventId: 'a2a:one', occurredAt: '2026-07-16T12:00:00.000Z'}
            ])
        });

        const {events} = await source.readActivitySnapshot();

        expect(events).toEqual([{eventId: 'a2a:one', occurredAt: '2026-07-16T12:00:00.000Z'}])
    });

    test('ONE blind adapter degrades the composite — a half-feed must not read as the whole fleet', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : wired([{occurredAt: '2026-07-16T11:00:00.000Z', eventId: 'a2a-1'}]),
            readPrLaneSnapshot: degraded('fleet:pr-lane', 'github unreachable')
        });

        const {capability, events} = await source.readActivitySnapshot();

        // The events look perfectly healthy — one real row, nothing obviously missing. That is exactly
        // why `wired` here would be a lie the caller could never detect.
        expect(events.map(event => event.eventId)).toEqual(['a2a-1']);

        expect(capability.state).toBe('degraded');
        expect(capability.confidence).toBe('none');
        // attributed by the composer-owned SLOT, not the adapter's self-reported source
        expect(capability.reason).toContain('pr-lane');
        expect(capability.reason).toContain('github unreachable')
    });

    test('BOTH blind → not-wired, not degraded — half a feed and none of it are different facts', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : degraded('fleet:a2a', 'mailbox unreadable'),
            readPrLaneSnapshot: degraded('fleet:pr-lane', 'github unreachable')
        });

        const {capability} = await source.readActivitySnapshot();

        expect(capability.state).toBe('not-wired');
        // BOTH slots are named: an operator debugging a dead feed must not fix one adapter and wonder
        // why nothing changed.
        expect(capability.reason).toContain('a2a');
        expect(capability.reason).toContain('pr-lane')
    });

    test('a wired composite with NO events says so — "nothing happened" is not "we could not look"', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : wired([]),
            readPrLaneSnapshot: wired([])
        });

        const {capability, events} = await source.readActivitySnapshot();

        // The AC that makes the whole module worth having: an empty list under a WIRED capability is a
        // quiet fleet; the same empty list under a degraded one is blindness. Identical events, and the
        // capability is the only thing that separates them.
        expect(events).toEqual([]);
        expect(capability.state).toBe('wired')
    });

    test('a THROWING adapter degrades rather than taking the snapshot down with it', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => { throw new Error('mailbox exploded') },
            readPrLaneSnapshot: wired([{occurredAt: '2026-07-16T12:00:00.000Z', eventId: 'pr-1'}])
        });

        const {capability, events} = await source.readActivitySnapshot();

        expect(capability.state).toBe('degraded');
        expect(capability.reason).toContain('mailbox exploded');
        // the half that CAN be read still reaches the cockpit — degraded is not blank
        expect(events.map(event => event.eventId)).toEqual(['pr-1'])
    });

    test('the caller\'s limit bounds the MERGED feed, and reaches both adapters', async () => {
        const seen      = [];
        const recording = id => async params => {
            seen.push([id, params.limit]);
            return {capability: {source: id, state: 'wired', confidence: 'observed'}, events: [
                {occurredAt: '2026-07-16T12:00:00.000Z', eventId: `${id}-a`},
                {occurredAt: '2026-07-16T11:00:00.000Z', eventId: `${id}-b`}
            ]}
        };

        const source = createFleetActivityReadSource({
            readA2ASnapshot   : recording('a2a'),
            readPrLaneSnapshot: recording('pr')
        });

        const {events} = await source.readActivitySnapshot({limit: 3});

        // bounding only the merge would let each adapter read unboundedly and throw the surplus away
        expect(seen).toEqual([['a2a', 3], ['pr', 3]]);
        expect(events).toHaveLength(3)
    });

    test('a SYNCHRONOUS throw is contained — Promise.resolve(read()) never sees it', async () => {
        // @neo-gpt-emmy's RA-2. `Promise.resolve(read(params))` evaluates the call BEFORE the wrapper
        // exists, so a sync throw escapes the .catch and takes the whole snapshot down. An async stub
        // cannot surface it — which is why the original "throwing adapter" test passed over this.
        // A real adapter validating its arguments throws exactly this way.
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : () => { throw new Error('sync validation failure') },
            readPrLaneSnapshot: wired([{occurredAt: '2026-07-16T12:00:00.000Z', eventId: 'pr-1'}])
        });

        const {capability, events} = await source.readActivitySnapshot();

        expect(capability.state).toBe('degraded');
        expect(capability.reason).toContain('sync validation failure');
        expect(events.map(event => event.eventId)).toEqual(['pr-1'])
    });

    test('failure attribution is by SLOT, not by the adapter\'s self-report', async () => {
        // A broken contributor claiming another's source would send the operator to a healthy adapter.
        // The reason line is the one surface that exists to be trusted when things break; it must not
        // be forgeable by the thing that broke.
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => ({capability: {source: 'fleet:pr-lane', state: 'degraded', confidence: 'none', reason: 'mislabelled'}, events: []}),
            readPrLaneSnapshot: wired([])
        });

        const {capability} = await source.readActivitySnapshot();

        // the A2A slot failed, and the reason says so despite the adapter naming pr-lane
        expect(capability.reason).toContain('a2a');
        expect(capability.reason).not.toMatch(/^pr-lane/)
    });

    test('a failure reason is capped and single-line — it is rendered to an operator', async () => {
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => { throw new Error('x'.repeat(5000) + '\nsecond line') },
            readPrLaneSnapshot: wired([])
        });

        const {capability} = await source.readActivitySnapshot();

        // unbounded: an Error message has no length contract, and this travels into the projection
        expect(capability.reason.length).toBeLessThan(300);
        expect(capability.reason).not.toContain('\n')
    });

    test('NO credential family reaches the composed reason — the whole matrix, not one branch', async () => {
        // @neo-gpt's controlled production probe of the first fix, which I had shipped as "credential
        // redaction" on the strength of a single Bearer witness:
        //
        //   ghp_A…        leaked=true  redacted=true    ← the deceptive row
        //   github_pat_A… leaked=true  redacted=false
        //   glpat-A…      leaked=true  redacted=false
        //   Bearer …      leaked=false redacted=true    ← the only branch I tested
        //
        // The first row is the whole lesson: the replacement was DERIVED from the match
        // (`match.split(/[:=\s]/)[0]`), which assumes every match is `key: value`. A bare token has no
        // delimiter, so the entire secret became the "label" and was printed beside the word
        // [redacted]. It reported itself handled while carrying the credential — which is why
        // `toContain('[redacted]')` was green on a leak, and why every row below asserts ABSENCE of
        // the secret first and the marker second.
        const secrets = [
            ['bearer header',    'GET /api failed: Authorization: Bearer super-secret-token-value abc', 'super-secret-token-value'],
            ['bare classic PAT', 'push rejected for ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234',             'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGG1234'],
            ['bare fine PAT',    'push rejected for github_pat_11ABCDE0Y0abcdefgh_XYZ123',              'github_pat_11ABCDE0Y0abcdefgh_XYZ123'],
            ['bare GitLab PAT',  'clone failed for glpat-AAAABBBBCCCC-1234',                            'glpat-AAAABBBBCCCC-1234'],
            ['keyed secret',     'auth failed: token=s3cr3t-value-here, retrying',                      's3cr3t-value-here'],
            ['basic header',     'GET /api failed: Authorization: Basic dXNlcjpwYXNzd29yZA== next',     'dXNlcjpwYXNzd29yZA=='],
            // The credentials run to the END of the header value, not to the first delimiter. RFC 7235
            // allows a token68 OR a comma-separated auth-param list, and Digest uses the list — so
            // stopping at the first comma redacted `username` and published `response`, which IS the
            // credential, with `[redacted]` printed beside it. The single-token case was the one I
            // tested, so the single-token case was the one that worked.
            ['digest auth-param list', 'GET failed: Authorization: Digest username="u", realm="r", nonce="abc", response="deadbeefcafe1234"', 'deadbeefcafe1234'],
            // @neo-opus-grace's line, against a patch I had just prescribed to her: an allow-list of
            // four degrades on the FIFTH. These four are the schemes nobody taught the list — none of
            // them appears anywhere in the module, which is the point of the rows.
            ['ntlm',      'GET failed: Authorization: NTLM TlRMTVNTUAABAAAAB4IIogAAAAA=',                                'TlRMTVNTUAABAAAAB4IIogAAAAA='],
            ['negotiate', 'GET failed: Authorization: Negotiate YIIZkAYGKwYBBQUCoIIZ',                                   'YIIZkAYGKwYBBQUCoIIZ'],
            ['hawk',      'GET failed: Authorization: Hawk id="dh37", mac="6R4rV5iE+NPoym"',                             '6R4rV5iE+NPoym'],
            ['aws sigv4', 'GET failed: Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7/20260717, Signature=deadbeef', 'deadbeef']
        ];

        for (const [label, message, secret] of secrets) {
            const source = createFleetActivityReadSource({
                readA2ASnapshot   : async () => { throw new Error(message) },
                readPrLaneSnapshot: wired([])
            });

            const {capability} = await source.readActivitySnapshot();

            expect(capability.reason, `${label}: the secret must not survive`).not.toContain(secret);
            expect(capability.reason, `${label}: a redaction marker must remain`).toMatch(/\[redacted(-token)?]/);
            // the operator still learns WHICH slot failed — a reason of pure [redacted] debugs nothing
            expect(capability.reason, `${label}: attribution must survive`).toContain('a2a')
        }
    });

    test('the redactor does not eat the diagnostic — an absence assertion alone cannot see over-redaction', async () => {
        // @neo-opus-grace's control, and the necessary other half of the matrix above: a redactor that
        // consumed the rest of every line would pass EVERY "secret is absent" row while destroying the
        // reason this module exists to carry. Redacting the auth header deliberately over-consumes an
        // unknown trailing token — a word of lost context is cheap, a published credential is not — so
        // the bound has to be witnessed, not assumed.
        const honest = [
            ['keyed secret mid-sentence', 'auth failed: token=sk-live-1, retry after 30s', 'retry after 30s'],
            ['no credential at all',      'ECONNREFUSED contacting api.github.com:443',    'ECONNREFUSED contacting api.github.com:443']
        ];

        for (const [label, message, mustSurvive] of honest) {
            const source = createFleetActivityReadSource({
                readA2ASnapshot   : async () => { throw new Error(message) },
                readPrLaneSnapshot: wired([])
            });

            const {capability} = await source.readActivitySnapshot();

            expect(capability.reason, `${label}: the operator's evidence must survive`).toContain(mustSurvive)
        }
    });

    test('a LOCALLY-created degraded capability is attributed to its slot, not to "unknown slot"', async () => {
        // The existing slot witness only covered a capability the adapter RETURNED. The degraded one
        // this module builds itself omitted the `slot` field the healthy path sets, so composeCapability
        // read undefined and printed `unknown slot: a2a: …` — the attribution lost, and the prefix
        // doubled. Two return paths of one function disagreeing about their own contract.
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => ({events: []}),   // no capability: has not reported sight
            readPrLaneSnapshot: wired([])
        });

        const {capability} = await source.readActivitySnapshot();

        expect(capability.reason).not.toContain('unknown slot');
        expect(capability.reason).toContain('a2a: returned no capability')
    });

    test('the COMPOSITE reason is capped — bounding the parts does not bound the join', async () => {
        // Two blind slots at the per-reason cap, plus prefixes and the separator, reached ~430 chars
        // through a guard whose stated purpose was that one failure cannot flood the pane. The operator
        // reads the composite, so the composite is the thing that must be bounded.
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => { throw new Error('a'.repeat(5000)) },
            readPrLaneSnapshot: async () => { throw new Error('b'.repeat(5000)) }
        });

        const {capability} = await source.readActivitySnapshot();

        expect(capability.state).toBe('not-wired');
        expect(capability.reason.length).toBeLessThanOrEqual(200)
    });

    test('a misconfigured fallback fails LOUD — the guard against an unbounded read must not unbound it', async () => {
        // normalizeBound guarded the CALLER's limit and then handed `Math.min(-1, MAX)` === -1 to every
        // adapter as the fallback for each refused request. The clamp obeyed a misconfiguration exactly
        // as readily as it had obeyed a hostile caller. Refused once at construction, where the missing
        // readers are already refused, rather than silently on every later call.
        for (const bad of [-1, 0, NaN, 1e9, 'many', null]) {
            expect(() => createFleetActivityReadSource({
                readA2ASnapshot   : wired([]),
                readPrLaneSnapshot: wired([]),
                limit             : bad
            }), `configured limit ${String(bad)} must be refused at construction`).toThrow(TypeError)
        }
    });

    test('an unusable bound falls back to the default — a caller cannot unbound the read', async () => {
        // `params.limit ?? limit` obeyed -1, NaN and 0. The bound reaches the adapters verbatim, so a
        // bad one is a caller-controlled unbounded read, not a display quirk.
        for (const bad of [-1, 0, NaN, 'many', null]) {
            const seen   = [];
            const source = createFleetActivityReadSource({
                readA2ASnapshot   : async params => { seen.push(params.limit); return {capability: {source: 'a', state: 'wired'}, events: []} },
                readPrLaneSnapshot: async params => { seen.push(params.limit); return {capability: {source: 'b', state: 'wired'}, events: []} },
                limit             : 50
            });

            await source.readActivitySnapshot({limit: bad});
            expect(seen, `limit ${String(bad)} must not reach the adapters`).toEqual([50, 50])
        }
    });

    test('an UNBOUNDED bound is clamped — the default is not a maximum', async () => {
        // @neo-opus-vega's falsifier. The first cut refused -1/0/NaN/'many' and obeyed 1e9 — so it
        // guarded the malformed class and left the one this guard's own JSDoc names: `params` arrives
        // over the wire, so the ceiling was caller-chosen against a producer that fans out to every
        // adapter. The reason string was capped in this same file; the count was not.
        for (const huge of [1e9, Number.MAX_SAFE_INTEGER, 201]) {
            const seen   = [];
            const source = createFleetActivityReadSource({
                readA2ASnapshot   : async params => { seen.push(params.limit); return {capability: {source: 'a', state: 'wired'}, events: []} },
                readPrLaneSnapshot: async params => { seen.push(params.limit); return {capability: {source: 'b', state: 'wired'}, events: []} },
                limit             : 25
            });

            await source.readActivitySnapshot({limit: huge});
            expect(seen, `limit ${huge} must be clamped, not obeyed`).toEqual([200, 200])
        }
    });

    test('the clamp caps the RESULT too — a slot cannot answer past the ceiling', async () => {
        // Vega's own observation about boundEvents, pinned: bounding only the REQUEST trusts the
        // adapters to honour it. A slot returning more than asked must not blow the cap.
        const flood = async () => ({
            capability: {source: 'a', state: 'wired', confidence: 'observed'},
            events    : Array.from({length: 500}, (_, index) => ({occurredAt: `2026-07-16T${String(index % 24).padStart(2, '0')}:00:00.000Z`, eventId: `e-${index}`}))
        });
        const source = createFleetActivityReadSource({readA2ASnapshot: flood, readPrLaneSnapshot: flood, limit: 25});

        const {events} = await source.readActivitySnapshot({limit: 1e9});

        expect(events.length).toBe(200)
    });

    test('an honest bound below the ceiling is untouched', async () => {
        // Without this, "clamp everything to 200" would satisfy the tests above and silently ignore
        // every caller's actual request.
        const seen   = [];
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async params => { seen.push(params.limit); return {capability: {source: 'a', state: 'wired'}, events: []} },
            readPrLaneSnapshot: async params => { seen.push(params.limit); return {capability: {source: 'b', state: 'wired'}, events: []} },
            limit             : 25
        });

        await source.readActivitySnapshot({limit: 7});
        expect(seen).toEqual([7, 7])
    });

    test('a contributor returning NO capability has not reported sight', async () => {
        // Inventing a capability for a malformed answer is the exact failure this module prevents.
        const source = createFleetActivityReadSource({
            readA2ASnapshot   : async () => undefined,
            readPrLaneSnapshot: wired([])
        });

        const {capability} = await source.readActivitySnapshot();

        expect(capability.state).toBe('degraded');
        expect(capability.reason).toContain('a2a')
    });

    test('fails LOUD on a missing reader — a one-legged composite is not the fleet\'s activity', () => {
        expect(() => createFleetActivityReadSource({readA2ASnapshot: wired([])}))
            .toThrow(/readA2ASnapshot and readPrLaneSnapshot must be injected/);
        expect(() => createFleetActivityReadSource({readPrLaneSnapshot: wired([])}))
            .toThrow(/readA2ASnapshot and readPrLaneSnapshot must be injected/);
        expect(() => createFleetActivityReadSource())
            .toThrow(/must be injected/)
    })
});

/**
 * @summary The composition, with NO double between the halves.
 *
 * Two suites can both be green over code that cannot run: when each stubs the other, both agree with
 * a contract neither honours, and the mismatch surfaces only in production. The suite above has that
 * hole by construction — it proves the composer against one reading of the bridge's contract.
 *
 * This binds the REAL `FleetControlBridge` to the REAL composer. If the producer does not satisfy the
 * consumer, this is the only test here that can say so.
 */
test.describe('fleetActivityComposer ↔ FleetControlBridge — the real consumer calls the real producer', () => {
    let FleetControlBridge, createFleetActivityReadSource;

    test.beforeAll(async () => {
        FleetControlBridge           = (await import('../../../../../../ai/services/fleet/FleetControlBridge.mjs')).default;
        createFleetActivityReadSource = (await import('../../../../../../ai/services/fleet/fleetActivityComposer.mjs')).createFleetActivityReadSource
    });

    test.afterEach(() => { FleetControlBridge.activitySource = null });

    test('the bridge accepts the composer as its activitySource and gets a composed snapshot back', async () => {
        const seen = [];

        FleetControlBridge.activitySource = createFleetActivityReadSource({
            readA2ASnapshot: async params => {
                seen.push(['a2a', params.limit]);
                return {
                    capability: {source: 'fleet:a2a', state: 'wired', confidence: 'observed'},
                    events    : [{occurredAt: '2026-07-16T11:00:00.000Z', eventId: 'a2a-1'}]
                }
            },
            readPrLaneSnapshot: async params => {
                seen.push(['pr-lane', params.limit]);
                return {
                    capability: {source: 'fleet:pr-lane', state: 'wired', confidence: 'observed'},
                    events    : [{occurredAt: '2026-07-16T12:00:00.000Z', eventId: 'pr-1'}]
                }
            }
        });

        // the bridge's own verb, not a direct call to the source
        const result = await FleetControlBridge.fleetActivity({limit: 25});

        // The bridge forwards its bounds verbatim (FleetControlBridge.mjs:355) — so the caller's limit
        // must reach BOTH adapters through the composer, not stop at it.
        expect(seen).toEqual([['a2a', 25], ['pr-lane', 25]]);

        expect(result.capability.state).toBe('wired');
        expect(result.capability.source).toBe('fleet:activity-adapters');
        expect(result.events.map(event => event.eventId)).toEqual(['pr-1', 'a2a-1'])
    });

    test('a blind half reaches the bridge as degraded — the honest state survives the seam', async () => {
        FleetControlBridge.activitySource = createFleetActivityReadSource({
            readA2ASnapshot   : async () => ({capability: {source: 'fleet:a2a', state: 'wired', confidence: 'observed'}, events: []}),
            readPrLaneSnapshot: async () => ({capability: {source: 'fleet:pr-lane', state: 'degraded', confidence: 'none', reason: 'github unreachable'}, events: []})
        });

        const result = await FleetControlBridge.fleetActivity();

        // The events are empty either way; only the capability distinguishes a quiet fleet from a
        // half-blind one — and it has to survive the bridge to be worth anything.
        expect(result.events).toEqual([]);
        expect(result.capability.state).toBe('degraded');
        expect(result.capability.reason).toContain('github unreachable')
    })
});
