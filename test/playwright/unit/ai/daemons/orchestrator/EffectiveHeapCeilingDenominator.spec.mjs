import {setup} from '../../../../setup.mjs';

const appName = 'EffectiveHeapCeilingTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const MiB = 1024 * 1024,
      GiB = 1024 * MiB;

/**
 * The memory-saturation denominator must be the ceiling that actually ends the process.
 *
 * `mc-server` aborted at 2026-08-07T11:40:42Z with `Ineffective mark-compacts near heap limit` while
 * `memory-saturation` computed 36% — because it divided by the 1 GiB *container* limit while the
 * process was racing V8's undeclared ~560 MiB heap limit, where it sat at ~66%. Two numbers, one of
 * them monitored, the other enforcing.
 *
 * The store path must be untouched by the fix. A store's data IS its resident footprint, so the
 * container budget is genuinely its wall — and `chroma`'s ceiling behaviour is owned by other tickets
 * whose semantics this change must not quietly alter.
 */
test.describe('effective heap-ceiling denominator', () => {
    let parseDeclaredHeapBytes, calculateDockerMemoryPercent;

    test.beforeAll(async () => {
        ({parseDeclaredHeapBytes, calculateDockerMemoryPercent} =
            await import('../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs'));
    });

    const statsAt = usedMiB => ({memory_stats: {usage: usedMiB * MiB, limit: 1 * GiB}}),
          cmdOf   = command => ({Config: {Cmd: ['sh', '-c', command]}});

    test('the declared ceiling is read off the container command', () => {
        expect(parseDeclaredHeapBytes(cmdOf('node --max-old-space-size=768 "$SERVER_ENTRYPOINT"')))
            .toBe(768 * MiB);
    });

    test('a command with TWO node branches reports the LAST ceiling, not the first', () => {
        // mc-server branches on whether a recovery-actuator overlay exists. Reading the first match
        // would report the if-branch's ceiling for a container running the else-branch — a denominator
        // that silently belongs to a code path this container is not on.
        const twoBranch = 'if [ -f "$o" ]; then node --max-old-space-size=768 "$E" --config "$o"; ' +
                          'else node --max-old-space-size=512 "$E"; fi';

        expect(parseDeclaredHeapBytes(cmdOf(twoBranch))).toBe(512 * MiB);
    });

    test('no declaration reports null, and null preserves the container-limit denominator exactly', () => {
        expect(parseDeclaredHeapBytes(cmdOf('node "$SERVER_ENTRYPOINT"'))).toBeNull();
        expect(parseDeclaredHeapBytes(null)).toBeNull();
        expect(parseDeclaredHeapBytes({})).toBeNull();

        // The back-compat guarantee: an undeclared service is measured exactly as it is today.
        expect(calculateDockerMemoryPercent(statsAt(396), null))
            .toBe(calculateDockerMemoryPercent(statsAt(396)));
    });

    test('THE FIX: the same sample reads 36% against the container limit and 51% against the declared ceiling', () => {
        const stats = statsAt(396);

        expect(calculateDockerMemoryPercent(stats)).toBeCloseTo(38.7, 0);
        expect(calculateDockerMemoryPercent(stats, 768 * MiB)).toBeCloseTo(51.6, 0);

        // And against the ceiling mc-server ACTUALLY had — undeclared, so ~560 MiB — the same sample
        // is two thirds of the way to an abort. That is the number nobody could see.
        expect(calculateDockerMemoryPercent(stats, 560 * MiB)).toBeCloseTo(70.7, 0);
    });

    test('a saturation threshold is crossed against the real ceiling and NOT against the budget', () => {
        // The verdict-level consequence, which is the whole point: at 700 MiB in a 1 GiB container,
        // the container denominator says 68% (below the 90% transient threshold, no fact emitted)
        // while the declared 768 MiB ceiling says 91% — over it, and one batch from an abort.
        const stats = statsAt(700);

        expect(calculateDockerMemoryPercent(stats)).toBeLessThan(90);
        expect(calculateDockerMemoryPercent(stats, 768 * MiB)).toBeGreaterThan(90);
    });

    test('a declared ceiling ABOVE the container limit does not raise the wall', () => {
        // `min`, not "override wins". A 4 GiB heap ceiling inside a 1 GiB container means the
        // container OOM-killer arrives first, so the container limit is still what ends the process.
        // Treating the override as authoritative here would UNDER-report a container about to be
        // killed — the inverse of the defect being fixed.
        const stats = statsAt(900);

        expect(calculateDockerMemoryPercent(stats, 4 * GiB)).toBe(calculateDockerMemoryPercent(stats));
    });

    test('a zero or negative override is ignored rather than producing Infinity', () => {
        const stats = statsAt(396);

        for (const bogus of [0, -1, Number.NaN]) {
            expect(calculateDockerMemoryPercent(stats, bogus), `override ${bogus} must fall back`)
                .toBe(calculateDockerMemoryPercent(stats));
        }
    });

    test('an unreadable stats payload still reports null, override or not', () => {
        for (const broken of [{}, {memory_stats: {}}, {memory_stats: {usage: 1, limit: 0}}]) {
            expect(calculateDockerMemoryPercent(broken, 768 * MiB)).toBeNull();
        }
    });
});
