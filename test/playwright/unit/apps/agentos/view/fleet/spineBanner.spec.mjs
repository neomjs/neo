import {test, expect}      from '@playwright/test';
import {deriveSpineBanner} from '../../../../../../../apps/agentos/view/fleet/spineBanner.mjs';

/**
 * The full derivation matrix for the cockpit's per-SPINE honesty line: `sample` (cold — the
 * spine is unreachable) beats `stale` (reachable but degraded) beats `live`; ONLY the fully
 * live spine hides the banner (nominal earns zero pixels). The slot-sync consumer is witnessed
 * directly in fleetCockpit.spec.mjs against a recording banner slot — including the owner-truth
 * immobility boundary (once live, failure exits preserve live; the transition is the dedicated
 * liveness owner's contract, not this reducer's).
 */
test.describe('fleet/spineBanner — the per-spine honesty derivation', () => {

    const STATES = ['sample', 'stale', 'live'];

    // ⭐ The daemon surface: the shell spec's "tray-state change + ONE cockpit banner with the
    // diagnosis pointer — never a popup storm". The storm clause is a property of EPISODES, not
    // renders, so it is asserted as such below rather than assumed from the return type.
    test.describe('⭐ daemon health — ONE banner per episode, ranked above a stale feed', () => {
        const live = {grid: {state: 'live'}, stream: {state: 'live'}};

        test('a stopped and a degraded daemon each speak, and `running` stays silent', () => {
            // `running` must earn zero pixels like every other nominal state.
            expect(deriveSpineBanner({...live, daemon: {state: 'running'}})).toEqual({hidden: true, kind: 'live', text: ''});

            for (const state of ['degraded', 'stopped']) {
                const result = deriveSpineBanner({...live, daemon: {state}});

                expect(result.hidden, state).toBe(false);
                expect(result.kind, state).toBe('degraded');
                // The two are different operator situations, so the SENTENCE distinguishes them —
                // not just the class. A screen reader reaches text, never a colour.
                expect(result.text, state).toContain(state === 'stopped' ? 'stopped' : 'degraded')
            }
        });

        test('⭐ daemon silence renders NOTHING and does not claim health', () => {
            // Absence is UNKNOWN, not nominal. Inventing a degradation from missing information is a
            // false alarm; claiming health from it is the fabrication. Both are wrong, so it stays
            // quiet — and the transport line already speaks when the server is silent.
            for (const daemon of [undefined, null, {}, {state: null}, {state: 'unknown'}, {state: ''}]) {
                const result = deriveSpineBanner({...live, daemon});

                expect(result.hidden, JSON.stringify(daemon)).toBe(true);
                expect(result.text, JSON.stringify(daemon)).toBe('')
            }
        });

        test('⭐ a dead daemon OUTRANKS a stale feed — the diagnosis, not the symptom', () => {
            // A dead daemon is usually what made the feed stale. Reporting the feed alone would name
            // the symptom and drop the pointer the spec asks for.
            const result = deriveSpineBanner({
                grid  : {state: 'stale', reason: 'feed went quiet'},
                stream: {state: 'stale'},
                daemon: {state: 'stopped', reason: 'orchestrator exited'}
            });

            expect(result.text).toContain('orchestrator exited');
            expect(result.text).not.toContain('last-known data');
            // Control: remove the daemon fault and the SAME input must fall back to the stale line,
            // which is what proves the daemon branch is doing the ranking rather than the text.
            expect(deriveSpineBanner({
                grid: {state: 'stale', reason: 'feed went quiet'}, stream: {state: 'stale'}
            }).text).toContain('last-known data')
        });

        test('an unreachable transport still wins — it cannot have answered a daemon pull', () => {
            const result = deriveSpineBanner({
                grid: {state: 'sample'}, stream: {state: 'live'}, daemon: {state: 'stopped'}
            });

            expect(result.kind).toBe('cold');
            expect(result.text).toContain('static roster')
        });

        test('⭐ N daemons down in ONE episode yield ONE banner — the storm clause, asserted', () => {
            // The spec's "never a popup storm" is about episodes. The derivation is total and returns
            // exactly one line whatever the fault breadth, so the storm is unrepresentable rather than
            // debounced — and a caller cannot turn three dead daemons into three banners.
            const episode = deriveSpineBanner({
                ...live,
                daemon: {state: 'stopped', reason: 'orchestrator, fleet and chroma all exited'}
            });

            expect(Array.isArray(episode)).toBe(false);
            expect(Object.keys(episode).sort()).toEqual(['hidden', 'kind', 'text']);
            expect(episode.text.match(/Agent OS/g)).toHaveLength(1);

            // And it is IDEMPOTENT across re-derivation: a polling consumer re-deriving the same
            // episode produces an identical line, so nothing accumulates per poll.
            expect(deriveSpineBanner({...live, daemon: {state: 'stopped', reason: 'orchestrator, fleet and chroma all exited'}}))
                .toEqual(episode)
        });

        test('a daemon reason cannot be supplied OR silenced by a transport sibling', () => {
            // The module's per-surface-reason doctrine, applied to the new surface: a `stale` grid
            // carrying a reason must not lend it to the daemon line.
            const result = deriveSpineBanner({
                grid  : {state: 'stale', reason: 'grid-owned cause'},
                stream: {state: 'live'},
                daemon: {state: 'degraded'}
            });

            expect(result.text).not.toContain('grid-owned cause');
            expect(result.text).toContain('check the tray state and the daemon log')
        });
    });

    test('the full 3×3 matrix: cold beats degraded beats live; only live+live hides', () => {
        for (const gridAdapterState of STATES) {
            for (const streamAdapterState of STATES) {
                const result   = deriveSpineBanner({grid: {state: gridAdapterState}, stream: {state: streamAdapterState}}),
                      anyCold  = gridAdapterState === 'sample' || streamAdapterState === 'sample',
                      anyStale = gridAdapterState === 'stale'  || streamAdapterState === 'stale',
                      expected = anyCold ? 'cold' : anyStale ? 'degraded' : 'live';

                expect(result.kind, `${gridAdapterState}×${streamAdapterState}`).toBe(expected);
                expect(result.hidden, `${gridAdapterState}×${streamAdapterState}`).toBe(expected === 'live')
            }
        }
    });

    test('cold with NO retained reason names the cause AND a remedy that EXISTS at this head', () => {
        const {text} = deriveSpineBanner({grid: {state: 'sample'}, stream: {state: 'live'}});

        expect(text).toContain('Fleet server offline');
        expect(text).toContain('the static roster');
        // the shipped transport command — also the correct mid-session restart remedy once a
        // composed launcher exists, since the app server survives a fleet-transport loss
        expect(text).toContain('npm run ai:fleet-server')
    });

    test('cold WITH a retained reason names it — and never tells the operator to start a running server', () => {
        // The shipping lie this closes: `devFleetServer` wires no `activitySource`, so a LIVE server
        // answers `fleetActivity` with `not-wired` forever. The stream keeps its seed — so `sample`
        // is honest about the DATA — but the cold copy read that as a claim about the SERVER and told
        // the operator to start a process that had just answered. One token was carrying two facts:
        // "we never reached it" and "it answered: my source is unconfigured". The retained reason is
        // what separates them, so the line names what the producer actually said.
        // the cause travels WITH the surface that produced it: the roster is healthy and has nothing
        // to say about the activity feed's silence
        const {text, kind} = deriveSpineBanner({
            grid  : {state: 'live'},
            stream: {state: 'sample', reason: 'fleet activity source not wired'}
        });

        expect(kind).toBe('cold');
        expect(text).toContain('fleet activity source not wired');
        expect(text).toContain('the static roster');
        expect(text).not.toContain('Fleet server offline');
        expect(text).not.toContain('npm run ai:fleet-server')
    });

    test('cold falls back to the generic copy for silence — the only state that implies an offline server', () => {
        // The guard against over-correcting: a torn/absent answer teaches the owner NOTHING, so there
        // is no reason to name and the generic remedy is the honest guess. An empty-ish reason must
        // not sneak through as a "cause" either.
        ['', '   ', null, undefined].forEach(degradedReason => {
            const {text} = deriveSpineBanner({grid: {state: 'sample', reason: degradedReason}, stream: {state: 'live'}});

            expect(text, JSON.stringify(degradedReason)).toContain('Fleet server offline')
        })
    });

    test('degraded names the honest data state', () => {
        const {text} = deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'stale'}});

        expect(text).toContain('degraded');
        expect(text).toContain('last-known')
    });

    test('a fully live spine renders NOTHING — zero nominal pixels', () => {
        const result = deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}});

        expect(result).toEqual({hidden: true, kind: 'live', text: ''})
    });

    // ⭐ The topology-owned cold fallback: the generic "start it: npm run ai:fleet-server"
    // advice was actively wrong inside the shell — the shell SELF-SUPPLIES its transport, so that
    // advice CAUSES the foreign-listener refusal it then mislabels as "offline". The shell's boot
    // fact (riding the brain-health wire) picks the honest line for SILENCE; a retained surface
    // reason still outranks any topology guess; the plain browser (no fact) keeps the classic copy.
    test.describe('⭐ transport-aware cold fallback — the shell fact picks the honest line', () => {
        const coldSpine = {grid: {state: 'sample'}, stream: {state: 'live'}};

        test('no shell fact (plain browser, or an unreachable shell) keeps the classic offline copy', () => {
            for (const transport of [undefined, null]) {
                const {text} = deriveSpineBanner({...coldSpine, transport});

                expect(text, JSON.stringify(transport)).toContain('Fleet server offline');
                expect(text, JSON.stringify(transport)).toContain('npm run ai:fleet-server')
            }
        });

        test('a boot in flight names itself — and never advises a manual start', () => {
            const {kind, text} = deriveSpineBanner({...coldSpine, transport: {phase: 'starting'}});

            expect(kind).toBe('cold');
            expect(text).toContain('Fleet transport starting');
            expect(text).not.toContain('npm run ai:fleet-server')
        });

        test('foreign-listener renders the named refusal, the port, and the Reconnect remedy', () => {
            // The exact case the old copy inverted: "start it" is what CREATES this state.
            const {text} = deriveSpineBanner({...coldSpine, transport: {
                fleetPort: 8083, mode: 'foreign-listener', phase: 'settled', reason: 'viewer mismatch on the reuse probe', up: false
            }});

            expect(text).toContain('another fleet server holds port 8083');
            expect(text).toContain('quit it, then Reconnect');
            expect(text).toContain('viewer mismatch on the reuse probe');
            expect(text).not.toContain('npm run ai:fleet-server')
        });

        test('foreign-listener without a carried reason falls back to the generic refusal line', () => {
            const {text} = deriveSpineBanner({...coldSpine, transport: {fleetPort: 8083, mode: 'foreign-listener', phase: 'settled', up: false}});

            expect(text).toContain('another fleet server holds port 8083');
            expect(text).toContain('listener did not prove canonical Fleet identity')
        });

        test('a settled failed boot names the failure — with and without an error detail', () => {
            const withDetail = deriveSpineBanner({...coldSpine, transport: {mode: 'spawn', phase: 'settled', up: false, error: 'fleet readiness timed out'}}),
                  bareFail   = deriveSpineBanner({...coldSpine, transport: {mode: 'spawn', phase: 'settled', up: false}});

            expect(withDetail.text).toContain('Fleet transport failed to start');
            expect(withDetail.text).toContain('fleet readiness timed out');
            expect(bareFail.text).toContain('Fleet transport failed to start');
            expect(bareFail.text).not.toContain('npm run ai:fleet-server')
        });

        test('a ready transport with cold surfaces points at Reconnect — the server just answered', () => {
            for (const mode of ['spawn', 'reuse']) {
                const {text} = deriveSpineBanner({...coldSpine, transport: {fleetPort: 8083, mode, phase: 'settled', up: true}});

                expect(text, mode).toContain('Fleet transport ready');
                expect(text, mode).toContain('Reconnect');
                expect(text, mode).not.toContain('npm run ai:fleet-server')
            }
        });

        test('⭐ a retained surface reason OUTRANKS the fact — the producer spoke, the topology only guesses', () => {
            // The roster's answered-empty retention (loadRoster's empty-unselected path) must win
            // over any transport-derived guess: what the producer SAID beats what the boot implies.
            const {text} = deriveSpineBanner({
                grid     : {state: 'sample', reason: 'server connected · fleet registry empty — define agents to go live'},
                stream   : {state: 'live'},
                transport: {mode: 'foreign-listener', phase: 'settled', up: false}
            });

            expect(text).toContain('Fleet data unavailable');
            expect(text).toContain('fleet registry empty');
            expect(text).not.toContain('another fleet server holds')
        });

        test('the fact never reaches non-cold branches: stale, daemon and live verdicts ignore it', () => {
            const transport = {mode: 'foreign-listener', phase: 'settled', up: false};

            expect(deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'stale'}, transport}).text).toContain('last-known');
            expect(deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}, daemon: {state: 'stopped'}, transport}).text).toContain('Agent OS stopped');
            expect(deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}, transport})).toEqual({hidden: true, kind: 'live', text: ''})
        })
    });

    // ⭐ The connection axis: a cockpit is a CLIENT of its fleet truth, and the connection itself
    // has states the generic ladder cannot name. Typed because the operator action differs per
    // state — "wait" (slow) is not "investigate" (unreachable), and a NAMED refusal must never
    // render as a generic offline. Consulted BEFORE any topology guess; a retained producer reason
    // still outranks every connection state. Wire-named per FLEET_WIRE_RESPONSE_STATES. `refused`
    // ships contract-first — the render row lands here, the refusal producer arrives with the
    // admission layer (S2).
    test.describe('⭐ connection axis — typed remote-connection states, before any topology guess', () => {
        const coldSpine  = {grid: {state: 'sample'}, stream: {state: 'live'}},
              staleSpine = {grid: {state: 'live'},   stream: {state: 'stale', reason: 'feed went quiet'}};

        test('connecting: a read in flight is never "server offline"', () => {
            const {kind, text} = deriveSpineBanner({...coldSpine, connection: {state: 'connecting'}});

            expect(kind).toBe('cold');
            expect(text).toContain('Connecting to the fleet plane');
            expect(text).not.toContain('Fleet server offline');
            expect(text).not.toContain('npm run ai:fleet-server')
        });

        test('refused: a NAMED refusal outranks every fallback — and carries its cause', () => {
            const withReason = deriveSpineBanner({...coldSpine, connection: {state: 'refused', reason: 'token scope insufficient'}}),
                  bare       = deriveSpineBanner({...coldSpine, connection: {state: 'refused'}});

            expect(withReason.text).toContain('The fleet plane refused this viewer');
            expect(withReason.text).toContain('token scope insufficient');
            expect(bare.text).toBe('The fleet plane refused this viewer');
            // never collapsed into the generic offline guess — the remedy differs categorically
            expect(withReason.text).not.toContain('Fleet server offline');
            expect(bare.text).not.toContain('npm run ai:fleet-server')
        });

        test('unreachable types "no route" apart from the shell boot cases — investigate the plane, not the cockpit', () => {
            const bare       = deriveSpineBanner({...coldSpine, connection: {state: 'unreachable'}}),
                  withReason = deriveSpineBanner({...coldSpine, connection: {state: 'unreachable', reason: 'ingress 502'}});

            expect(bare.text).toBe('The fleet plane is unreachable — no route answered');
            expect(withReason.text).toContain('ingress 502');
            expect(bare.text).not.toContain('Fleet server offline')
        });

        test('absent or unknown connection facts fall through to the topology-owned fallback, unchanged', () => {
            const transport = {mode: 'foreign-listener', phase: 'settled', fleetPort: 8083, up: false};

            for (const connection of [undefined, null, {}, {state: null}, {state: 'connected'}, {state: 'unknown'}]) {
                const {text} = deriveSpineBanner({...coldSpine, connection, transport});

                expect(text, JSON.stringify(connection)).toContain('another fleet server holds port 8083')
            }
        });

        test('⭐ a retained producer reason OUTRANKS every connection state — what the producer SAID beats the connection\'s guess', () => {
            // The roster answered not-wired while a read was still in flight elsewhere: the surface
            // reason is the truth that DECIDED the verdict, so the connecting line must not speak.
            const {text} = deriveSpineBanner({
                grid      : {state: 'sample', reason: 'fleet activity source not wired'},
                stream    : {state: 'live'},
                connection: {state: 'connecting'}
            });

            expect(text).toContain('fleet activity source not wired');
            expect(text).not.toContain('Connecting to the fleet plane')
        });

        test('stale branch: slow reads as a WAIT, failed-upstream as PLANE-SIDE, unreachable named apart from both', () => {
            const slow     = deriveSpineBanner({...staleSpine, connection: {state: 'slow'}}),
                  upstream = deriveSpineBanner({...staleSpine, connection: {state: 'failed-upstream'}}),
                  noRoute  = deriveSpineBanner({...staleSpine, connection: {state: 'unreachable'}});

            expect(slow.text).toContain('The fleet plane is slow — showing last-known data');
            expect(slow.text).toContain('safe to wait');
            expect(upstream.text).toContain('The fleet plane\'s surface is failing — showing last-known data');
            expect(noRoute.text).toContain('The fleet plane is unreachable — showing last-known data');
            // "wait" and "investigate" must never blur into one another
            expect(upstream.text).not.toContain('safe to wait')
        });

        test('the deciding surface\'s retained reason ALWAYS rides the degraded line — the connection state only sets the prefix', () => {
            for (const state of ['slow', 'unreachable', 'failed-upstream']) {
                const {text} = deriveSpineBanner({...staleSpine, connection: {state}});

                expect(text, state).toContain('feed went quiet')
            }

            // and without a retained reason each state still names its own honest fallback
            const bare = {grid: {state: 'live'}, stream: {state: 'stale'}};

            expect(deriveSpineBanner({...bare, connection: {state: 'slow'}}).text).toContain('the read beat its bound');
            expect(deriveSpineBanner({...bare, connection: {state: 'unreachable'}}).text).toContain('no route answered')
        });

        test('no connection fact keeps the shipped generic degraded line byte-identical', () => {
            const {text} = deriveSpineBanner(staleSpine);

            expect(text).toBe('Fleet feed degraded — showing last-known data · feed went quiet')
        });

        test('the connection fact never reaches the daemon or live verdicts', () => {
            const connection = {state: 'refused', reason: 'token scope insufficient'};

            expect(deriveSpineBanner({
                grid: {state: 'live'}, stream: {state: 'live'}, daemon: {state: 'stopped'}, connection
            }).text).toContain('Agent OS stopped');
            expect(deriveSpineBanner({
                grid: {state: 'live'}, stream: {state: 'live'}, connection
            })).toEqual({hidden: true, kind: 'live', text: ''})
        })
    })
});
