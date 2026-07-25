import {test, expect} from '@playwright/test';

import {
    assertDataSyncAccess,
    probeRepository,
    REQUIRED_REPOSITORIES
} from '../../../../../buildScripts/dataSyncPreflight.mjs';

/**
 * `Resource not accessible by integration` is returned for two conditions that share one string:
 * genuine GitHub-side flakiness, and a permanently missing App installation. No message inspection
 * separates them, which is why the bounded-retry classifier treats the string as transient — correct
 * for the first, catastrophic for the second. This pipeline spent eight days and sixty consecutive
 * scheduled runs retrying a permanent misconfiguration, each failure looking like bad luck.
 *
 * The discriminator is not the message but the TIMING. These probes carry no retry budget and run
 * before any collection stage, so a denial here is the installation answering. That is what makes
 * fail-fast safe without breaking the retry budget the flaky class genuinely needs.
 */
test.describe('Data Sync access preflight (#15744)', () => {
    const respond = payload => async () => ({status: 200, json: async () => payload});

    const denial    = respond({errors: [{message: 'Resource not accessible by integration'}]}),
          reachable = respond({data: {repository: {id: 'R_kgDO'}}});

    test('the required set includes devindex-opt-out, not just opt-in', () => {
        // An installation covering only `neo` + `devindex-opt-in` passes a naive probe and then
        // fails one stage later, after the setup work already looked complete. OptOut mutates its
        // own repository, so it is a first-class requirement rather than an afterthought.
        expect(REQUIRED_REPOSITORIES.map(entry => entry.name)).toEqual([
            'devindex-opt-in',
            'devindex-opt-out'
        ])
    });

    test('a reachable repository probe reports ok without a retry budget', async () => {
        expect(await probeRepository({fetchFn: reachable, name: 'devindex-opt-in', owner: 'neomjs', token: 't'}))
            .toEqual({ok: true, reason: null})
    });

    test('a GraphQL denial is detected despite arriving as HTTP 200', async () => {
        // The denial is a 200-body `errors` array, so status alone is not the test — reading only
        // `response.status` would report this repository as reachable.
        expect(await probeRepository({fetchFn: denial, name: 'devindex-opt-in', owner: 'neomjs', token: 't'}))
            .toEqual({ok: false, reason: 'Resource not accessible by integration'})
    });

    test('the exact 60-run denial fails fast, names EVERY unreachable repo, and states the remedy', async () => {
        let threw = null;

        await assertDataSyncAccess({fetchFn: denial, log: () => {}, token: 't'}).catch(error => {threw = error});

        expect(threw).toBeTruthy();
        // Names both, so one fix round resolves both installations rather than discovering the
        // second only after the first is corrected.
        expect(threw.message).toContain('neomjs/devindex-opt-in');
        expect(threw.message).toContain('neomjs/devindex-opt-out');
        // Classifies rather than merely reporting: this is the sentence that stops a reader from
        // treating it as another flake and waiting for the next scheduled run.
        expect(threw.message).toContain('PERSISTENT authorization failure');
        expect(threw.message).toContain('Issues: Read and write')
    });

    test('reachable repositories pass silently', async () => {
        await expect(assertDataSyncAccess({fetchFn: reachable, log: () => {}, token: 't'})).resolves.toBeUndefined()
    });

    test('a missing token fails before any network call', async () => {
        let called = false;

        await expect(assertDataSyncAccess({
            fetchFn: async () => {called = true; return {status: 200, json: async () => ({})}},
            log    : () => {},
            token  : null
        })).rejects.toThrow('No intake token was provided');

        expect(called).toBe(false)
    });

    test('a non-denial failure is NOT labelled persistent authorization', async () => {
        // Over-labelling would send a reader to the App settings for a network fault. The
        // classification has to be wrong-way-safe in both directions, not just the loud one.
        let threw = null;

        await assertDataSyncAccess({
            fetchFn: respond({errors: [{message: 'something went wrong while executing your query'}]}),
            log    : () => {},
            token  : 't'
        }).catch(error => {threw = error});

        expect(threw.message).toContain('unreachable');
        expect(threw.message).not.toContain('PERSISTENT authorization failure')
    });
});
