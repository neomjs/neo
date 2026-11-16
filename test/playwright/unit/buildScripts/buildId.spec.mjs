import {test, expect} from '@playwright/test';
import {getBuildId}   from '../../../../buildScripts/util/buildId.mjs';

/**
 * @summary Pins the one-id-per-run contract: `build-all` resolves the id once, and the build steps it spawns inherit
 * it through the environment, so every app of one run carries the same `buildId`.
 */
test.describe('buildScripts/util/buildId', () => {
    test('a build run resolves one id, and the steps it spawns inherit it', () => {
        const original = process.env.NEO_BUILD_ID;

        delete process.env.NEO_BUILD_ID;

        try {
            const buildId = getBuildId();

            expect(buildId).toMatch(/^[0-9a-z]+$/);
            expect(getBuildId(), 'later steps of the run read the same id').toBe(buildId);
            expect(process.env.NEO_BUILD_ID, 'spawned steps inherit it through the environment').toBe(buildId)
        } finally {
            if (original === undefined) {
                delete process.env.NEO_BUILD_ID
            } else {
                process.env.NEO_BUILD_ID = original
            }
        }
    })
});
