import {setup} from '../../../../setup.mjs';

// The bridge module pulls in the Neo class system at load, so the harness must be armed before the
// dynamic import in `beforeAll` — otherwise the import fails with `Neo is not defined` and the spec
// reports a red that is about the fixture rather than about the parser.
setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'DeclaredHeapCeilingObservationTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * `Config.Cmd` values COPIED FROM THE LIVE PLANE on 2026-08-08, not invented. An invented fixture
 * would be shaped by what the parser already does; these were shaped by the deployment.
 */
const LIVE = Object.freeze({
    // One `node` invocation — the simple case.
    kbServer: Object.freeze(['sh', '-c', 'node --max-old-space-size=768 "$SERVER_ENTRYPOINT"']),

    // TWO invocations, overlay and no-overlay, and the compose spec holds their values equal. This
    // is the case a naive first-match parser ALSO passes, which is exactly why the divergent
    // fixture below has to exist — without it this row proves nothing about the agreement rule.
    mcServer: Object.freeze(['sh', '-c',
        'overlay=/app/.neo-ai-data/deployment-state/recovery-actuator-overrides.json; if [ -f "$overlay" ]; then\n' +
        '  node --max-old-space-size=768 "$SERVER_ENTRYPOINT" --config "$overlay";\nelse\n' +
        '  node --max-old-space-size=768 "$SERVER_ENTRYPOINT";\nfi']),

    // A non-Node service. Its `null` is the one assertion a BROKEN matcher would also satisfy.
    chroma: Object.freeze(['run', '/config.yaml'])
});

let parseDeclaredHeapCeilingMb;

test.beforeAll(async () => {
    ({parseDeclaredHeapCeilingMb} = await import(
        '../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs'));
});

test.describe('declared heap ceiling — observed from Config.Cmd, fail-closed on ambiguity', () => {
    test('a single declaration is read', () => {
        expect(parseDeclaredHeapCeilingMb(LIVE.kbServer)).toBe(768);
    });

    test('two AGREEING declarations resolve to the agreed value', () => {
        expect(parseDeclaredHeapCeilingMb(LIVE.mcServer)).toBe(768);
    });

    test('DIVERGENT declarations report `unknown` — never a pick', () => {
        // Mutated from the live mc-server command by changing ONE branch. `Config.Cmd` does not say
        // which branch is executing, so returning either number would be a guess with a number
        // attached. This is the discriminating case: a first-match parser returns 768 and a
        // last-match parser returns 512, and both are wrong for the same reason.
        const divergent = LIVE.mcServer.map(part =>
            part.replace('--max-old-space-size=768 "$SERVER_ENTRYPOINT";', '--max-old-space-size=512 "$SERVER_ENTRYPOINT";'));

        expect(divergent.join(' ')).toContain('--max-old-space-size=512');   // the mutation applied
        expect(divergent.join(' ')).toContain('--max-old-space-size=768');   // and did not erase its sibling

        expect(parseDeclaredHeapCeilingMb(divergent)).toBe('unknown');
    });

    test('no declaration reads null — with the positive control that makes that meaningful', () => {
        // A matcher that never matches would satisfy this line too. The control proves the
        // instrument can see a present case, so the null below is an observation and not a silence.
        expect(parseDeclaredHeapCeilingMb(LIVE.chroma)).toBe(null);
        expect(parseDeclaredHeapCeilingMb(LIVE.kbServer)).toBe(768);
    });

    test('null and `unknown` are DIFFERENT observations and must not collapse', () => {
        // "declares none" and "declares ambiguously" route differently: the first is the
        // undeclared-ceiling case, the second is not observable at all. Conflating them would let
        // an ambiguous command be reported as an absent ceiling.
        expect(parseDeclaredHeapCeilingMb(LIVE.chroma)).not.toBe('unknown');
        expect(parseDeclaredHeapCeilingMb(['node --max-old-space-size=1 x', 'node --max-old-space-size=2 y'])).not.toBe(null);
    });

    test('a string command is accepted, and junk degrades to null rather than throwing', () => {
        expect(parseDeclaredHeapCeilingMb('node --max-old-space-size=256 server.mjs')).toBe(256);
        expect(parseDeclaredHeapCeilingMb(null)).toBe(null);
        expect(parseDeclaredHeapCeilingMb(undefined)).toBe(null);
        expect(parseDeclaredHeapCeilingMb({})).toBe(null);
    });

    test('the value is what the container was TOLD — the name may not imply an enforced ceiling', () => {
        // Guard against a future rename toward "effective"/"actual". No V8-scoped metric exists for
        // a sibling container anywhere in `ai/`, so a name promising one would recreate the
        // cross-scope conflation the heap-ceiling work exists to prevent.
        expect(parseDeclaredHeapCeilingMb(LIVE.kbServer)).toBe(768);
        expect(typeof parseDeclaredHeapCeilingMb(LIVE.kbServer)).toBe('number');
    });
});
