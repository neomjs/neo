import {test, expect} from '@playwright/test';

import fs   from 'node:fs/promises';
import os   from 'node:os';
import path from 'node:path';

import {
    RECOVERY_OVERRIDE_FILENAME,
    readRecoveryOverrides,
    requiredContextForKnob,
    writeKnobOverride
} from '../../../../../../../ai/services/memory-core/helpers/recoveryOverrideStore.mjs';

const KNOB   = 'minisummary-generation-window';
const INNER  = 'memoryService.generateMiniSummaryTimeoutMs';
const OUTER  = 'memoryService.miniSummaryTimeoutMs';
const BUDGET = 'memoryService.miniSummaryBackfillMaxRunMs';

const CTX    = {[BUDGET]: 600000};
const VALUES = {[INNER]: 40000, [OUTER]: 60000};

test.describe('recoveryOverrideStore — a write aimed at a boot path (#16374)', () => {
    let dir, overridePath;

    test.beforeEach(async () => {
        dir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-recovery-override-'));
        overridePath = path.join(dir, RECOVERY_OVERRIDE_FILENAME);
    });

    test.afterEach(async () => {
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a valid transaction lands as the nested shape the overlay is merged from', async () => {
        const result = await writeKnobOverride({context: CTX, knob: KNOB, overrideDir: dir, values: VALUES, env: {}});

        expect(result.applied).toBe(true);
        expect(result.path).toBe(overridePath);

        // Dotted leaf paths must expand — a flat key would merge into the config tree as a leaf named
        // "memoryService.miniSummaryTimeoutMs", which resolves to nothing and reads as applied.
        expect(await readRecoveryOverrides(overridePath)).toEqual({
            memoryService: {
                generateMiniSummaryTimeoutMs: 40000,
                miniSummaryTimeoutMs        : 60000
            }
        });
    });

    test('an invalid transaction writes NOTHING — validation precedes the filesystem', async () => {
        // The ordering that matters: the boot-time config guard fails fast on malformed structure, so a
        // bad overlay is not a no-op, it is a target that will not start. Refusing before touching disk
        // is what keeps a rejected proposal from becoming a boot input.
        const result = await writeKnobOverride({
            context    : CTX,
            knob       : KNOB,
            overrideDir: dir,
            values     : {[INNER]: 60000, [OUTER]: 40000},
            env        : {}
        });

        expect(result.applied).toBe(false);
        expect(result.violations.some(v => v.includes('inner-strictly-below-outer'))).toBe(true);
        await expect(fs.access(overridePath)).rejects.toThrow();
    });

    test('an env-pinned leaf is refused, because the write would be silently discarded', async () => {
        // The config layer re-asserts the env layer after merging an overlay, so an env-set leaf
        // outranks this file. Writing anyway would report success over a value that never took effect —
        // the failure mode where every surface agrees and nothing changed.
        const result = await writeKnobOverride({
            context    : CTX,
            knob       : KNOB,
            overrideDir: dir,
            values     : VALUES,
            env        : {NEO_MC_MINI_SUMMARY_TIMEOUT_MS: '45000'}
        });

        expect(result.applied).toBe(false);
        expect(result.violations[0]).toContain('NEO_MC_MINI_SUMMARY_TIMEOUT_MS');
        expect(result.violations[0]).toContain('discarded');
        await expect(fs.access(overridePath)).rejects.toThrow();
    });

    test('an empty env value does not count as pinned', async () => {
        // An exported-but-empty variable is how a shell says "unset" in practice. Treating it as pinned
        // would make the actuator refuse on seats that have set nothing.
        const result = await writeKnobOverride({
            context    : CTX,
            knob       : KNOB,
            overrideDir: dir,
            values     : VALUES,
            env        : {NEO_MC_MINI_SUMMARY_TIMEOUT_MS: ''}
        });

        expect(result.applied).toBe(true);
    });

    test('existing overlay content survives — the actuator owns its leaves, not the file', async () => {
        // Another writer's keys, and an operator's unrelated setting, must not be collateral. The
        // overlay is a shared surface; only the knob's own leaves are ours to replace.
        await fs.writeFile(overridePath, JSON.stringify({
            memoryService: {miniSummaryTimeoutMs: 30000, somethingElse: 'keep me'},
            otherService : {flag: true}
        }));

        await writeKnobOverride({context: CTX, knob: KNOB, overrideDir: dir, values: VALUES, env: {}});

        expect(await readRecoveryOverrides(overridePath)).toEqual({
            memoryService: {
                generateMiniSummaryTimeoutMs: 40000,
                miniSummaryTimeoutMs        : 60000,
                somethingElse               : 'keep me'
            },
            otherService: {flag: true}
        });
    });

    test('the write is atomic — no temp file survives, and the target is never partial', async () => {
        await writeKnobOverride({context: CTX, knob: KNOB, overrideDir: dir, values: VALUES, env: {}});

        // A leftover temp file means the rename did not happen and something read a half-written path.
        expect((await fs.readdir(dir)).filter(name => name.endsWith('.tmp'))).toEqual([]);
        expect((await fs.readdir(dir))).toEqual([RECOVERY_OVERRIDE_FILENAME]);
    });

    test('a failed rename leaves the PREVIOUS overlay intact', async () => {
        // The property atomicity buys. An interrupted write must not degrade a working config into a
        // truncated one — that is the boot failure this whole discipline exists to avoid.
        await writeKnobOverride({context: CTX, knob: KNOB, overrideDir: dir, values: VALUES, env: {}});

        const before   = await readRecoveryOverrides(overridePath),
              fsModule = {
                  mkdir    : fs.mkdir,
                  readFile : fs.readFile,
                  writeFile: fs.writeFile,
                  rename   : async () => { throw new Error('simulated rename failure') }
              };

        await expect(writeKnobOverride({
            context    : CTX,
            knob       : KNOB,
            overrideDir: dir,
            values     : {[INNER]: 10000, [OUTER]: 20000},
            env        : {},
            fsModule
        })).rejects.toThrow('simulated rename failure');

        expect(await readRecoveryOverrides(overridePath)).toEqual(before);
    });

    test('a malformed existing overlay throws rather than being silently replaced', async () => {
        // Overwriting a file we cannot parse would discard operator or peer content we never read.
        await fs.writeFile(overridePath, '{ not json');

        await expect(writeKnobOverride({context: CTX, knob: KNOB, overrideDir: dir, values: VALUES, env: {}}))
            .rejects.toThrow();
    });

    test('a missing overlay is an empty starting point, not an error', async () => {
        expect(await readRecoveryOverrides(overridePath)).toEqual({});
    });

    test('the destination directory is created — the writer owns its own path', async () => {
        // A plane that has never written an overlay has no such directory. A writer that requires
        // someone else to create its destination first is a boot-ordering dependency wearing a
        // filesystem error, and it fails at exactly the moment the actuator is most needed.
        const nested = path.join(dir, 'deployment-state');

        const result = await writeKnobOverride({context: CTX, knob: KNOB, overrideDir: nested, values: VALUES, env: {}});

        expect(result.applied).toBe(true);
        expect(await readRecoveryOverrides(path.join(nested, RECOVERY_OVERRIDE_FILENAME))).toEqual({
            memoryService: {
                generateMiniSummaryTimeoutMs: 40000,
                miniSummaryTimeoutMs        : 60000
            }
        });
    });

    test('the required context is reachable without importing the registry', async () => {
        expect(requiredContextForKnob(KNOB)).toEqual([BUDGET]);
    });

    test('a holder that lost authority during preparation writes NOTHING to disk', async () => {
        // @neo-gpt-emmy's exact-head finding: `readRecoveryOverrides` is awaited before the
        // mkdir/write/rename sequence, so a caller that checked authority before calling has already
        // yielded. The check has to live HERE — no caller can hold one adjacent to a write it does
        // not itself perform. A displaced holder must not leave an intent its successor then enacts.
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-override-authority-'));

        let reads = 0;

        await expect(writeKnobOverride({
            context    : CTX,
            knob       : KNOB,
            overrideDir: dir,
            values     : VALUES,
            env        : {},
            // Held while the caller decided; gone by the time the write is reached.
            isAuthorityHeld: () => ++reads < 1
        })).rejects.toMatchObject({reason: 'runtime-authority-lost'});

        // The load-bearing assertion: the refusal is worthless if the overlay landed anyway.
        await expect(fs.readFile(path.join(dir, RECOVERY_OVERRIDE_FILENAME), 'utf8')).rejects.toThrow();
    });

    test('POSITIVE CONTROL: a held oracle still writes, so the guard is discriminating', async () => {
        const dir    = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-override-authority-ok-')),
              result = await writeKnobOverride({
                  context        : CTX,
                  knob           : KNOB,
                  overrideDir    : dir,
                  values         : VALUES,
                  env            : {},
                  isAuthorityHeld: () => true
              });

        expect(result.applied).toBe(true);
        expect(await readRecoveryOverrides(result.path)).toBeTruthy();
    });
});
