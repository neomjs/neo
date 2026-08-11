/**
 * @plane in-plane
 */
import {createHash} from 'crypto';
import {Command}    from 'commander';

/**
 * @module ai/scripts/maintenance/communityActivityShadowProbeCore
 *
 * @summary Pure, dependency-injected report core for the GitHub community-activity shadow probe.
 *
 * The provider reader, clock, and canonical trust classifier are injected. This module never
 * imports GitHub services, AiConfig, Memory Core, Tasks, checkpoints, wake delivery, graph state,
 * or filesystem IO. It turns metadata-only source snapshots into a versioned lower-bound report,
 * records two-run variance without inventing an acceptance threshold, and enforces the shadow
 * authority firewall before returning evidence to the thin CLI.
 */

export const REPORT_SCHEMA_VERSION = 'community-activity-shadow-report.v1';

export const SOURCE_MANIFEST_SCHEMA_VERSION = 'community-activity-source-manifest.v1';

export const QUERY_PLAN_VERSION = 'github-community-shadow.v1';

const FAMILY_NAMES = Object.freeze(['issues', 'pullRequests', 'discussions']);

const ACTOR_KINDS = Object.freeze(['user', 'bot', 'organization', 'mannequin', 'enterpriseUser', 'unknown']);

const TRUST_TIERS = Object.freeze([
    'system',
    'repo-trusted',
    'owner',
    'self',
    'peer-trusted',
    'internal-authored',
    'external',
    'unclassified'
]);

const POLICY_THRESHOLDS = Object.freeze({
    acquisitionCadenceMs: null,
    archiveThreshold    : null,
    paginationCap       : null,
    retentionMs         : null,
    stewardLeaseMs      : null,
    ttlMs               : null,
    wakeThreshold       : null
});

const PRODUCTION_MUTATIONS = Object.freeze({
    admittedEvents     : 0,
    advancedCheckpoints: 0,
    createdTasks       : 0,
    deliveredWakes     : 0,
    projectedCounts    : 0
});

const FUTURE_METRIC_REASON = 'requires-production-lifecycle-substrate';

const KNOWN_LOWER_BOUND_GAPS = new Set([
    'absence_is_not_a_tombstone',
    'child_watermark_not_proven',
    'discussion_child_watermark_lower_bound',
    'historical_deletion_tombstones_unavailable',
    'historical_revisions_unavailable',
    'issue_comment_deletion_tombstones_unavailable',
    'issue_lifecycle_history_not_acquired',
    'issue_timeline_events_not_sampled',
    'pull_request_comment_deletion_tombstones_unavailable',
    'pull_request_lifecycle_history_not_acquired',
    'pull_request_timeline_events_not_sampled',
    'review_comment_deletion_tombstones_unavailable',
    'search_window_has_day_granularity'
]);

/**
 * @summary Recursively sorts object keys so evidence hashes are independent of insertion order.
 * @param {*} value JSON-compatible input.
 * @returns {*} Canonicalized value.
 */
function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize)
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .filter(key => value[key] !== undefined)
                .map(key => [key, canonicalize(value[key])])
        )
    }

    return value
}

/**
 * @summary Returns a full SHA-256 hex digest for JSON-compatible evidence.
 * @param {*} value JSON-compatible input.
 * @returns {String}
 */
export function hashEvidence(value) {
    return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

/**
 * @summary Creates the uniform measured/lower-bound/unknown numeric envelope.
 * @param {String} status `measured`, `lower-bound`, `unknown`, or `not-applicable`.
 * @param {Number|null} value Numeric value, or null for unknown/not-applicable.
 * @param {String} unit `count`, `bytes`, `milliseconds`, or `ratio`.
 * @param {Object} [details]
 * @param {Number|null} [details.numerator]
 * @param {Number|null} [details.denominator]
 * @param {String|null} [details.reasonCode]
 * @returns {Object}
 */
export function measurement(status, value, unit, {numerator=null, denominator=null, reasonCode=null}={}) {
    const isUnknown = status === 'unknown' || status === 'not-applicable';

    if (isUnknown && (value !== null || !reasonCode)) {
        throw new Error(`measurement: ${status} requires value=null and a reasonCode`)
    }

    if (!isUnknown && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`measurement: ${status} requires a finite non-negative value`)
    }

    return {status, value, unit, numerator, denominator, reasonCode}
}

/**
 * @summary Creates a ratio measurement, preserving its numerator and denominator.
 * @param {Number} numerator Ratio numerator.
 * @param {Number} denominator Ratio denominator.
 * @param {String} [status='measured'] Evidence status when the denominator is non-zero.
 * @param {String} [zeroReason='zero-denominator'] Unknown reason for a zero denominator.
 * @returns {Object}
 */
function rate(numerator, denominator, status='measured', zeroReason='zero-denominator') {
    return denominator === 0
        ? measurement('unknown', null, 'ratio', {numerator, denominator, reasonCode: zeroReason})
        : measurement(status, numerator / denominator, 'ratio', {numerator, denominator})
}

/**
 * @summary Builds the probe CLI contract shared by help rendering and argument parsing.
 * @returns {Command}
 */
function createProgram() {
    return new Command()
        .name('ai:probe-community-activity-shadow')
        .description('Read-only GitHub community-activity shadow measurement; emits evidence, never authority.')
        .helpOption('-h, --help', 'Display help.')
        .allowExcessArguments(false)
        .requiredOption('--owner <owner>', 'GitHub repository owner.')
        .requiredOption('--repo <repo>', 'GitHub repository name.')
        .requiredOption('--window-start <iso>', 'Inclusive ISO-8601 window start.')
        .requiredOption('--window-end <iso>', 'Exclusive ISO-8601 window end.')
        .option('--page-size <count>', 'Provider page-size coordinate (GitHub range 1..100).', value => Number(value), 100)
        .option('--runs <count>', 'Repeated full acquisitions (minimum 2; no pass/fail variance threshold).', value => Number(value), 2)
        .option('--output <path>', 'Optional JSON report path under the repository.')
}

/**
 * @summary Parses and validates explicit, reproducible probe coordinates.
 * @param {String[]} argv `process.argv.slice(2)`.
 * @returns {Object} Normalized CLI options, or `{helpText}` for a help-only invocation.
 */
export function parseArgs(argv) {
    const program = createProgram();

    if (argv.some(argument => argument === '--help' || argument === '-h')) {
        return {helpText: program.helpInformation()}
    }

    program
        .exitOverride()
        .configureOutput({writeErr: () => {}, writeOut: () => {}})
        .parse(argv, {from: 'user'});

    const options = program.opts();
    const start   = Date.parse(options.windowStart);
    const end     = Date.parse(options.windowEnd);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new Error('parseArgs: --window-start and --window-end must form a valid half-open ISO interval')
    }

    if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 100) {
        throw new Error('parseArgs: --page-size must be an integer in GitHub\'s 1..100 provider range')
    }

    if (!Number.isInteger(options.runs) || options.runs < 2) {
        throw new Error('parseArgs: --runs must be an integer >= 2 for repeated-run evidence')
    }

    return {
        ...options,
        windowEnd  : new Date(end).toISOString(),
        windowStart: new Date(start).toISOString()
    }
}

/**
 * @summary Normalizes provider actor kinds without folding them into trust.
 * @param {String|null|undefined} value REST `user.type` or GraphQL `__typename`.
 * @returns {String}
 */
export function normalizeActorKind(value) {
    const key = String(value ?? '').replace(/[^a-z]/gi, '').toLowerCase();

    return ({
        bot           : 'bot',
        enterpriseuser: 'enterpriseUser',
        mannequin     : 'mannequin',
        organization  : 'organization',
        user          : 'user'
    })[key] || 'unknown'
}

/**
 * @summary Creates a zero-filled counter object for a controlled vocabulary.
 * @param {String[]} keys Counter keys.
 * @returns {Object}
 */
function counters(keys) {
    return Object.fromEntries(keys.map(key => [key, 0]))
}

/**
 * @summary Resolves canonical trust while failing closed when collaborator authority is degraded.
 * @param {Object} actor Provider actor metadata.
 * @param {Object} collaboratorCensus `{status, collaborators}`.
 * @param {Function} classifyTrust Canonical injected classifier.
 * @returns {String}
 */
function resolveTrust(actor, collaboratorCensus, classifyTrust) {
    if (!actor?.login || typeof classifyTrust !== 'function') {
        return 'unclassified'
    }

    const censusComplete = collaboratorCensus?.status === 'complete';
    const trustTier      = classifyTrust(actor.login, {
        collaborators: censusComplete ? collaboratorCensus.collaborators : []
    });

    if (!TRUST_TIERS.includes(trustTier)) {
        return 'unclassified'
    }

    // A canonical roster identity remains known without repository membership. An otherwise
    // external result is ambiguous while the collaborator census is degraded, so it fails closed.
    if (!censusComplete && (trustTier === 'external' || trustTier === 'repo-trusted')) {
        return 'unclassified'
    }

    return trustTier
}

/**
 * @summary Maps a trust tier to roster relation without conflating trust and actor kind.
 * @param {String} trustTier Canonical trust tier.
 * @returns {String}
 */
function rosterRelation(trustTier) {
    if (['system', 'owner', 'self', 'peer-trusted', 'internal-authored'].includes(trustTier)) {
        return 'rostered'
    }

    if (trustTier === 'external' || trustTier === 'repo-trusted') {
        return 'notRostered'
    }

    return 'unknown'
}

/**
 * @summary Identifies popularity telemetry excluded by AC10.
 * @param {Object} row Provider row.
 * @returns {Boolean}
 */
function isPopularity(row) {
    const key = String(row?.eventType ?? row?.sourceFamily ?? '').toLowerCase();

    return ['star', 'unstar', 'fork', 'watch', 'unwatch', 'sponsor', 'follow'].some(token => key.includes(token))
}

/**
 * @summary Returns a stable occurrence identity for duplicate-rate measurement.
 * @param {Object} row Metadata-only provider row.
 * @returns {String}
 */
function occurrenceKey(row) {
    const timestamps = row?.timestamps ?? row ?? {};

    return [
        row?.id ?? 'unknown-id',
        row?.eventType ?? 'unknown-event',
        row?.mutationKind ?? 'snapshot',
        row?.occurredAt ?? row?.activityAt ?? timestamps.updatedAt ?? timestamps.createdAt ?? timestamps.deletedAt ?? 'unknown-time'
    ].join('|')
}

/**
 * @summary Produces the metadata-only row shape used for projected storage bytes.
 * @param {Object} row Source row.
 * @param {String} actorKind Normalized actor kind.
 * @param {String} trustTier Canonical trust tier.
 * @returns {Object}
 */
function projectStorageRow(row, actorKind, trustTier) {
    const timestamps = row?.timestamps ?? row ?? {};

    return {
        actorKind,
        actorRefHash   : row?.actor?.login ? hashEvidence(String(row.actor.login).toLowerCase()) : null,
        createdAt      : timestamps.createdAt ?? null,
        deletedAt      : timestamps.deletedAt ?? null,
        eventType      : row?.eventType ?? 'unknown',
        id             : row?.id ?? null,
        mutationKind   : row?.mutationKind ?? 'snapshot',
        occurredAt     : row?.occurredAt ?? row?.activityAt ?? null,
        responseBearing: row?.responseBearing === true,
        trustTier,
        updatedAt      : timestamps.updatedAt ?? null
    }
}

/**
 * @summary Groups attention dispositions without retaining logins or source prose.
 * @param {Object[]} classified Classified rows.
 * @returns {Object[]}
 */
function buildDispositions(classified) {
    const groups = new Map();

    for (const item of classified) {
        const eligible   = item.actorKind === 'user' && item.trustTier === 'external' && item.row.responseBearing === true;
        let   reasonCode = 'eligible-external-response-bearing';

        if (!eligible) {
            if (item.actorKind !== 'user') {
                reasonCode = `actor-kind-${item.actorKind}`;
            } else if (item.trustTier !== 'external') {
                reasonCode = `trust-${item.trustTier}`;
            } else {
                reasonCode = 'source-not-response-bearing';
            }
        }

        const disposition = eligible ? 'eligible' : (item.trustTier === 'external' ? 'excluded' : 'context-only');
        const key         = [item.actorKind, item.trustTier, item.rosterRelation, disposition, reasonCode].join('|');
        const previous    = groups.get(key) || {
            actorKind     : item.actorKind,
            count         : 0,
            disposition,
            reasonCode,
            rosterRelation: item.rosterRelation,
            trustTier     : item.trustTier
        };

        previous.count++;
        groups.set(key, previous);
    }

    return [...groups.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

/**
 * @summary Converts one family snapshot into aggregate-only measurement evidence.
 * @param {String} family Family name.
 * @param {Object} source Source family snapshot.
 * @param {Object} context Classification context.
 * @returns {Object}
 */
function buildFamilyReport(family, source={}, {classifyTrust, collaboratorCensus}) {
    const pages          = Array.isArray(source.pages) ? source.pages : [];
    const rawRows        = pages.flatMap(page => Array.isArray(page.rows) ? page.rows : []);
    const popularityRows = rawRows.filter(isPopularity);
    const inScopeRows    = rawRows.filter(row => !isPopularity(row));
    const candidateRows  = [];
    const actorKinds     = counters(ACTOR_KINDS);
    const trustTiers     = counters(TRUST_TIERS);
    const roster         = counters(['rostered', 'notRostered', 'unknown']);
    const seen           = new Set();
    const entityIds      = new Set();
    const classified     = [];
    const storageRows    = [];
    let   duplicateRows  = 0;

    for (const row of inScopeRows) {
        const key = occurrenceKey(row);
        if (seen.has(key)) {
            duplicateRows++;
            continue
        }

        const actorKind = normalizeActorKind(row?.actor?.type);
        const trustTier = resolveTrust(row?.actor, collaboratorCensus, classifyTrust);
        const relation  = rosterRelation(trustTier);

        seen.add(key);
        candidateRows.push(row);
        actorKinds[actorKind]++;
        trustTiers[trustTier]++;
        roster[relation]++;
        entityIds.add(String(row?.providerEntityId ?? row?.id ?? key));
        storageRows.push(projectStorageRow(row, actorKind, trustTier));
        classified.push({actorKind, rosterRelation: relation, row, trustTier});
    }

    const mutationCount = kind => candidateRows.filter(row => row?.mutationKind === kind).length;
    const createRows    = mutationCount('create');
    const revisionRows  = candidateRows.filter(row => ['revision', 'snapshot-change', 'update'].includes(row?.mutationKind)).length;
    const tombstoneRows = candidateRows.filter(row => ['delete', 'tombstone'].includes(row?.mutationKind)
        && (row?.explicitTombstone === true || row?.tombstone === true)).length;
    const stateRows         = candidateRows.filter(row => ['state-transition', 'state_transition'].includes(row?.mutationKind)).length;
    const unknownAbsence    = candidateRows.filter(row => ['unknown-absence', 'unknown_absence'].includes(row?.mutationKind)).length;
    const stableStorageRows = storageRows
        .map(canonicalize)
        .sort((left, right) => {
            const leftJson  = JSON.stringify(left);
            const rightJson = JSON.stringify(right);

            return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0
        });
    const projectedBytes = Buffer.byteLength(JSON.stringify(stableStorageRows), 'utf8');
    const dispositions   = buildDispositions(classified);
    const eligibleRows   = dispositions.filter(item => item.disposition === 'eligible').reduce((sum, item) => sum + item.count, 0);
    const providerMs     = pages.reduce((sum, page) => sum + (Number.isFinite(page?.latencyMs) ? page.latencyMs : 0), 0);
    const pageReceipts   = pages.map((page, index) => ({
        apiSurface           : page.apiSurface ?? (Object.hasOwn(page, 'terminalReceipt') ? 'rest' : 'graphql'),
        cursor               : page.cursor ?? null,
        hasNextPage          : page.hasNextPage ?? page.sourceHasNextPage ?? null,
        latencyMs            : Number.isFinite(page.latencyMs) ? page.latencyMs : null,
        pageOrdinal          : page.pageOrdinal ?? index + 1,
        providerCost         : Number.isFinite(page.providerCost) ? page.providerCost : (Number.isFinite(page.rateCost) ? page.rateCost : null),
        resourceKind         : page.resourceKind ?? page.connection ?? family,
        responseFingerprint  : page.responseFingerprint ?? hashEvidence((page.rows ?? []).map(occurrenceKey)),
        rows                 : Array.isArray(page.rows) ? page.rows.length : 0,
        sourceRows           : Number.isFinite(page.sourceRows) ? page.sourceRows : null,
        terminalReceipt      : page.terminalReceipt === true,
        windowTerminalReceipt: page.windowTerminalReceipt === true
    }));
    const gaps = Array.isArray(source.gaps) ? source.gaps.map(gap => ({
        reasonCode  : gap.reasonCode ?? gap.code ?? 'unspecified-source-gap',
        resourceKind: gap.resourceKind ?? gap.scope ?? family
    })) : [];

    return {
        acquisition: {
            exhausted  : source.exhausted === true,
            gaps,
            inScopeRows: inScopeRows.length,
            pages      : pages.length,
            rawRows    : rawRows.length
        },
        attention: {
            dispositions,
            eligibleRows,
            excludedRows: candidateRows.length - eligibleRows
        },
        classifications: {
            actorKinds,
            actorTrustMatrix: dispositions.map(({actorKind, count, rosterRelation: relation, trustTier}) => ({actorKind, count, rosterRelation: relation, trustTier})),
            rosterRelation  : roster,
            trustTiers
        },
        family,
        latency: {
            providerAcquisitionMs: measurement('measured', providerMs, 'milliseconds'),
            usefulResponseMs     : measurement('unknown', null, 'milliseconds', {reasonCode: FUTURE_METRIC_REASON})
        },
        mutationEvidence: {
            createRows,
            explicitTombstoneRows: tombstoneRows,
            revisionRows,
            stateTransitionRows  : stateRows,
            unknownAbsenceRows   : unknownAbsence
        },
        observations: {
            candidateRows         : candidateRows.length,
            duplicateRows,
            explicitTombstoneRows : tombstoneRows,
            popularityExcludedRows: popularityRows.length,
            revisionRows,
            uniqueEntities        : entityIds.size
        },
        pageReceipts,
        projectionInputs: {
            countEligibleRows: eligibleRows,
            wakeEligibleRows : eligibleRows
        },
        rates: {
            duplicateRate    : rate(duplicateRows, inScopeRows.length),
            pagesPerCandidate: rate(pages.length, candidateRows.length),
            tombstoneRate    : rate(tombstoneRows, candidateRows.length, 'lower-bound'),
            updateRate       : rate(revisionRows, candidateRows.length, 'lower-bound')
        },
        storage: {
            bytesPerCandidate     : rate(projectedBytes, candidateRows.length, 'lower-bound'),
            projectedMetadataBytes: measurement('lower-bound', projectedBytes, 'bytes')
        },
        inventoryHash: hashEvidence(stableStorageRows)
    }
}

/**
 * @summary Builds one run's aggregate evidence from one provider snapshot.
 * @param {Object} snapshot Reader result.
 * @param {Object} options Probe coordinates.
 * @param {Object} deps Classification dependencies.
 * @returns {Object}
 */
function buildRun(snapshot, options, deps) {
    const collaboratorCensus = snapshot?.collaboratorCensus || {status: 'degraded', collaborators: [], gaps: [{reasonCode: 'collaborator-census-missing'}]};
    const families           = FAMILY_NAMES.map(family => buildFamilyReport(family, snapshot?.families?.[family], {...deps, collaboratorCensus}));
    const pageReceipts       = families.flatMap(item => item.pageReceipts.map(receipt => ({family: item.family, ...receipt})));
    const candidateRows      = families.reduce((sum, item) => sum + item.observations.candidateRows, 0);
    const graphqlCalls       = Array.isArray(snapshot?.transport?.graphqlCalls) ? snapshot.transport.graphqlCalls : [];
    const restCalls          = Array.isArray(snapshot?.transport?.restCalls) ? snapshot.transport.restCalls : [];
    const graphqlCost        = Number.isFinite(snapshot?.transport?.graphqlCost) ? snapshot.transport.graphqlCost : null;
    const providerRequests   = graphqlCalls.length + restCalls.length;
    const providerCostUnits  = graphqlCost == null ? null : graphqlCost + restCalls.length;
    const sourceCoordinates  = {
        canonicalProviderHost: 'github.com',
        familyPlans          : FAMILY_NAMES.map(family => ({family, pageSize: options.pageSize})),
        provider             : 'github',
        queryPlanVersion     : QUERY_PLAN_VERSION,
        repository           : {name: options.repo, owner: options.owner},
        schemaVersion        : SOURCE_MANIFEST_SCHEMA_VERSION,
        window               : {endExclusive: options.windowEnd, semantics: 'half-open', startInclusive: options.windowStart}
    };
    const queryPlanHash         = hashEvidence(sourceCoordinates);
    const sourceManifestHash    = hashEvidence({pageReceipts, inventories: families.map(item => ({family: item.family, inventoryHash: item.inventoryHash}))});
    const candidateManifestHash = hashEvidence(families.map(item => ({family: item.family, inventoryHash: item.inventoryHash})));
    const gaps                  = [
        ...(collaboratorCensus.gaps ?? []).map(gap => ({family: 'collaborators', reasonCode: gap.reasonCode ?? gap.code ?? 'collaborator-census-degraded'})),
        ...families.flatMap(item => item.acquisition.gaps.map(gap => ({family: item.family, ...gap})))
    ];
    const exhausted    = families.every(item => item.acquisition.exhausted) && collaboratorCensus.status === 'complete';
    const degradedGaps = gaps.filter(gap => !KNOWN_LOWER_BOUND_GAPS.has(gap.reasonCode));

    return {
        candidateManifestHash,
        completedAt: snapshot?.completedAt ?? deps.now(),
        coverage   : {
            degraded               : !exhausted || degradedGaps.length > 0,
            exhausted,
            gaps,
            globalCompletenessClaim: false,
            lowerBound             : true,
            lowerBoundReasons      : [
                'window-bounded',
                'unseen-intermediate-revisions-possible',
                ...gaps.filter(gap => KNOWN_LOWER_BOUND_GAPS.has(gap.reasonCode)).map(gap => gap.reasonCode)
            ].filter((value, index, values) => values.indexOf(value) === index),
            unseenHistoryPossible: true
        },
        families,
        pageReceipts,
        provider: {
            combinedCostUnits: providerCostUnits == null
                ? measurement('unknown', null, 'provider-cost-units', {reasonCode: 'graphql-cost-unavailable'})
                : measurement('lower-bound', providerCostUnits, 'provider-cost-units', {
                    reasonCode: 'graphql-reported-cost-plus-one-unit-per-rest-request'
                }),
            graphqlCostUnits: graphqlCost == null
                ? measurement('unknown', null, 'provider-cost-units', {reasonCode: 'graphql-cost-unavailable'})
                : measurement('measured', graphqlCost, 'provider-cost-units'),
            graphqlRequests: graphqlCalls.length,
            requests       : providerRequests,
            restRequests   : restCalls.length
        },
        queryPlanHash,
        sourceCoordinates,
        sourceManifestHash,
        startedAt: snapshot?.startedAt ?? deps.now(),
        totals   : {
            attentionEligibleRows : families.reduce((sum, item) => sum + item.attention.eligibleRows, 0),
            candidateRows,
            duplicateRows         : families.reduce((sum, item) => sum + item.observations.duplicateRows, 0),
            pages                 : families.reduce((sum, item) => sum + item.acquisition.pages, 0),
            providerCostUnits,
            providerRequests,
            projectedMetadataBytes: families.reduce((sum, item) => sum + item.storage.projectedMetadataBytes.value, 0),
            rawRows               : families.reduce((sum, item) => sum + item.acquisition.rawRows, 0),
            revisionRows          : families.reduce((sum, item) => sum + item.observations.revisionRows, 0),
            tombstoneRows         : families.reduce((sum, item) => sum + item.observations.explicitTombstoneRows, 0)
        }
    }
}

/**
 * @summary Computes exact last-minus-first variance without attaching a policy threshold.
 * @param {Object[]} runs Run evidence.
 * @returns {Object}
 */
function buildRepeatability(runs) {
    const first      = runs[0];
    const last       = runs.at(-1);
    const comparable = runs.every(run => run.queryPlanHash === first.queryPlanHash);
    const keys       = [
        'pages',
        'providerRequests',
        'providerCostUnits',
        'rawRows',
        'candidateRows',
        'duplicateRows',
        'revisionRows',
        'tombstoneRows',
        'projectedMetadataBytes',
        'attentionEligibleRows'
    ];
    const variance = Object.fromEntries(keys.map(key => {
        const firstValue = first.totals[key];
        const lastValue  = last.totals[key];
        const delta      = comparable && Number.isFinite(firstValue) && Number.isFinite(lastValue)
            ? lastValue - firstValue
            : null;

        return [key, delta]
    }));

    return {
        comparable,
        comparisonReason: comparable ? null : 'query-plan-coordinates-differ',
        evidenceStatus  : runs.length >= 2 ? 'two-run' : 'insufficient-runs',
        requiredRuns    : 2,
        runs            : runs.map((run, index) => ({
            candidateManifestHash: run.candidateManifestHash,
            completedAt          : run.completedAt,
            queryPlanHash        : run.queryPlanHash,
            runIndex             : index + 1,
            providerCostUnits    : run.provider.combinedCostUnits,
            providerRequests     : run.provider.requests,
            sourceManifestHash   : run.sourceManifestHash,
            startedAt            : run.startedAt
        })),
        schemaVersion: 'community-activity-repeatability.v1',
        variance
    }
}

/**
 * @summary Enforces the evidence-not-authority firewall on a constructed report.
 * @param {Object} report Shadow report.
 * @returns {Object} The same report after validation.
 */
export function assertShadowFirewall(report) {
    if (report?.authority?.notAuthority !== true || report?.authority?.mode !== 'shadow') {
        throw new Error('assertShadowFirewall: report must remain shadow evidence, never authority')
    }

    if (Object.values(report.authority.productionMutations ?? {}).some(value => value !== 0)) {
        throw new Error('assertShadowFirewall: production mutation counters must remain zero')
    }

    if (report?.policy?.introduced !== false || Object.values(report?.policy?.thresholds ?? {}).some(value => value !== null)) {
        throw new Error('assertShadowFirewall: shadow measurement cannot introduce policy thresholds')
    }

    return report
}

/**
 * @summary Runs repeated source acquisitions and returns one JSON-first lower-bound report.
 * @param {Object} options Parsed probe options.
 * @param {Object} deps
 * @param {Function} deps.reader Pure injected source reader.
 * @param {Function} deps.now Injected ISO clock.
 * @param {Function} deps.classifyTrust Canonical author-trust classifier.
 * @returns {Promise<{exitCode: Number, report: Object}>}
 */
export async function runShadowProbe(options, {reader, now, classifyTrust}) {
    if (typeof reader !== 'function' || typeof now !== 'function' || typeof classifyTrust !== 'function') {
        throw new Error('runShadowProbe: reader, now, and classifyTrust functions are required')
    }

    const startedAt = now();
    const runs      = [];

    for (let runIndex = 1; runIndex <= options.runs; runIndex++) {
        const snapshot = await reader({
            families: FAMILY_NAMES,
            owner   : options.owner,
            pageSize: options.pageSize,
            provider: 'github',
            repo    : options.repo,
            runIndex,
            window  : {end: options.windowEnd, start: options.windowStart}
        });

        runs.push(buildRun(snapshot, options, {classifyTrust, now}));
    }

    const primary       = runs.at(-1);
    const repeatability = buildRepeatability(runs);
    const generatedAt   = now();
    const report        = {
        authority: {
            mode               : 'shadow',
            notAuthority       : true,
            permittedWrites    : {reportFiles: 1},
            productionMutations: {...PRODUCTION_MUTATIONS}
        },
        coverage         : primary.coverage,
        excludedTelemetry: {
            popularityFamilies: ['star', 'unstar', 'fork', 'watch', 'unwatch', 'equivalents'],
            rows              : primary.families.reduce((sum, family) => sum + family.observations.popularityExcludedRows, 0)
        },
        families         : primary.families.map(({pageReceipts, ...family}) => family),
        futureMetricSlots: Object.fromEntries(Object.entries({
            bytesPerAdmittedEvent    : 'bytes',
            casConflictRate          : 'ratio',
            duplicateBatchReceiptRate: 'ratio',
            duplicateResponseRate    : 'ratio',
            falsePositiveRate        : 'ratio',
            hooksPerAdmittedEvent    : 'ratio',
            opaqueCheckpointBytes    : 'bytes',
            outboxAgeMs              : 'milliseconds',
            replayLagMs              : 'milliseconds',
            stewardVacancyRate       : 'ratio',
            timeToAcknowledgeMs      : 'milliseconds',
            timeToClaimMs            : 'milliseconds',
            timeToRespondMs          : 'milliseconds',
            wakesPerAdmittedEvent    : 'ratio'
        }).map(([key, unit]) => [key, measurement('unknown', null, unit, {reasonCode: FUTURE_METRIC_REASON})])),
        generatedAt,
        policy  : {introduced: false, thresholds: {...POLICY_THRESHOLDS}},
        provider: primary.provider,
        repeatability,
        reportId: hashEvidence({generatedAt, queryPlanHash: primary.queryPlanHash, sourceManifestHash: primary.sourceManifestHash}),
        run     : {
            completedAt: generatedAt,
            durationMs : Math.max(0, Date.parse(generatedAt) - Date.parse(startedAt)),
            runCount   : runs.length,
            startedAt
        },
        schemaVersion : REPORT_SCHEMA_VERSION,
        sourceManifest: {
            ...primary.sourceCoordinates,
            candidateManifestHash: primary.candidateManifestHash,
            pageReceipts         : primary.pageReceipts,
            queryPlanHash        : primary.queryPlanHash,
            sourceManifestHash   : primary.sourceManifestHash
        },
        totals: primary.totals
    };

    report.summary = {
        schemaVersion: 'community-activity-shadow-summary.v1',
        text         : formatHumanSummary(report)
    };

    assertShadowFirewall(report);

    return {exitCode: 0, report}
}

/**
 * @summary Renders a deterministic compact human summary without promoting evidence to policy.
 * @param {Object} report Versioned shadow report.
 * @returns {String}
 */
export function formatHumanSummary(report) {
    const coverage = report?.coverage?.degraded ? 'DEGRADED LOWER BOUND' : 'LOWER BOUND';
    const totals   = report?.totals ?? {};
    const variance = report?.repeatability?.variance ?? {};

    return [
        `[community-activity-shadow ${report?.schemaVersion}] ${coverage}`,
        `source occurrences=${totals.candidateRows ?? 0} · attention-eligible external=${totals.attentionEligibleRows ?? 0} · pages=${totals.pages ?? 0}`,
        `provider requests=${totals.providerRequests ?? 'unknown'} · provider cost units=${totals.providerCostUnits ?? 'unknown'}`,
        `projected metadata=${totals.projectedMetadataBytes ?? 0} bytes · duplicates=${totals.duplicateRows ?? 0} · revisions=${totals.revisionRows ?? 0} · tombstones=${totals.tombstoneRows ?? 0}`,
        `repeatability=${report?.repeatability?.evidenceStatus ?? 'unknown'} · candidate variance=${variance.candidateRows ?? 'unknown'} · no thresholds authorized`
    ].join('\n')
}
