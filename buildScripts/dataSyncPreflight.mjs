/**
 * @module buildScripts/dataSyncPreflight
 * @summary Proves each repository the Data Sync pipeline must reach is actually reachable, BEFORE
 * any expensive collection stage runs.
 *
 * `Resource not accessible by integration` is returned for two conditions that share one string:
 *
 * 1. genuine GitHub-side flakiness — the same call succeeding hours later on the same token;
 * 2. a permanently missing or under-scoped App installation.
 *
 * No message inspection can separate them, which is why the bounded-retry classification treats the
 * string as transient. That is correct for (1) and catastrophic for (2): a permanent
 * misconfiguration becomes an unbounded series of identical retried failures, each looking like bad
 * luck. This pipeline spent eight days and sixty consecutive scheduled runs in exactly that state.
 *
 * The discriminator is not the message, it is WHEN the denial happens. A denial on a minimal probe
 * issued before any work — one cheap query per repository, bounded by a small retry budget — cannot be mid-batch
 * flakiness; it is the configuration answering. A denial later, after probes passed, is the
 * transient class the retry budget exists for.
 *
 * So this preflight fails fast and NAMES the repository, while leaving the bounded retries intact
 * for reads that have already proven their credential works.
 */

/**
 * @summary Repositories the pipeline must reach, and the identity each one needs.
 *
 * `devindex-opt-out` is here deliberately: the scheduled sequence runs OptOut as well as OptIn, and
 * an installation covering only `neo` + `devindex-opt-in` would pass this probe and then fail one
 * stage later — after the setup work looked complete.
 * @type {Object[]}
 */
export const REQUIRED_REPOSITORIES = [
    {connection: 'stargazers', name: 'devindex-opt-in',  owner: 'neomjs', purpose: 'OptIn stargazer read'},
    {connection: 'issues',     name: 'devindex-opt-out', owner: 'neomjs', purpose: 'OptOut issue read + close'}
];

const DENIAL_PATTERN = /resource not accessible by integration|not accessible|bad credentials|requires authentication/i;

/**
 * @summary Remediation text for a denial, derived from the CONNECTION that was refused.
 *
 * A single fixed remedy is worse than none once it can be wrong. Every denial used to print
 * "install the App with `Issues: Read and write` and `Metadata: Read`" — permissions the workflow
 * ALREADY requests at `.github/workflows/data-sync-pipeline.yml`. So the one message an operator
 * reads while diagnosing a stargazer denial instructed them to go confirm the state they were
 * already in, and the guidance itself became a detour.
 *
 * These strings deliberately stop at what is published and observed. GitHub announced the
 * stargazer restriction and its admin/collaborator boundary; it did not publish an enforcement
 * schedule, and it says nothing about installation tokens — so the text must not assert a rollout
 * mechanism, a permanence, or a fix that has not been demonstrated to work.
 * @param {String} connection Repository connection that was refused, e.g. `stargazers`.
 * @returns {String}
 */
function denialRemedy(connection) {
    if (connection === 'stargazers') {
        return 'GitHub limits stargazer reads to repository ADMINS AND COLLABORATORS (announced ' +
            '2026-06-30). That is account STATUS, not an App permission — so `Metadata: Read` being ' +
            'present does not imply this read is permitted, and widening App permissions may not ' +
            'restore it. Determine whether the intake identity holds admin/collaborator access on ' +
            'THIS repository; if it cannot, the stargazer-sourced path is unavailable and must be ' +
            'retired or replaced rather than re-permissioned.'
    }

    if (connection === 'issues') {
        return 'Verify the intake App is installed on THIS repository with `Issues: Read and write`.'
    }

    // Named, not guessed. A connection with no mapped remedy gets the one instruction that is true
    // for every capability — check what this specific read requires — instead of inheriting another
    // connection's advice, which is the defect this function exists to remove.
    return `No mapped remedy for connection \`${connection}\`; establish what access that specific ` +
        'read requires before changing any permission.'
}

/**
 * @summary Issues one minimal, un-retried GraphQL read that exercises the connection this
 * repository is actually here for.
 *
 * It probed `repository{id}` alone, which resolves from repository metadata — so it answered "can
 * this identity see the repository", never "can it perform the read named in `purpose`". Those came
 * apart in production: `devindex-opt-in reachable (OptIn stargazer read)` was logged by a run whose
 * stargazer read was denied twelve minutes later, and the log line asserting coverage is what sent
 * diagnosis away from the credential. Selecting the named connection closes the gap between what
 * this probe proves and what its `purpose` claims.
 * @param {Object}   options
 * @param {String}   options.owner Repository owner.
 * @param {String}   options.name Repository name.
 * @param {String}   options.connection Repository connection the consuming stage reads, e.g.
 * `stargazers`. This is the field `purpose` names, so the probe and the claim cannot drift apart.
 * @param {String}   options.token Installation token to probe with.
 * @param {Function} [options.fetchFn=fetch] Injectable transport.
 * @returns {Promise<{ok: Boolean, reason: String|null}>}
 */
export async function probeRepository({owner, name, connection, token, fetchFn = fetch}) {
    let response, body;

    // A transport failure — ECONNRESET, DNS, TLS — is the single most common transient class, and it
    // is the one shape that arrives as a THROWN exception rather than an `errors` array. Uncaught, it
    // escaped this function, escaped the caller's retry loop, and escaped `assertDataSyncAccess`
    // entirely: the bounded retry could not see the failure mode it exists for, and the operator got
    // a raw stack trace naming no repository. Converting it to the same `{ok, reason}` shape here
    // rather than in the loop keeps the contract true for every caller, not just that one.
    try {
        response = await fetchFn('https://api.github.com/graphql', {
            method : 'POST',
            headers: {
                Authorization : `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // `first: 1` keeps this as cheap as the id-only probe it replaces: one edge proves
                // the connection is readable, and the pipeline never uses the returned page.
                query: 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name)' +
                    `{id ${connection}(first:1){pageInfo{hasNextPage}}}}`,
                variables: {name, owner}
            })
        });

        body = await response.json().catch(() => ({}))
    } catch (error) {
        return {ok: false, reason: error?.message || String(error)}
    }

    // A GraphQL denial arrives as HTTP 200 with an `errors` array, so status alone is not the test.
    const message = body?.errors?.map(error => error.message).join('; ') || '';

    // BOTH selections, because GraphQL answers a partial denial with partial DATA: `id` resolves
    // from repository metadata while the denied connection returns null beside an `errors` entry.
    // Testing `id` alone would read that exact response — the one this probe exists to catch — as a
    // success, which is how the id-only probe passed while the stargazer read was already denied.
    if (body?.data?.repository?.id && body.data.repository[connection]) {
        return {ok: true, reason: null}
    }

    return {ok: false, reason: message || `HTTP ${response.status}`}
}

/**
 * @summary Probes every required repository and throws a single actionable error naming all
 * failures, rather than dying on the first one 40 minutes into a collection run.
 * @param {Object}   [options]
 * @param {String}   [options.token] Intake installation token.
 * @param {Object[]} [options.repositories=REQUIRED_REPOSITORIES]
 * @param {Function} [options.fetchFn=fetch] Injectable transport.
 * @param {Function} [options.log=console.log] Telemetry sink.
 * @returns {Promise<void>}
 */
export async function assertDataSyncAccess({
    token,
    repositories = REQUIRED_REPOSITORIES,
    attempts     = 3,
    fetchFn      = fetch,
    log          = console.log,
    waitFn       = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
    if (!token) {
        throw new Error(
            '[DataSync preflight] No intake token was provided. The pipeline cannot reach the DevIndex ' +
            'repositories without an installation token, and proceeding would spend a full collection ' +
            'run to rediscover that.'
        );
    }

    const failures = [];

    for (const {connection, name, owner, purpose} of repositories) {
        // BOUNDED, not single-shot. The timing argument this preflight rests on separates
        // mid-batch flakiness from a pre-work denial — it does NOT rule out a flaky FIRST call.
        // Declaring one denial permanently authorized because of when it happened would trade a
        // permanent-misread-as-transient bug for a transient-misread-as-permanent one, and a
        // scheduled run aborted on a single blip is its own outage.
        //
        // Three attempts still resolves in seconds, so the fail-fast property survives intact:
        // the case this exists for produced the SAME denial sixty consecutive times.
        let ok = false, reason = null;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            ({ok, reason} = await probeRepository({connection, fetchFn, name, owner, token}));

            if (ok) break;

            if (attempt < attempts) {
                log(`[DataSync preflight] ${owner}/${name} attempt ${attempt}/${attempts} failed (${reason}); retrying`);
                await waitFn(attempt * 500)
            }
        }

        log(`[DataSync preflight] ${owner}/${name} ${ok ? 'reachable' : 'DENIED'} (${purpose})`);

        if (!ok) {
            failures.push({connection, name, owner, purpose, reason})
        }
    }

    if (failures.length === 0) {
        return
    }

    // Classified PER REPOSITORY, never in aggregate. A global `failures.some(DENIAL_PATTERN)` labels
    // the whole run a persistent authorization failure the moment ONE repository denies — so an
    // opt-in denial plus an opt-out connection reset told the operator to go fix an App installation
    // on a repository whose credential was never rejected. That is a false instruction, and it costs
    // a debugging session on the one repository that was working. Each line carries its own verdict
    // because each line has its own cause.
    //
    // "Persistent" means EXHAUSTED, not merely early: pre-work timing rules out mid-batch contention,
    // and the spent retry budget rules out a single unlucky first call. Neither claim suffices alone.
    const detail = failures
        .map(({connection, name, owner, purpose, reason}) => {
            const remedy = DENIAL_PATTERN.test(reason)
                ? 'PERSISTENT authorization failure — the credential was rejected on every attempt. ' +
                  denialRemedy(connection)
                : 'Transport or availability fault — the credential was never rejected here, so the ' +
                  'installation is not implicated.';

            return `  - ${owner}/${name} (${purpose}): ${reason}\n      ${remedy}`
        })
        .join('\n');

    throw new Error(
        `[DataSync preflight] ${failures.length} required repository/repositories unreachable, ` +
        `each probed before any collection stage and given its full retry budget:\n${detail}`
    );
}
