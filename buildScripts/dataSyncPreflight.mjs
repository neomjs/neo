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
 * issued before any work — one cheap query per repository, no retry budget — cannot be mid-batch
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
    {name: 'devindex-opt-in',  owner: 'neomjs', purpose: 'OptIn stargazer read'},
    {name: 'devindex-opt-out', owner: 'neomjs', purpose: 'OptOut issue read + close'}
];

const DENIAL_PATTERN = /resource not accessible by integration|not accessible|bad credentials|requires authentication/i;

/**
 * @summary Issues one minimal, un-retried GraphQL read against a repository.
 * @param {Object}   options
 * @param {String}   options.owner Repository owner.
 * @param {String}   options.name Repository name.
 * @param {String}   options.token Installation token to probe with.
 * @param {Function} [options.fetchFn=fetch] Injectable transport.
 * @returns {Promise<{ok: Boolean, reason: String|null}>}
 */
export async function probeRepository({owner, name, token, fetchFn = fetch}) {
    const response = await fetchFn('https://api.github.com/graphql', {
        method : 'POST',
        headers: {
            Authorization : `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query    : 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id}}',
            variables: {name, owner}
        })
    });

    const body = await response.json().catch(() => ({}));

    // A GraphQL denial arrives as HTTP 200 with an `errors` array, so status alone is not the test.
    const message = body?.errors?.map(error => error.message).join('; ') || '';

    if (body?.data?.repository?.id) {
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
    fetchFn      = fetch,
    log          = console.log
} = {}) {
    if (!token) {
        throw new Error(
            '[DataSync preflight] No intake token was provided. The pipeline cannot reach the DevIndex ' +
            'repositories without an installation token, and proceeding would spend a full collection ' +
            'run to rediscover that.'
        );
    }

    const failures = [];

    for (const {name, owner, purpose} of repositories) {
        const {ok, reason} = await probeRepository({fetchFn, name, owner, token});

        log(`[DataSync preflight] ${owner}/${name} ${ok ? 'reachable' : 'DENIED'} (${purpose})`);

        if (!ok) {
            failures.push({name, owner, purpose, reason})
        }
    }

    if (failures.length === 0) {
        return
    }

    const detail = failures
        .map(({name, owner, purpose, reason}) => `  - ${owner}/${name} (${purpose}): ${reason}`)
        .join('\n');

    // Persistent by construction: these probes carry no retry budget and ran before any collection,
    // so a denial here is the installation answering, not a transient read.
    const denial = failures.some(({reason}) => DENIAL_PATTERN.test(reason));

    throw new Error(
        `[DataSync preflight] ${failures.length} required repository/repositories unreachable:\n${detail}\n` +
        (denial
            ? 'This is a PERSISTENT authorization failure, not a transient read: the probes carry no retry ' +
              'budget and ran before any collection. Verify the intake App is installed on each repository ' +
              'above with `Issues: Read and write` and `Metadata: Read`.'
            : 'Probes failed before any collection stage; treat as a configuration or connectivity fault.')
    );
}
