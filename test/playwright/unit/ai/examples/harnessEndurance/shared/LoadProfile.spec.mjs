import {test, expect} from '@playwright/test';

import DefaultLoadProfile, {EVENT_TYPE, LoadProfile} from '../../../../../../../ai/examples/harnessEndurance/shared/LoadProfile.mjs';

/**
 * @summary Coverage for ai/examples/harnessEndurance/shared/LoadProfile.mjs — the pure, seeded,
 * deterministic load profile shared by the Harness Endurance Benchmark's subject apps and its
 * Playwright runner.
 *
 * The benchmark's entire value is falsifiability, which requires byte-identical replay: the
 * same seed + config MUST yield the same event stream on every run and on every subject,
 * otherwise a measured latency delta could be the input's fault, not the engine's. These tests
 * pin that contract without launching a browser, a worker, or any Neo runtime — the module is
 * deliberately dependency-free.
 *
 * Test axes:
 * - determinism — same seed → identical append stream; different seed → differs
 * - appendEvents — count, monotonic tMs by cadence, every event a non-empty APPEND
 * - keystrokeTimes — fixed-cadence schedule, seed-independent, bounded by duration
 * - appendCount + defaults — matches the materialized length; 8h default is consistent un-materialized
 */
test.describe('ai/examples/harnessEndurance/shared/LoadProfile', () => {
    const cfg = {seed: 42, durationMs: 1000, appendCadenceMs: 50, keystrokeCadenceMs: 200};

    test.describe('determinism (the falsifier reproducibility contract)', () => {
        test('same seed + config → byte-identical append stream', () => {
            const
                a = [...new LoadProfile(cfg).appendEvents()],
                b = [...new LoadProfile(cfg).appendEvents()];

            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        });

        test('different seed → different append stream', () => {
            const
                a = [...new LoadProfile({...cfg, seed: 1}).appendEvents()],
                b = [...new LoadProfile({...cfg, seed: 2}).appendEvents()];

            expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
        });

        test('default export and named export are the same class', () => {
            expect(DefaultLoadProfile).toBe(LoadProfile);
        });
    });

    test.describe('appendEvents', () => {
        test('count matches duration / cadence and appendCount()', () => {
            const
                profile = new LoadProfile(cfg),
                events  = [...profile.appendEvents()];

            expect(events.length).toBe(20);                 // 1000 / 50
            expect(events.length).toBe(profile.appendCount());
        });

        test('tMs is monotonic in appendCadenceMs steps from 0', () => {
            const events = [...new LoadProfile(cfg).appendEvents()];

            events.forEach((event, i) => expect(event.tMs).toBe(i * cfg.appendCadenceMs));
        });

        test('every event is an APPEND with non-empty text', () => {
            for (const event of new LoadProfile(cfg).appendEvents()) {
                expect(event.type).toBe(EVENT_TYPE.APPEND);
                expect(typeof event.text).toBe('string');
                expect(event.text.length).toBeGreaterThan(0);
            }
        });
    });

    test.describe('keystrokeTimes', () => {
        test('fixed-cadence schedule bounded by duration', () => {
            expect(new LoadProfile(cfg).keystrokeTimes()).toEqual([200, 400, 600, 800]);
        });

        test('seed-independent (the keystroke schedule uses no PRNG)', () => {
            const
                a = new LoadProfile(cfg).keystrokeTimes(),
                b = new LoadProfile({...cfg, seed: 999}).keystrokeTimes();

            expect(a).toEqual(b);
        });
    });

    test.describe('appendCount + defaults', () => {
        test('appendCount = ceil(durationMs / appendCadenceMs)', () => {
            expect(new LoadProfile({durationMs: 1000, appendCadenceMs: 50}).appendCount()).toBe(20);
            expect(new LoadProfile({durationMs: 1001, appendCadenceMs: 50}).appendCount()).toBe(21);
        });

        test('8h default config is internally consistent without materializing it', () => {
            const profile = new LoadProfile();

            expect(profile.durationMs).toBe(8 * 60 * 60 * 1000);
            expect(profile.appendCount()).toBe(Math.ceil(profile.durationMs / profile.appendCadenceMs));
            expect(profile.appendCount()).toBe(576000);   // 8h at a 50ms cadence
        });
    });
});
