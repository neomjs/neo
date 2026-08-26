import {setup} from '../../../../../../setup.mjs';

setup({appConfig: {name: 'FleetSpineBannerTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import SpineBanner    from '../../../../../../../../apps/agentos/util/SpineBanner.mjs';

/**
 * The full derivation matrix for the cockpit's per-SPINE honesty line: a sample GRID (cold — the
 * roster itself is seed data) beats daemon faults beats `stale` on either surface (reachable but
 * degraded) beats a sample STREAM under a live roster (feed pending — the surface partition: a
 * verdict may only speak for the surface that produced it) beats `live`; ONLY the fully
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
            expect(SpineBanner.deriveSpineBanner({...live, daemon: {state: 'running'}})).toEqual({hidden: true, kind: 'live', text: ''});

            for (const state of ['degraded', 'stopped']) {
                const result = SpineBanner.deriveSpineBanner({...live, daemon: {state}});

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
                const result = SpineBanner.deriveSpineBanner({...live, daemon});

                expect(result.hidden, JSON.stringify(daemon)).toBe(true);
                expect(result.text, JSON.stringify(daemon)).toBe('')
            }
        });

        test('⭐ a dead daemon OUTRANKS a stale feed — the diagnosis, not the symptom', () => {
            // A dead daemon is usually what made the feed stale. Reporting the feed alone would name
            // the symptom and drop the pointer the spec asks for.
            const result = SpineBanner.deriveSpineBanner({
                grid  : {state: 'stale', reason: 'feed went quiet'},
                stream: {state: 'stale'},
                daemon: {state: 'stopped', reason: 'orchestrator exited'}
            });

            expect(result.text).toContain('orchestrator exited');
            expect(result.text).not.toContain('last-known data');
            // Control: remove the daemon fault and the SAME input must fall back to the stale line,
            // which is what proves the daemon branch is doing the ranking rather than the text.
            expect(SpineBanner.deriveSpineBanner({
                grid: {state: 'stale', reason: 'feed went quiet'}, stream: {state: 'stale'}
            }).text).toContain('last-known data')
        });

        test('an unreachable transport still wins — it cannot have answered a daemon pull', () => {
            const result = SpineBanner.deriveSpineBanner({
                grid: {state: 'sample'}, stream: {state: 'live'}, daemon: {state: 'stopped'}
            });

            expect(result.kind).toBe('cold');
            expect(result.text).toContain('static roster')
        });

        test('⭐ N daemons down in ONE episode yield ONE banner — the storm clause, asserted', () => {
            // The spec's "never a popup storm" is about episodes. The derivation is total and returns
            // exactly one line whatever the fault breadth, so the storm is unrepresentable rather than
            // debounced — and a caller cannot turn three dead daemons into three banners.
            const episode = SpineBanner.deriveSpineBanner({
                ...live,
                daemon: {state: 'stopped', reason: 'orchestrator, fleet and chroma all exited'}
            });

            expect(Array.isArray(episode)).toBe(false);
            expect(Object.keys(episode).sort()).toEqual(['hidden', 'kind', 'text']);
            expect(episode.text.match(/Agent OS/g)).toHaveLength(1);

            // And it is IDEMPOTENT across re-derivation: a polling consumer re-deriving the same
            // episode produces an identical line, so nothing accumulates per poll.
            expect(SpineBanner.deriveSpineBanner({...live, daemon: {state: 'stopped', reason: 'orchestrator, fleet and chroma all exited'}}))
                .toEqual(episode)
        });

        test('a daemon reason cannot be supplied OR silenced by a transport sibling', () => {
            // The module's per-surface-reason doctrine, applied to the new surface: a `stale` grid
            // carrying a reason must not lend it to the daemon line.
            const result = SpineBanner.deriveSpineBanner({
                grid  : {state: 'stale', reason: 'grid-owned cause'},
                stream: {state: 'live'},
                daemon: {state: 'degraded'}
            });

            expect(result.text).not.toContain('grid-owned cause');
            expect(result.text).toContain('check the tray state and the daemon log')
        });
    });

    test('the full 3×3 matrix: only a sample GRID is cold; stale beats a pending stream; only live+live hides', () => {
        // The surface partition: the cold family makes roster+server claims, so only a sample GRID
        // may enter it. A sample STREAM under a live grid is the stream's own degraded verdict; a
        // stale grid outranks it (last-known roster data is the operator-actionable fact).
        for (const gridAdapterState of STATES) {
            for (const streamAdapterState of STATES) {
                const result     = SpineBanner.deriveSpineBanner({grid: {state: gridAdapterState}, stream: {state: streamAdapterState}}),
                      gridCold   = gridAdapterState === 'sample',
                      anyStale   = gridAdapterState === 'stale' || streamAdapterState === 'stale',
                      streamCold = streamAdapterState === 'sample',
                      expected   = gridCold ? 'cold' : anyStale ? 'degraded' : streamCold ? 'degraded' : 'live';

                expect(result.kind, `${gridAdapterState}×${streamAdapterState}`).toBe(expected);
                expect(result.hidden, `${gridAdapterState}×${streamAdapterState}`).toBe(expected === 'live')
            }
        }
    });

    test('cold with NO retained reason names the cause AND a remedy that EXISTS at this head', () => {
        const {text} = SpineBanner.deriveSpineBanner({grid: {state: 'sample'}, stream: {state: 'live'}});

        expect(text).toContain('Fleet server offline');
        expect(text).toContain('the static roster');
        expect(text).toContain('neo-agent-brain checkout')
    });

    test('⭐ a pending stream under a LIVE grid speaks for the STREAM — never a roster or server claim', () => {
        // The lie class, third instance closed: the first fix (retained reasons) stopped "start a
        // running server"; the copy still said "showing the static roster" over a roster that was
        // provably LIVE — and the REASONLESS variant shipped the full "Fleet server offline" lie,
        // observed live 2026-08-10 over a wire-fed 9-agent roster with real presence bands while
        // the stream honestly held its seed. The partition makes the misclaim unrepresentable:
        // only a sample GRID reaches the cold family; the stream's verdict names the stream, and
        // states the roster fact that falsified the old copy.
        const reasoned = SpineBanner.deriveSpineBanner({
            grid  : {state: 'live'},
            stream: {state: 'sample', reason: 'fleet activity source not wired'}
        });

        expect(reasoned.kind).toBe('degraded');
        expect(reasoned.text).toContain('Activity feed pending');
        expect(reasoned.text).toContain('roster is live');
        expect(reasoned.text).toContain('fleet activity source not wired');
        expect(reasoned.text).not.toContain('static roster');
        expect(reasoned.text).not.toContain('Fleet server offline');
        expect(reasoned.text).not.toContain('npm run ai:fleet-server');

        // The reasonless variant — tonight's exact live rendering — must carry the same honesty
        // without a cause to lean on.
        const bare = SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'sample'}});

        expect(bare.kind).toBe('degraded');
        expect(bare.text).toBe('Activity feed pending — roster is live')
    });

    test('⭐ ranking around the pending stream: a dead daemon outranks it; a stale grid outranks it', () => {
        // Diagnosis over symptom (a dead daemon is usually why a feed never went live), and the
        // stale ROSTER is the operator-actionable fact when both are degraded — the stream-pending
        // line only ever renders over a roster that is provably live.
        const daemonWins = SpineBanner.deriveSpineBanner({
            grid  : {state: 'live'},
            stream: {state: 'sample'},
            daemon: {state: 'stopped', reason: 'orchestrator exited'}
        });

        expect(daemonWins.text).toContain('orchestrator exited');
        expect(daemonWins.text).not.toContain('Activity feed pending');

        const staleWins = SpineBanner.deriveSpineBanner({
            grid  : {state: 'stale', reason: 'poll timed out'},
            stream: {state: 'sample'}
        });

        expect(staleWins.text).toContain('last-known data');
        expect(staleWins.text).toContain('poll timed out');
        expect(staleWins.text).not.toContain('Activity feed pending');
        expect(staleWins.text).not.toContain('static roster')
    });

    test('cold falls back to the generic copy for silence — the only state that implies an offline server', () => {
        // The guard against over-correcting: a torn/absent answer teaches the owner NOTHING, so there
        // is no reason to name and the generic remedy is the honest guess. An empty-ish reason must
        // not sneak through as a "cause" either.
        ['', '   ', null, undefined].forEach(degradedReason => {
            const {text} = SpineBanner.deriveSpineBanner({grid: {state: 'sample', reason: degradedReason}, stream: {state: 'live'}});

            expect(text, JSON.stringify(degradedReason)).toContain('Fleet server offline')
        })
    });

    test('degraded names the honest data state', () => {
        const {text} = SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'stale'}});

        expect(text).toContain('degraded');
        expect(text).toContain('last-known')
    });

    test('a fully live spine renders NOTHING — zero nominal pixels', () => {
        const result = SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}});

        expect(result).toEqual({hidden: true, kind: 'live', text: ''})
    });

    // ⭐ The topology-owned cold fallback: generic manual-start advice
    // advice was actively wrong inside the shell — the shell SELF-SUPPLIES its transport, so that
    // advice CAUSES the foreign-listener refusal it then mislabels as "offline". The shell's boot
    // fact (riding the brain-health wire) picks the honest line for SILENCE; a retained surface
    // reason still outranks any topology guess; the plain browser (no fact) keeps the classic copy.
    test.describe('⭐ transport-aware cold fallback — the shell fact picks the honest line', () => {
        const coldSpine = {grid: {state: 'sample'}, stream: {state: 'live'}};

        test('no shell fact (plain browser, or an unreachable shell) keeps the classic offline copy', () => {
            for (const transport of [undefined, null]) {
                const {text} = SpineBanner.deriveSpineBanner({...coldSpine, transport});

                expect(text, JSON.stringify(transport)).toContain('Fleet server offline');
                expect(text, JSON.stringify(transport)).toContain('neo-agent-brain checkout')
            }
        });

        test('a boot in flight names itself — and never advises a manual start', () => {
            const {kind, text} = SpineBanner.deriveSpineBanner({...coldSpine, transport: {phase: 'starting'}});

            expect(kind).toBe('cold');
            expect(text).toContain('Fleet transport starting');
            expect(text).not.toContain('npm run ai:fleet-server')
        });

        test('foreign-listener renders the named refusal, the port, and the Reconnect remedy', () => {
            // The exact case the old copy inverted: "start it" is what CREATES this state.
            const {text} = SpineBanner.deriveSpineBanner({...coldSpine, transport: {
                fleetPort: 8083, mode: 'foreign-listener', phase: 'settled', reason: 'viewer mismatch on the reuse probe', up: false
            }});

            expect(text).toContain('another fleet server holds port 8083');
            expect(text).toContain('quit it, then Reconnect');
            expect(text).toContain('viewer mismatch on the reuse probe');
            expect(text).not.toContain('npm run ai:fleet-server')
        });

        test('foreign-listener without a carried reason falls back to the generic refusal line', () => {
            const {text} = SpineBanner.deriveSpineBanner({...coldSpine, transport: {fleetPort: 8083, mode: 'foreign-listener', phase: 'settled', up: false}});

            expect(text).toContain('another fleet server holds port 8083');
            expect(text).toContain('listener did not prove canonical Fleet identity')
        });

        test('a settled failed boot names the failure — with and without an error detail', () => {
            const withDetail = SpineBanner.deriveSpineBanner({...coldSpine, transport: {mode: 'spawn', phase: 'settled', up: false, error: 'fleet readiness timed out'}}),
                  bareFail   = SpineBanner.deriveSpineBanner({...coldSpine, transport: {mode: 'spawn', phase: 'settled', up: false}});

            expect(withDetail.text).toContain('Fleet transport failed to start');
            expect(withDetail.text).toContain('fleet readiness timed out');
            expect(bareFail.text).toContain('Fleet transport failed to start');
            expect(bareFail.text).not.toContain('npm run ai:fleet-server')
        });

        test('a ready transport with cold surfaces points at Reconnect — the server just answered', () => {
            for (const mode of ['spawn', 'reuse']) {
                const {text} = SpineBanner.deriveSpineBanner({...coldSpine, transport: {fleetPort: 8083, mode, phase: 'settled', up: true}});

                expect(text, mode).toContain('Fleet transport ready');
                expect(text, mode).toContain('Reconnect');
                expect(text, mode).not.toContain('npm run ai:fleet-server')
            }
        });

        test('⭐ a retained surface reason OUTRANKS the fact — the producer spoke, the topology only guesses', () => {
            // The roster's answered-empty retention (loadRoster's empty-unselected path) must win
            // over any transport-derived guess: what the producer SAID beats what the boot implies.
            const {text} = SpineBanner.deriveSpineBanner({
                grid     : {state: 'sample', reason: 'server connected · fleet registry empty — define agents to go live'},
                stream   : {state: 'live'},
                transport: {mode: 'foreign-listener', phase: 'settled', up: false}
            });

            expect(text).toContain('Fleet data unavailable');
            expect(text).toContain('fleet registry empty');
            expect(text).not.toContain('another fleet server holds')
        });

        test('the fact never reaches non-cold branches: stale, daemon, stream-pending and live verdicts ignore it', () => {
            const transport = {mode: 'foreign-listener', phase: 'settled', up: false};

            expect(SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'stale'}, transport}).text).toContain('last-known');
            expect(SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}, daemon: {state: 'stopped'}, transport}).text).toContain('Agent OS stopped');
            expect(SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'sample'}, transport}).text).toBe('Activity feed pending — roster is live');
            expect(SpineBanner.deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}, transport})).toEqual({hidden: true, kind: 'live', text: ''})
        })
    })
});
