import {test, expect} from '@playwright/test';

import {
    assertDataSyncAccess,
    probeRepository,
    REQUIRED_REPOSITORIES
} from '../../../../../buildScripts/dataSyncPreflight.mjs';

/** Collapses the retry backoff so budget-spending tests stay fast; shared by every describe below. */
const noWait = async () => {};

/**
 * A repository whose id AND both probed connections resolve.
 *
 * The connections are load-bearing: the probe selects the one its `REQUIRED_REPOSITORIES` entry
 * names, and GitHub answers a partial denial with the id present and that connection null. A fixture
 * carrying only `id` therefore models a response the pipeline must treat as a FAILURE, so it cannot
 * also stand in for success.
 */
const REACHABLE_REPOSITORY = {
    id        : 'R_kgDO',
    issues    : {pageInfo: {hasNextPage: false}},
    stargazers: {pageInfo: {hasNextPage: false}}
};

/**
 * `Resource not accessible by integration` is returned for two conditions that share one string:
 * genuine GitHub-side flakiness, and a permanently missing App installation. No message inspection
 * separates them, which is why the bounded-retry classifier treats the string as transient — correct
 * for the first, catastrophic for the second. This pipeline spent eight days and sixty consecutive
 * scheduled runs retrying a permanent misconfiguration, each failure looking like bad luck.
 *
 * The discriminator is not the message but WHEN plus HOW OFTEN. These probes run before any
 * collection stage AND spend a small retry budget of their own, so a failure that survives both is
 * neither mid-batch contention nor one unlucky first call — it is the installation answering. Timing
 * alone was not enough: it rules out contention but not a single blip, and aborting a scheduled run
 * on one blip is its own outage.
 */
test.describe('Data Sync access preflight (#15744)', () => {
    const respond = payload => async () => ({status: 200, json: async () => payload});

    const denial    = respond({errors: [{message: 'Resource not accessible by integration'}]}),
          reachable = respond({data: {repository: REACHABLE_REPOSITORY}});

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
        expect(await probeRepository({
            connection: 'stargazers', fetchFn: reachable, name: 'devindex-opt-in', owner: 'neomjs', token: 't'
        })).toEqual({ok: true, reason: null})
    });

    test('a GraphQL denial is detected despite arriving as HTTP 200', async () => {
        // The denial is a 200-body `errors` array, so status alone is not the test — reading only
        // `response.status` would report this repository as reachable.
        expect(await probeRepository({
            connection: 'stargazers', fetchFn: denial, name: 'devindex-opt-in', owner: 'neomjs', token: 't'
        })).toEqual({ok: false, reason: 'Resource not accessible by integration'})
    });

    test('the probe SELECTS the connection its entry names, not just the repository id', async () => {
        // The id-only probe answered "can this identity see the repository", never "can it perform
        // the read `purpose` names" — so it reported reachable while the stargazer read was denied.
        let sent = null;

        await probeRepository({
            connection: 'stargazers',
            fetchFn   : async (_url, options) => {sent = JSON.parse(options.body).query; return {status: 200, json: async () => ({})}},
            name      : 'devindex-opt-in',
            owner     : 'neomjs',
            token     : 't'
        });

        expect(sent).toContain('stargazers(first:1)');

        await probeRepository({
            connection: 'issues',
            fetchFn   : async (_url, options) => {sent = JSON.parse(options.body).query; return {status: 200, json: async () => ({})}},
            name      : 'devindex-opt-out',
            owner     : 'neomjs',
            token     : 't'
        });

        expect(sent).toContain('issues(first:1)')
    });

    test('a PARTIAL denial — id resolves, the named connection does not — is a failure', async () => {
        // The exact production response: GraphQL returns 200 with `data.repository.id` present, the
        // denied connection null, and the denial in `errors`. Testing `id` alone reads this as
        // success, which is how `devindex-opt-in reachable (OptIn stargazer read)` was logged by a
        // run whose stargazer read was denied twelve minutes later.
        const partial = respond({
            data  : {repository: {id: 'R_kgDO', stargazers: null}},
            errors: [{message: 'Resource not accessible by integration'}]
        });

        expect(await probeRepository({
            connection: 'stargazers', fetchFn: partial, name: 'devindex-opt-in', owner: 'neomjs', token: 't'
        })).toEqual({ok: false, reason: 'Resource not accessible by integration'})
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

    test('a THROWN transport failure becomes a reason instead of escaping the probe', async () => {
        // ECONNRESET/DNS/TLS is the most common transient class AND the only one that arrives as an
        // exception rather than an `errors` array. Awaiting `fetchFn` outside a catch let it escape
        // `probeRepository`, the retry loop, and `assertDataSyncAccess` alike — so the bounded retry
        // could not see the failure mode it exists for.
        const result = await probeRepository({
            connection: 'stargazers',
            fetchFn   : async () => {throw new Error('ECONNRESET')},
            name      : 'devindex-opt-in',
            owner     : 'neomjs',
            token     : 't'
        });

        expect(result).toEqual({ok: false, reason: 'ECONNRESET'})
    });

    test('a transport throw on the FIRST call recovers on retry — the budget can now reach it', async () => {
        let calls = 0;

        const flakyTransport = async () => {
            calls++;
            if (calls === 1) throw new Error('ECONNRESET');
            return {status: 200, json: async () => ({data: {repository: REACHABLE_REPOSITORY}})}
        };

        await expect(assertDataSyncAccess({
            fetchFn: flakyTransport, log: () => {}, token: 't', waitFn: noWait
        })).resolves.toBeUndefined();

        // 3 calls: opt-in throws then succeeds, opt-out succeeds first try. Before the catch this
        // rejected with a raw ECONNRESET at calls=1, naming no repository.
        expect(calls).toBe(3)
    });

    test('a persistent transport fault names the repository and does NOT blame the installation', async () => {
        let threw = null;

        await assertDataSyncAccess({
            fetchFn: async () => {throw new Error('ECONNRESET')},
            log    : () => {},
            token  : 't',
            waitFn : noWait
        }).catch(error => {threw = error});

        expect(threw.message).toContain('neomjs/devindex-opt-in');
        expect(threw.message).toContain('ECONNRESET');
        expect(threw.message).toContain('Transport or availability fault');
        expect(threw.message).not.toContain('PERSISTENT authorization failure')
    });

    test('MIXED failures are classified per repository, not by one global verdict', async () => {
        // The defect this pins: `failures.some(DENIAL_PATTERN)` labelled the WHOLE aggregate a
        // persistent authorization failure as soon as one repository denied, instructing the operator
        // to fix an App installation on a repository whose credential was never rejected.
        let threw = null;

        await assertDataSyncAccess({
            fetchFn: async (_url, options) => {
                if (JSON.parse(options.body).variables.name === 'devindex-opt-in') {
                    return {status: 200, json: async () => ({errors: [{message: 'Resource not accessible by integration'}]})}
                }
                throw new Error('ECONNRESET')
            },
            log   : () => {},
            token : 't',
            waitFn: noWait
        }).catch(error => {threw = error});

        const
            optIn  = threw.message.slice(threw.message.indexOf('devindex-opt-in'), threw.message.indexOf('devindex-opt-out')),
            optOut = threw.message.slice(threw.message.indexOf('devindex-opt-out'));

        // Each verdict sits on the line whose cause produced it — and, decisively, NOT on the other.
        expect(optIn).toContain('PERSISTENT authorization failure');
        expect(optIn).not.toContain('Transport or availability fault');
        expect(optOut).toContain('Transport or availability fault');
        expect(optOut).not.toContain('PERSISTENT authorization failure')
    });
});

/**
 * Preflight-only dispatch: verifying the credential topology must not require mutating anything.
 *
 * The collection stages have side effects — OptOut comments on and closes real issues in
 * `devindex-opt-out`. A configuration check that can only be performed by running them is a check
 * nobody repeats while iterating on an installation, which is precisely when it is most needed.
 */
test.describe('preflight-only dispatch mode', () => {
    let emitGeneratedData;

    test.beforeAll(async () => {
        ({emitGeneratedData} = await import('../../../../../buildScripts/dataSyncPipeline.mjs'))
    });

    test.afterEach(() => {
        delete process.env.DATA_SYNC_PREFLIGHT_ONLY
    });

    test('preflight-only runs the probe and then executes NO stage', async () => {
        const executed = [];

        process.env.DATA_SYNC_PREFLIGHT_ONLY = 'true';

        let probed = false;

        await emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : async command => {executed.push(command)},
            log      : () => {},
            preflight: async () => {probed = true}
        });

        expect(probed).toBe(true);
        expect(executed).toEqual([])
    });

    test('the flag is opt-in: absent or non-"true" runs the full sequence', async () => {
        for (const value of [undefined, 'false', '1', 'yes']) {
            const executed = [];

            value === undefined
                ? delete process.env.DATA_SYNC_PREFLIGHT_ONLY
                : process.env.DATA_SYNC_PREFLIGHT_ONLY = value;

            await emitGeneratedData({
                attempt  : 1,
                cwd      : '/tmp',
                execute  : async command => {executed.push(command)},
                log      : () => {},
                preflight: async () => {}
            });

            // Only the exact string 'true' short-circuits. A truthy-ish value silently skipping the
            // whole pipeline would be a scheduled run that reports success having done nothing —
            // the same silent-no-op class this ticket exists to remove.
            expect(executed.length, `flag=${String(value)}`).toBeGreaterThan(0)
        }
    });

    test('preflight failure still aborts in preflight-only mode', async () => {
        process.env.DATA_SYNC_PREFLIGHT_ONLY = 'true';

        await expect(emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : async () => {},
            log      : () => {},
            preflight: async () => {throw new Error('[DataSync preflight] denied')}
        })).rejects.toThrow('denied')
    });
});

/**
 * The bounded budget, added on @neo-gpt-emmy's review challenge.
 *
 * The original design claimed timing alone separated persistent denial from transient: a probe
 * before any collection cannot be mid-batch flakiness. True — but it does not rule out a flaky
 * FIRST call, so declaring one denial permanently authorized because of WHEN it happened traded a
 * permanent-misread-as-transient bug for a transient-misread-as-permanent one. A scheduled run
 * aborted on a single blip is its own outage.
 *
 * Persistence is now established by EXHAUSTION as well as timing. The fail-fast property survives:
 * the case this exists for produced the same denial sixty consecutive times.
 */
test.describe('preflight retry budget', () => {
    const denialBody    = {errors: [{message: 'Resource not accessible by integration'}]},
          reachableBody = {data: {repository: REACHABLE_REPOSITORY}};

    test('a flaky first call recovers instead of being reported permanent', async () => {
        let calls = 0;

        const flaky = async () => {
            calls++;
            return {status: 200, json: async () => (calls <= 2 ? denialBody : reachableBody)}
        };

        await expect(assertDataSyncAccess({
            fetchFn: flaky, log: () => {}, token: 't', waitFn: noWait
        })).resolves.toBeUndefined();

        expect(calls).toBeGreaterThan(2)
    });

    test('a persistent denial still fails, and only after the budget is spent', async () => {
        let calls = 0;

        const denied = async () => {
            calls++;
            return {status: 200, json: async () => denialBody}
        };

        await expect(assertDataSyncAccess({
            attempts: 3, fetchFn: denied, log: () => {}, token: 't', waitFn: noWait
        })).rejects.toThrow('PERSISTENT authorization failure');

        // 2 repositories x 3 attempts. A single-shot probe would have spent 2 — the distinction
        // between "denied once" and "denied every time" is the whole classification.
        expect(calls).toBe(6)
    });
});
