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
    })
});
