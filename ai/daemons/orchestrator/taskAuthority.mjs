/**
 * Canonical authority classes expressed as the runtime ownership vocabulary for the
 * split host-edge + container-plane topology.
 *
 * `shared-primitive` remains distinct from `container-plane`: it records that the
 * capability is required by both environments even though the target topology gives
 * its single lifecycle owner to the container plane (for example, Compose owns Chroma).
 *
 * @type {Readonly<Object>}
 */
export const ORCHESTRATOR_AUTHORITY_CLASS = Object.freeze({
    containerPlane : 'container-plane',
    hostEdge       : 'host-edge',
    sharedPrimitive: 'shared-primitive'
});

/**
 * Legal runtime profiles. `legacy-mixed` is an explicit compatibility profile for
 * existing maintainer checkouts until an explicit machine cutover; it is never inferred
 * from `deploymentMode`.
 *
 * @type {Readonly<Object>}
 */
export const ORCHESTRATOR_AUTHORITY_PROFILE = Object.freeze({
    containerPlane: 'container-plane',
    hostEdge      : 'host-edge',
    legacyMixed   : 'legacy-mixed'
});

/**
 * The target two-process topology whose ownership matrix must remain gap-free and
 * duplicate-free.
 *
 * @type {ReadonlyArray<String>}
 */
export const TARGET_ORCHESTRATOR_AUTHORITY_PROFILES = Object.freeze([
    ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge,
    ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane
]);

/**
 * Profile-to-class ownership is the single routing rule. Per-lane enable flags may
 * disable configured work, but they cannot move a lane to a different authority.
 *
 * @type {Readonly<Object<String, ReadonlyArray<String>>>}
 */
export const AUTHORITY_CLASSES_BY_PROFILE = Object.freeze({
    [ORCHESTRATOR_AUTHORITY_PROFILE.legacyMixed]: Object.freeze([
        ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
        ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
        ORCHESTRATOR_AUTHORITY_CLASS.sharedPrimitive
    ]),
    [ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge]: Object.freeze([
        ORCHESTRATOR_AUTHORITY_CLASS.hostEdge
    ]),
    [ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane]: Object.freeze([
        ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
        ORCHESTRATOR_AUTHORITY_CLASS.sharedPrimitive
    ])
});

/**
 * Exhaustive task-to-authority classification.
 *
 * This is deliberately a task map, not another set of per-profile booleans. Both the
 * continuous-child registry and scheduled registry project their `authorityClass`
 * from this map, so adding a task without classifying it fails during construction or
 * boot instead of silently inheriting the current process.
 *
 * **`kbSync` and `temporal-summary` are container-plane, not host-edge**, even though both scan the
 * Neo repo's own corpus — the classification that would once have made them local-only. The
 * container IS the checkout: it is built from the repo and carries `learn/`, `src/`,
 * `resources/content/` and `.git` at the built revision, which is every source both lanes read, and
 * no non-containerized scheduler exists to run them instead.
 *
 * Classing them host-edge leaves the Knowledge Base with no producer at all: the container declines
 * the lanes to an owner whose own posture fragment declines them too, and the ownership audit passes
 * throughout, because class-ownership and enablement are different axes and it only checks the
 * first. A lane whose decliner names itself as owner is the shape to watch for.
 *
 * This does **not** re-point `kbSync` at TENANT content — that remains `tenant-repo-sync`'s job on
 * its own GitMirror primitive, and conflating the two re-couples tenant ingestion to a
 * checkout-scan model. What moved is where the Neo-corpus scan RUNS, not what it reads. The lane
 * taxonomy and that anti-pattern are both governed by the decision record linked below.
 *
 * @type {Readonly<Object<String, String>>}
 * @see learn/agentos/decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md
 * @see learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */
export const TASK_AUTHORITY_BY_NAME = Object.freeze({
    chroma                                 : ORCHESTRATOR_AUTHORITY_CLASS.sharedPrimitive,
    bridgeDaemon                           : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    devServer                              : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    neuralLinkBridge                       : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    embedDaemon                            : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    messageDaemon                          : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    mlx                                    : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    ollama                                 : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    lms                                    : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    summary                                : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'memory-summary-backfill'              : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    kbSync                                 : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    githubWorkflowSync                     : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    backup                                 : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'graphlog-compaction'                  : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'temporal-summary'                     : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    chromaDefrag                           : ORCHESTRATOR_AUTHORITY_CLASS.sharedPrimitive,
    'primary-dev-sync'                     : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    'tenant-repo-sync'                     : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    dream                                  : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'message-concept-harvest'              : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'golden-path'                          : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'swarm-heartbeat'                      : ORCHESTRATOR_AUTHORITY_CLASS.hostEdge,
    'embed-drain-liveness-watchdog'        : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'rem-consolidation-liveness-watchdog'  : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'heavy-maintenance-starvation-watchdog': ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'data-integrity-sweep'                 : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'boot-identity-fact'                   : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'deployment-state-bridge'              : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane,
    'freeze-reprobe'                       : ORCHESTRATOR_AUTHORITY_CLASS.containerPlane
});

/**
 * Canonical continuous-child registry.
 *
 * `enabledBy` names the Orchestrator getter that applies the existing AiConfig lane
 * toggle. A missing `enabledBy` means task-definition presence is the enablement gate
 * (the configured local model launchers).
 *
 * @type {ReadonlyArray<Object>}
 */
export const CONTINUOUS_TASK_REGISTRY = Object.freeze([
    {taskName: 'chroma',           enabledBy: 'chromaDaemonEnabled'},
    {taskName: 'bridgeDaemon',     enabledBy: 'bridgeDaemonEnabled'},
    {taskName: 'devServer',        enabledBy: 'devServerEnabled'},
    {taskName: 'neuralLinkBridge', enabledBy: 'neuralLinkBridgeEnabled'},
    {taskName: 'embedDaemon',      enabledBy: 'embedDaemonEnabled'},
    {taskName: 'messageDaemon',    enabledBy: 'messageDaemonEnabled'},
    {taskName: 'mlx'},
    {taskName: 'ollama'},
    {taskName: 'lms'}
].map(descriptor => Object.freeze({
    ...descriptor,
    authorityClass: getTaskAuthorityClass(descriptor.taskName)
})));

/**
 * Recurring poll-side effects which are neither child processes nor cadence-picked
 * tasks. Keeping them in the same inventory prevents an authority split from leaving
 * an unclassified side door after the scheduled pipeline returns.
 *
 * @type {ReadonlyArray<Object>}
 */
export const INTERNAL_TASK_REGISTRY = Object.freeze([
    {taskName: 'boot-identity-fact'},
    {taskName: 'deployment-state-bridge'},
    {taskName: 'freeze-reprobe'}
].map(descriptor => Object.freeze({
    ...descriptor,
    authorityClass: getTaskAuthorityClass(descriptor.taskName)
})));

/**
 * On-demand supervised children which are not continuous processes or cadence-picked
 * tasks. Chroma defrag follows Chroma's shared-primitive authority and enablement.
 *
 * @type {ReadonlyArray<Object>}
 */
export const AUXILIARY_TASK_REGISTRY = Object.freeze([
    {taskName: 'chromaDefrag'}
].map(descriptor => Object.freeze({
    ...descriptor,
    authorityClass: getTaskAuthorityClass(descriptor.taskName)
})));

/**
 * @summary Returns the canonical authority class for one orchestrator task and fails
 * closed when the task has not been classified.
 * @param {String} taskName Stable orchestrator task name.
 * @param {Object} [taskAuthorityByName=TASK_AUTHORITY_BY_NAME] Injectable classification map.
 * @returns {String}
 */
export function getTaskAuthorityClass(
    taskName,
    taskAuthorityByName = TASK_AUTHORITY_BY_NAME
) {
    const authorityClass = taskAuthorityByName?.[taskName];

    if (!authorityClass) {
        throw new Error(`[orchestrator-authority] Unclassified task "${taskName}".`);
    }

    return authorityClass;
}

/**
 * @summary Adds canonical authority metadata to a freshly-built task-definition map.
 * Construction fails if any definition lacks a classification.
 * @param {Object} taskDefinitions Mutable task-definition map under construction.
 * @returns {Object} The same map, enriched with `authorityClass`.
 */
export function attachTaskAuthority(taskDefinitions = {}) {
    for (const [taskName, definition] of Object.entries(taskDefinitions)) {
        definition.authorityClass = getTaskAuthorityClass(taskName);
    }

    return taskDefinitions;
}

/**
 * @summary Asserts that a requested runtime authority profile is explicitly legal.
 * @param {String} profile Requested profile.
 * @param {Object} [authorityClassesByProfile=AUTHORITY_CLASSES_BY_PROFILE] Injectable matrix.
 * @returns {String} The validated profile.
 */
export function assertAuthorityProfile(
    profile,
    authorityClassesByProfile = AUTHORITY_CLASSES_BY_PROFILE
) {
    if (!Object.hasOwn(authorityClassesByProfile, profile)) {
        throw new Error(
            `[orchestrator-authority] Unknown authority profile "${profile}". ` +
            `Expected one of: ${Object.keys(authorityClassesByProfile).join(', ')}.`
        );
    }

    return profile;
}

/**
 * @summary Resolves whether one authority profile owns a task's canonical class.
 * @param {Object} options
 * @param {String} options.profile Runtime authority profile.
 * @param {String} options.taskName Stable task name.
 * @param {Object} [options.authorityClassesByProfile] Injectable profile matrix.
 * @param {Object} [options.taskAuthorityByName] Injectable task classification.
 * @returns {Boolean}
 */
export function isTaskOwnedByProfile({
    profile,
    taskName,
    authorityClassesByProfile = AUTHORITY_CLASSES_BY_PROFILE,
    taskAuthorityByName       = TASK_AUTHORITY_BY_NAME
}) {
    assertAuthorityProfile(profile, authorityClassesByProfile);

    const authorityClass = getTaskAuthorityClass(taskName, taskAuthorityByName);

    return authorityClassesByProfile[profile].includes(authorityClass);
}

/**
 * @summary Splits a scheduling registry into the lanes a role owns and the lanes it does not.
 *
 * One derivation, two consumers, and that is the point. The scheduler takes `scheduled`; the
 * startup announcement takes `disabled`.
 *
 * The `scheduled` half is not new behaviour — `getAuthorityScheduledRegistry()` already filtered
 * the registry by ownership, and it now delegates here rather than filtering separately. What was
 * missing is the COMPLEMENT: the set a role deliberately does not run existed only as an `active`
 * flag inside the authority receipt written to `orchestrator-authority.json`, which nothing read
 * back. So the daemon computed which capabilities it was dropping, wrote that answer to disk, and
 * announced none of it — which is how a machine sat with Chroma unreachable and wake delivery
 * dead while its orchestrator reported healthy.
 *
 * Computing the complement by subtracting one filter's output from the registry would put the two
 * halves one edit apart from disagreeing. Producing both in a single pass makes "run it" and
 * "announce that I am not running it" the same decision, which is the only version where a lane
 * cannot end up in neither half.
 *
 * Fails closed on an unrecognised profile via {@link assertAuthorityProfile}: partitioning an
 * unknown role into "owns nothing" would present as a healthy daemon running no lanes at all.
 *
 * Pure and total — every descriptor lands in exactly one half.
 *
 * @param {Object} options
 * @param {String} options.profile Runtime authority profile.
 * @param {Array<Object>} options.registry Scheduling descriptors carrying `authorityClass`.
 * @param {Object} [options.authorityClassesByProfile] Injectable profile matrix.
 * @returns {{scheduled: Array<Object>, disabled: Array<Object>}}
 */
export function partitionRegistryByAuthority({
    profile,
    registry,
    authorityClassesByProfile = AUTHORITY_CLASSES_BY_PROFILE
}) {
    assertAuthorityProfile(profile, authorityClassesByProfile);

    const
        ownedClasses = authorityClassesByProfile[profile],
        scheduled    = [],
        disabled     = [];

    for (const descriptor of registry) {
        const authorityClass = descriptor.authorityClass ?? getTaskAuthorityClass(descriptor.taskName);

        (ownedClasses.includes(authorityClass) ? scheduled : disabled).push(descriptor);
    }

    return {disabled, scheduled};
}

/**
 * @summary Resolves which TARGET role owns an authority class, by the same single-owner rule
 * {@link auditAuthorityTopology} enforces.
 *
 * Exists so nothing downstream has to restate the mapping as a literal. A presentation-layer
 * `shared-primitive → container-plane` constant is correct only while the topology has exactly
 * these two roles: it silently encodes that assumption where nobody would think to look for it,
 * and the day a third role appears it keeps producing a confident wrong answer instead of failing.
 * The derivation cannot — it throws, exactly as the topology audit does.
 *
 * `legacy-mixed` is deliberately not a candidate: it owns every class, so including it would make
 * every lookup ambiguous. Ownership is a property of the target split.
 *
 * @param {Object} options
 * @param {String} options.authorityClass Canonical authority class.
 * @param {Object} [options.authorityClassesByProfile] Injectable profile matrix.
 * @param {ReadonlyArray<String>} [options.profiles] Candidate roles.
 * @returns {String} The single owning profile.
 * @throws {Error} On an ownership gap or double ownership.
 */
export function resolveAuthorityClassOwner({
    authorityClass,
    authorityClassesByProfile = AUTHORITY_CLASSES_BY_PROFILE,
    profiles                  = TARGET_ORCHESTRATOR_AUTHORITY_PROFILES
}) {
    const owners = profiles.filter(profile => authorityClassesByProfile[profile]?.includes(authorityClass));

    if (owners.length !== 1) {
        throw new Error(
            `[orchestrator-authority] ${owners.length === 0 ? 'ownership gap' : 'double ownership'} ` +
            `for class "${authorityClass}" (owners=${JSON.stringify(owners)}).`
        );
    }

    return owners[0];
}

/**
 * @summary Builds the exhaustive continuous + scheduled + internal + auxiliary lane
 * inventory and rejects duplicate task names or registry metadata that disagrees with
 * the canonical map.
 * @param {Object} options
 * @param {Object[]} options.continuousRegistry Continuous-child descriptors.
 * @param {Object[]} options.scheduledRegistry Scheduled-task descriptors.
 * @param {Object[]} options.internalRegistry Recurring internal-effect descriptors.
 * @param {Object[]} options.auxiliaryRegistry On-demand supervised-child descriptors.
 * @returns {Object[]} Normalized `{task, kind, authorityClass}` lanes.
 */
export function buildAuthorityLaneInventory({
    continuousRegistry = CONTINUOUS_TASK_REGISTRY,
    scheduledRegistry  = [],
    internalRegistry   = INTERNAL_TASK_REGISTRY,
    auxiliaryRegistry  = AUXILIARY_TASK_REGISTRY
} = {}) {
    const lanes = [
        ...continuousRegistry.map(descriptor => ({
            task          : descriptor.taskName,
            kind          : 'continuous',
            authorityClass: descriptor.authorityClass
        })),
        ...scheduledRegistry.map(descriptor => ({
            task          : descriptor.taskName,
            kind          : 'scheduled',
            authorityClass: descriptor.authorityClass
        })),
        ...internalRegistry.map(descriptor => ({
            task          : descriptor.taskName,
            kind          : 'internal',
            authorityClass: descriptor.authorityClass
        })),
        ...auxiliaryRegistry.map(descriptor => ({
            task          : descriptor.taskName,
            kind          : 'auxiliary',
            authorityClass: descriptor.authorityClass
        }))
    ];
    const seen = new Set();

    for (const lane of lanes) {
        if (!lane.task) {
            throw new Error('[orchestrator-authority] Registry entry is missing taskName.');
        }
        if (seen.has(lane.task)) {
            throw new Error(`[orchestrator-authority] Task "${lane.task}" is registered more than once.`);
        }
        seen.add(lane.task);

        const expectedClass = getTaskAuthorityClass(lane.task);
        if (lane.authorityClass !== expectedClass) {
            throw new Error(
                `[orchestrator-authority] Task "${lane.task}" registry class ` +
                `"${lane.authorityClass}" does not match canonical class "${expectedClass}".`
            );
        }
    }

    return lanes;
}

/**
 * @summary Audits a topology for exactly one owner per lane. Gaps and duplicate owners
 * throw before either orchestrator begins work.
 * @param {Object} options
 * @param {Object[]} options.lanes Normalized lane inventory.
 * @param {String[]} options.profiles Profiles participating in the topology.
 * @param {Object} [options.authorityClassesByProfile] Injectable profile matrix.
 * @returns {Object[]} Lane ownership rows with one `effectiveOwner`.
 */
export function auditAuthorityTopology({
    lanes,
    profiles,
    authorityClassesByProfile = AUTHORITY_CLASSES_BY_PROFILE
} = {}) {
    if (!Array.isArray(profiles) || profiles.length === 0) {
        throw new Error('[orchestrator-authority] Topology must declare at least one authority profile.');
    }

    const uniqueProfiles = [...new Set(profiles)];
    if (uniqueProfiles.length !== profiles.length) {
        throw new Error('[orchestrator-authority] Topology contains a duplicate authority profile.');
    }

    uniqueProfiles.forEach(profile => assertAuthorityProfile(profile, authorityClassesByProfile));

    return lanes.map(lane => {
        const owners = uniqueProfiles.filter(profile =>
            authorityClassesByProfile[profile].includes(lane.authorityClass)
        );

        if (owners.length !== 1) {
            const failure = owners.length === 0 ? 'ownership gap' : 'double ownership';
            throw new Error(
                `[orchestrator-authority] ${failure} for task "${lane.task}" ` +
                `(class="${lane.authorityClass}", owners=${JSON.stringify(owners)}).`
            );
        }

        return {...lane, effectiveOwner: owners[0]};
    });
}

/**
 * @summary Builds the secret-free, machine-readable ownership receipt for one
 * orchestrator role after auditing the relevant topology.
 * @param {Object} options
 * @param {String} options.profile Runtime authority profile.
 * @param {Object[]} options.continuousRegistry Continuous-child descriptors.
 * @param {Object[]} options.scheduledRegistry Scheduled-task descriptors.
 * @param {Object[]} options.internalRegistry Recurring internal-effect descriptors.
 * @param {Object[]} options.auxiliaryRegistry On-demand supervised-child descriptors.
 * @param {Object} [options.authorityClassesByProfile] Injectable profile matrix.
 * @returns {{schemaVersion:Number, role:String, topologyProfiles:String[], tasks:Object[]}}
 */
export function buildAuthorityReceipt({
    profile,
    continuousRegistry = CONTINUOUS_TASK_REGISTRY,
    scheduledRegistry  = [],
    internalRegistry   = INTERNAL_TASK_REGISTRY,
    auxiliaryRegistry  = AUXILIARY_TASK_REGISTRY,
    authorityClassesByProfile = AUTHORITY_CLASSES_BY_PROFILE
} = {}) {
    assertAuthorityProfile(profile, authorityClassesByProfile);

    const lanes = buildAuthorityLaneInventory({
        continuousRegistry,
        scheduledRegistry,
        internalRegistry,
        auxiliaryRegistry
    });
    const topologyProfiles = profile === ORCHESTRATOR_AUTHORITY_PROFILE.legacyMixed
        ? [ORCHESTRATOR_AUTHORITY_PROFILE.legacyMixed]
        : [...TARGET_ORCHESTRATOR_AUTHORITY_PROFILES];
    const audited = auditAuthorityTopology({
        lanes,
        profiles: topologyProfiles,
        authorityClassesByProfile
    });

    return {
        schemaVersion: 1,
        role         : profile,
        topologyProfiles,
        tasks        : audited.map(lane => ({
            role          : profile,
            task          : lane.task,
            kind          : lane.kind,
            authorityClass: lane.authorityClass,
            effectiveOwner: lane.effectiveOwner,
            active        : lane.effectiveOwner === profile
        }))
    };
}
