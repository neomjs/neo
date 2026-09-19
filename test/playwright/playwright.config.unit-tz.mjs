import {defineConfig}       from '@playwright/test';
import path                 from 'path';
import {fileURLToPath}      from 'url';
import {buildUnitRunPolicy} from './playwright.config.unit.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

process.env.UNIT_TEST_MODE = 'true';

/**
 * The zone this run measures in. A spec that converts between local and UTC computes the SAME answer
 * in both implementations whenever the offset is zero, so a UTC runner cannot distinguish a correct
 * conversion from a missing one — no additional test case closes that, because no input separates
 * them. The zone is therefore the instrument, and it is chosen rather than inherited.
 *
 * `Pacific/Kiritimati` is +14 with no DST: the largest offset in either direction, and stable, so a
 * run in March and a run in November measure the same thing. CI additionally runs `Pacific/Niue`
 * (−11, also DST-free) so a sign error is caught from both sides; one zone can only catch one sign.
 */
export const DEFAULT_PROBE_TIMEZONE = 'Pacific/Kiritimati';

process.env.TZ = process.env.NEO_UNIT_TZ || DEFAULT_PROBE_TIMEZONE;

const isCI = !!process.env.CI;

/**
 * @summary The timezone-discriminating half of the Engine unit tier.
 * @description Deliberately a SECOND config rather than a project inside `playwright.config.unit.mjs`:
 * the zone comes from `process.env.TZ`, which is per-process, and Playwright cannot vary env per
 * project. It is also deliberately not a `TZ` pinned onto the whole unit tier — that would silently
 * move every other spec off UTC and hide the opposite class of bug.
 *
 * Specs listed here must be the ones whose correctness depends on a local↔UTC conversion. The
 * predicate that finds them is greppable: `getTimezoneOffset` or `toISOString` under `src/`.
 */
export default defineConfig({
    testDir  : path.join(__dirname, 'unit'),
    outputDir: path.join(__dirname, 'test-results/unit-tz'),
    testMatch: [
        '**/util/Date.spec.mjs',
        '**/form/field/DateSubmitValue.spec.mjs'
    ],
    fullyParallel: true,
    ...buildUnitRunPolicy({isCI}),
    use     : {trace: 'on-first-retry'},
    projects: [{
        name: `unit-engine-tz-${process.env.TZ}`
    }]
});
