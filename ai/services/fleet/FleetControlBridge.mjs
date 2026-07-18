import Base                     from '../../../src/core/Base.mjs';
import FleetManager             from './FleetManager.mjs';
import FleetRegistryService     from './FleetRegistryService.mjs';
import FleetTenantService       from './FleetTenantService.mjs';
import {resolveIdentityDisplay} from './resolveIdentityDisplay.mjs';

import {LAUNCHABLE_HARNESS_TYPES, getHarnessAuthMode} from './deriveHarnessLaunchSpec.mjs';

import {
    createFleetMailboxMirrorSnapshot,
    DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT
} from './fleetMailboxMirrorAdapter.mjs';

import {
    createFleetCockpitStatus,
    createNotWiredCapability,
    FLEET_COCKPIT_SOURCES
} from '../../../src/ai/fleet/fleetCockpitStatus.mjs';

/**
 * @class Neo.ai.services.fleet.FleetControlBridge
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The single Body-reachable control surface of the Fleet Manager — the capability **allowlist** a
 * transport (the dev-server app↔fleet server, or the Electron shell's in-process object inject)
 * exposes to the `apps/agentos` settings pane. It composes the two Brain-side singletons into ONE
 * contract: the `define / list / get` half from {@link Neo.ai.services.fleet.FleetRegistryService}
 * and the `start / stop / restart / remove / status` lifecycle half from
 * {@link Neo.ai.services.fleet.FleetManager}. This is the middle of the operator loop
 * *define agents → start/stop → repos managed under the hood* that the Fleet Manager MVP still
 * lacked: the services self-wire and the pane exists, but nothing composed a single surface for a
 * transport to carry between them.
 *
 * **Why a dedicated surface, not "expose the singletons":** this bridge is the trust boundary
 * between the Body (browser-reachable) and the Brain (Node, secret-holding). It enumerates EXACTLY
 * the operations the pane may invoke and deliberately OMITS the Brain-internal secret paths —
 * `resolveCredential` (the only raw-PAT accessor), `mintBridgeToken`, `getSigningKey`. A transport
 * that serves ONLY this surface therefore cannot be tricked into decrypting a PAT even by a forged
 * request: the capability is simply not on the surface. The PAT rides IN through {@link #defineAgent}
 * (the registry stores it encrypted) and never comes back out — {@link FleetRegistryService}'s
 * two-hemisphere rule, preserved here by re-exposing only its `toPublic`-returning methods.
 *
 * **Transport-agnostic seam.** The same instance backs Option B (a dev-server app↔fleet transport,
 * the finish-now PoC path) and Option A (the Electron shell's in-process direct inject, the product
 * target). Neither transport reaches the singletons directly; both bind to this allowlist.
 *
 * **Consistency invariant.** In production the injectable `registry` / `manager` seams both resolve
 * to their singletons, and {@link FleetManager} keys its lifecycle off the same
 * `FleetRegistryService` singleton — so a `defineAgent` and a subsequent `startAgent` operate on ONE
 * agent set. Tests that inject stubs MUST inject a consistent pair.
 */
class FleetControlBridge extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.fleet.FleetControlBridge'
         * @protected
         */
        className: 'Neo.ai.services.fleet.FleetControlBridge',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Registry collaborator — the `define / list / get` half. Defaults (via {@link getRegistry}) to
     * the `FleetRegistryService` singleton; inject a stub in tests. A **plain field**, mirroring the
     * sibling `FleetManager.lifecycleService` injectable-seam shape, not reactive config.
     * @member {Object|null} registry=null
     */
    registry = null
    /**
     * Lifecycle collaborator — the `start / stop / restart / remove / status` half. Defaults (via
     * {@link getManager}) to the `FleetManager` singleton; inject a stub in tests. A plain field.
     * @member {Object|null} manager=null
     */
    manager = null
    /**
     * Boot-identity **read-observe** source — an injected collaborator exposing `produceBootIdentityFact()`
     * (the orchestrator's `BootIdentityHealthService`). READ-OBSERVE ONLY: the fact it returns is advisory,
     * never a lifecycle-write / restart command — the R3 read-observe ÷ lifecycle-write seam. A plain injectable
     * field like `registry` / `manager` (no static default — the orchestrator wires the live instance); unwired
     * → an advisory-empty fact, never fabricated liveness.
     * @member {Object|null} bootIdentitySource=null
     */
    bootIdentitySource = null
    /**
     * Activity-feed **read-observe** source — an injected collaborator exposing
     * `readActivitySnapshot(params)` that returns the bounded `{capability, events}` cockpit activity
     * snapshot (the composed A2A + PR/lane adapters). The mailbox / PR read paths — and with them the
     * identity binding + read permissions — stay owned by the wiring, per the adapters' DI contract
     * (they consume an injected `listMessages`, never import the singleton). A plain injectable field
     * like `bootIdentitySource` (no static default — the orchestrator wires the live source); unwired
     * → an honest source-not-wired snapshot, never fabricated activity.
     * @member {Object|null} activitySource=null
     */
    activitySource = null
    /**
     * Per-agent mailbox-mirror **read-observe** source — an injected collaborator exposing
     * `readMailboxMirror({subjectAgentId, limit, offset})` that returns the S1 mirror snapshot
     * (`{capability, admission, rows, page}`). Same DI contract as {@link #activitySource}: the
     * wiring owns the identity binding and read permissions, so the source is what holds
     * `resolveBoundIdentity` + the viewer-bound `listMessages` — this bridge never imports
     * MailboxService and never authors an admission fact. Production wiring lives in the launch
     * entry (`devFleetServer`), resolving the bound viewer from the request context the
     * authenticated ingress stamped — per request, never cached. Unwired → an honest source-not-wired
     * snapshot whose admission is `unavailable`, never an empty inbox: "no mail" and "no mailbox
     * feed" are different claims and only the producer may make the first.
     * @member {Object|null} mailboxMirrorSource=null
     */
    mailboxMirrorSource = null
    /**
     * Operator-compose **WRITE** seam — an injected collaborator exposing `addMessage(payload)`
     * (the MailboxService primitive, bound by the launch entry — never imported here). The FIRST
     * write seam on this bridge: unlike the read-observe sources above it persists a mailbox
     * message, but it carries NO identity — `addMessage` resolves the author and its server-stamped
     * principal class from the ambient request context the authenticated ingress bound, so the
     * writer moves payload, never sender. Same DI contract as {@link #activitySource} (no static
     * default; the launch entry wires the live writer); unwired → `composeOperatorMessage` answers
     * an honest `not-wired` refusal, never a fabricated acceptance.
     * @member {Object|null} composeWriter=null
     */
    composeWriter = null

    /**
     * Identity-display resolver seam — maps a fleet agent onto its identity-root display facts
     * (`{family, engineTag}`) for the {@link #fleetRoster} assembler join. Defaults (via
     * {@link getIdentityResolver}) to `resolveIdentityDisplay` over the flat identity roots; inject
     * a stub in tests. A plain injectable field, mirroring `registry` / `manager` — and the single
     * re-point site when the EmbodiedEpisode era schema supersedes the flat roots.
     * @member {Function|null} identityResolver=null
     */
    identityResolver = null
    /**
     * Remote-tenant collaborator seam. Defaults (via {@link getTenantService}) to the
     * `FleetTenantService` singleton; inject a stub in tests. A plain field, mirroring `registry` /
     * `manager`.
     * @member {Object|null} tenantService=null
     */
    tenantService = null

    /**
     * @returns {Object} the registry collaborator (injected stub or the default singleton).
     * @protected
     */
    getRegistry() {
        return this.registry || FleetRegistryService;
    }

    /**
     * @returns {Function} the identity-display resolver (injected stub or the module default).
     * @protected
     */
    getIdentityResolver() {
        return this.identityResolver || resolveIdentityDisplay;
    }

    /**
     * @returns {Object} the lifecycle collaborator (injected stub or the default singleton).
     * @protected
     */
    getManager() {
        return this.manager || FleetManager;
    }

    /**
     * @returns {Object} the remote-tenant collaborator (injected stub or the default singleton).
     * @protected
     */
    getTenantService() {
        return this.tenantService || FleetTenantService;
    }

    // ---- capability allowlist (the ONLY pane-reachable operations) ----------

    /**
     * @summary Create an agent. Existing ids reject so established residents can change only through
     * scoped update authorities. A supplied `credential` (PAT) is stored encrypted Node-side and is
     * **never** echoed back — the return is the public definition.
     * @param {Object}  definition
     * @param {String}  definition.githubUsername    The agent's GitHub username (required).
     * @param {String}  definition.harnessType       A supported harness type (required).
     * @param {String} [definition.credential]       The GitHub PAT — stored encrypted, never returned.
     * @param {String} [definition.id]               Stable id; defaults to `githubUsername`.
     * @param {Object} [definition.metadata]         Free-form non-secret metadata.
     * @param {String} [definition.modelProvider]    The agent's model-provider login; resolves via the AiConfig SSOT leaf when omitted.
     * @param {Object|null} [definition.mcpServers]   Complete sparse MCP overrides; omitted/null follows live defaults, exactly like configureAgent.
     * @returns {Object} The public agent definition (no credential), or a controlled
     *     `{status:'rejected', reason}` outcome for FleetRegistryService validation failures.
     */
    defineAgent(definition) {
        try {
            return this.getRegistry().defineAgent(definition)
        } catch (error) {
            const prefix = 'FleetRegistryService.defineAgent:';

            if (error?.message?.startsWith(prefix)) {
                return {status: 'rejected', reason: error.message.slice(prefix.length).trim()}
            }

            throw error
        }
    }

    /**
     * @summary Connect a remote Agent-OS tenant (tenant URL + PAT) — the design-partner entry: the
     * cockpit points at a HOSTED tenant instead of standing up the local stack. Delegates to
     * `FleetTenantService.connectTenant`; the credential is stored encrypted Node-side and is
     * **never** echoed back — the return is the public descriptor (`{id, endpoint, status,
     * deploymentClass, connectedAt}`) or a controlled `{status: 'rejected', reason}` outcome. The
     * same secret-omission boundary {@link #defineAgent} enforces for agent PATs.
     * @param {Object} params `{tenantUrl, credential}`
     * @returns {Promise<Object>} the public tenant descriptor, or `{status: 'rejected', reason}`.
     */
    connectTenant(params) {
        return this.getTenantService().connectTenant(params);
    }

    /**
     * @summary The connected remote tenants — public descriptors only, never a credential: the
     * read half of the remote-tenant surface, riding the same read-observe wire class as
     * {@link #fleetRoster}.
     * @returns {Object[]}
     */
    listTenants() {
        return this.getTenantService().listTenants();
    }

    /**
     * @summary Configure an existing agent through one serializable curated intent. Validation
     * failures become an explicit domain outcome the Accounts card may render; unexpected service
     * failures still throw and are sanitized by dispatchFleetRequest.
     * @param {Object} intent `{id, harnessType?, mcpServers?}`
     * @returns {{status: 'accepted', agent: Object}|{status: 'rejected', reason: String}}
     */
    configureAgent(intent) {
        try {
            const agent = this.getRegistry().configureAgent(intent);

            return agent
                ? {status: 'accepted', agent}
                : {status: 'rejected', reason: `Unknown agent '${intent?.id ?? ''}'.`}
        } catch (error) {
            const prefix = 'FleetRegistryService.configureAgent:';

            if (error?.message?.startsWith(prefix)) {
                return {status: 'rejected', reason: error.message.slice(prefix.length).trim()}
            }

            throw error
        }
    }

    /**
     * @summary List all agent definitions (no credentials) — the roster the pane renders.
     * @returns {Object[]}
     */
    listAgents() {
        return this.getRegistry().listAgents();
    }

    /**
     * @summary Get a single agent definition (no credential).
     * @param {String} id
     * @returns {Object|null}
     */
    getAgent(id) {
        return this.getRegistry().getAgent(id);
    }

    /**
     * @summary Start a defined agent — provision its repo under the resolved managed root, then spawn
     * its harness inside that checkout. The PAT is resolved + injected Node-side; it never crosses to
     * the pane. Fail-closed on a provisioning failure (the harness is not spawned).
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} the agent's lifecycle status.
     */
    startAgent(id) {
        return this.getManager().startAgent(id);
    }

    /**
     * @summary Stop a running agent's harness process (`SIGTERM`, then `SIGKILL` after the timeout).
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} `{success, id, state}`.
     */
    stopAgent(id) {
        return this.getManager().stopAgent(id);
    }

    /**
     * @summary Restart a running agent through the provisioned path (repo re-ensured, harness runs in
     * ITS checkout). Restarting a non-running agent is just a provisioned start.
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} the agent's lifecycle status.
     */
    restartAgent(id) {
        return this.getManager().restartAgent(id);
    }

    /**
     * @summary Remove an agent from the fleet — stop its process, then deregister its definition +
     * stored PAT. Deliberately non-destructive to the on-disk checkout (its checkout-path-keyed
     * auto-memory is reconciled by a separate Memory-Core policy, not orphaned here).
     * @param {String} id Registry agent id.
     * @returns {Promise<Object>} `{success, id}` (`success` ⇒ the agent existed and was deregistered).
     */
    removeAgent(id) {
        return this.getManager().removeAgent(id);
    }

    /**
     * @summary Set an agent's working-repo coordinates (`metadata.repo = {cloneUrl, repoSlug}`) on its
     * definition (fleet authority — the FM owns the registry, as with `defineAgent`). Functional
     * end-to-end: the provisioner already honors `metadata.repo`, so the next start launches the agent in
     * the set repo. A single-`params` payload, so it is pane-reachable over the wire. Non-destructive to
     * the existing on-disk checkout.
     * @param {Object} payload `{id, cloneUrl?, repoSlug?}` — the agent id + working-repo coordinates.
     * @returns {Object|null} the updated public definition, or `null` if the agent doesn't exist.
     */
    setRepo(payload) {
        return this.getManager().setRepo(payload);
    }

    /**
     * @summary Set an agent's profile-avatar reference (`metadata.avatarUrl`) on its definition (fleet
     * authority — the FM owns the registry, as with `defineAgent`). A single-`params` payload, so it is
     * pane-reachable over the wire. Non-destructive to other metadata.
     * @param {Object} payload `{id, avatarUrl?}` — the agent id + avatar reference.
     * @returns {Object|null} the updated public definition, or `null` if the agent doesn't exist.
     */
    setAvatar(payload) {
        return this.getManager().setAvatar(payload);
    }

    /**
     * @summary The *observe* half of the MVP loop: the per-agent repo-provisioning state across the
     * whole fleet, at the resolved managed root. Read-only.
     * @returns {Object[]} one status entry per registered agent.
     */
    fleetStatus() {
        return this.getManager().fleetRepoStatus();
    }

    /**
     * @summary The live-process half of the *observe* MVP loop: per-agent process-runtime state across
     * the whole fleet (running / stopped), complementing {@link #fleetStatus}'s repo view.
     * Read-only; carries no secret (the lifecycle status holds none). Richer idle / wedged / rate-limited
     * states are a watchdog-gated follow-up — this returns what the lifecycle records observe, never
     * an invented state.
     * @returns {Object[]} one `{agentId, state, running, confidence, source}` entry per registered agent.
     */
    fleetRuntimeStatus() {
        return this.getManager().fleetRuntimeStatus();
    }

    /**
     * @summary READ-OBSERVE: the advisory boot-identity fact of this Agent-OS process. Rides the authenticated
     * `registryBridge` as a **read** verb — it carries NO lifecycle-write / restart authority (the R3
     * read-observe ÷ lifecycle-write seam). An unwired {@link #bootIdentitySource} yields an advisory-`unknown`
     * fact, never a fabricated liveness.
     * @returns {Promise<Object>|Object} `{fact, classification, advisory:true, reason}` — advisory, no command.
     */
    getBootIdentity() {
        return this.bootIdentitySource
            ? this.bootIdentitySource.produceBootIdentityFact()
            : {fact: null, classification: 'unknown', advisory: true, reason: 'no-boot-identity-source'};
    }

    /**
     * @summary READ-OBSERVE: the bounded fleet activity snapshot (A2A + PR/lane) as cockpit events —
     * the real-time feed the FM cockpit's ActivityStream binds to. Rides the authenticated
     * `registryBridge` as a **read** verb; it carries NO lifecycle-write / restart authority (the R3
     * read-observe ÷ lifecycle-write seam). An unwired {@link #activitySource} yields an honest
     * source-not-wired snapshot (degraded capability + empty events), never fabricated activity —
     * mirroring {@link #getBootIdentity}'s advisory-empty degrade, so the cockpit renders a
     * "feed not wired" state rather than a silent freeze or invented traffic.
     * @param {Object} [params] Optional bounds forwarded to the source (`{limit, since, until}`).
     * @returns {Promise<Object>|Object} `{capability, events}` — the bounded cockpit activity snapshot.
     */
    fleetActivity(params) {
        return this.activitySource
            ? this.activitySource.readActivitySnapshot(params)
            : {
                capability: createNotWiredCapability(FLEET_COCKPIT_SOURCES.activity, 'fleet activity source not wired'),
                events    : []
            };
    }

    /**
     * @summary WRITE: compose one operator mailbox message — a DM to a named identity or an
     * `AGENT:*` broadcast — through the injected {@link #composeWriter} under the TRANSPORT-STAMPED
     * request identity. The first write verb on the fleet wire — the operator-steering inversion:
     * durable, attributed messages into the coordination fabric instead of session-bound prompts.
     *
     * **The sender is never a parameter.** `MailboxService.addMessage` resolves the author and its
     * server-stamped principal class from the ambient request context the authenticated ingress
     * bound — so a caller-supplied `from` / sender-shaped field has no path into the flow: the
     * payload below is whitelisted field-by-field, and identity fields are simply never copied.
     * Omitted `priority` / `wakeSuppressed` resolve to the sender-class defaults at the primitive
     * (the operator-steering class: durable-quiet, priority-high drain metadata, wake as a
     * per-message election).
     *
     * Unwired writer → an honest `not-wired` refusal envelope, never a fabricated acceptance; a
     * writer failure throws and is sanitized by `dispatchFleetRequest`.
     *
     * @param {Object}   params
     * @param {String}   params.to               Target identity (`@login`) or `AGENT:*`.
     * @param {String}   params.subject
     * @param {String}   params.body
     * @param {String}   [params.priority]       Omitted → sender-class default.
     * @param {Boolean}  [params.wakeSuppressed] Omitted → sender-class default (human ⇒ quiet).
     * @param {String[]} [params.relatedTickets]
     * @returns {Promise<Object>|Object} the writer's acceptance (`{messageId, sentAt, …}`), or the
     *     `{status:'not-wired'}` refusal when no writer is installed.
     */
    composeOperatorMessage(params = {}) {
        const writer = this.composeWriter;

        if (typeof writer?.addMessage !== 'function') {
            return {status: 'not-wired', reason: 'fleet: operator compose writer not wired'};
        }

        const {to, subject, body, priority, wakeSuppressed, relatedTickets} = params;
        const payload                                                       = {to, subject, body};

        if (priority       !== undefined) payload.priority       = priority;
        if (wakeSuppressed !== undefined) payload.wakeSuppressed = wakeSuppressed;
        if (relatedTickets !== undefined) payload.relatedTickets = relatedTickets;

        return writer.addMessage(payload)
    }

    /**
     * @summary READ-OBSERVE: one agent's viewer-admitted mailbox mirror — the S1 snapshot the FM
     * cockpit's AgentDetail mailbox tab renders. Rides the `registryBridge` as a **read** verb; it
     * carries NO lifecycle-write authority, and structurally no mutation verb exists on this path
     * (operator-side mark-read would mutate the agent's own turn-start signal).
     *
     * **The read executes under the transport-stamped viewer, never a caller claim.** The Fleet
     * ingress admits requests behind Host/Origin/bearer gates and stamps the server-resolved viewer
     * into the request context; the launch entry wires {@link #mailboxMirrorSource} to resolve the
     * bound identity from that context PER REQUEST. Loopback locality is not a viewer identity —
     * which is why an unwired source (an entry that has not composed the launch contract) still
     * answers an honest `unavailable` rather than pretending admission.
     *
     * Admission is decided by the Memory Core primitive's own fail-closed `CAN_READ_INBOX_OF` gate,
     * never re-implemented here or in {@link #mailboxMirrorSource} — this verb only routes. An
     * unwired source degrades through the adapter's OWN pure half so the not-wired snapshot is
     * shape-identical to a live one and cannot drift from it: same `{capability, admission, rows,
     * page}` envelope, `admission.state: 'unavailable'`, zero rows. It never returns an empty inbox
     * for a missing feed — "this agent has no mail" and "we cannot see this agent's mail" are
     * different claims, and only the producer is entitled to the first.
     * @param {Object} [params] `{subjectAgentId, limit, offset}` — the direct subject agent whose
     *     ACTIVE inbox is mirrored, plus bounded pagination.
     * @returns {Promise<Object>|Object} `{capability, admission, rows, page}` — the S1 mirror snapshot.
     */
    fleetMailboxMirror(params) {
        return this.mailboxMirrorSource
            ? this.mailboxMirrorSource.readMailboxMirror(params)
            : createFleetMailboxMirrorSnapshot({
                error  : 'fleet mailbox mirror source not wired',
                page   : {limit: params?.limit ?? DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT, offset: params?.offset ?? 0},
                subject: params?.subjectAgentId ?? null
            });
    }

    /**
     * @summary READ-OBSERVE: the assembled fleet-roster cockpit snapshot — the DTO the FM cockpit's
     * fleet grid renders from. This is the **assembler** the ratified fleet↔identity join design places Brain-side:
     * it gathers the shipped reads (`listAgents` roster + `fleetStatus` repo state +
     * `fleetRuntimeStatus` live process truth), joins each agent onto its identity-root display
     * facts through the ONE {@link #getIdentityResolver} seam (`family` as era/display attribute,
     * `engineTag` as current-model metadata — read-only, era-swap re-points the resolver, zero Body
     * diff), stamps the launch-derived truth per agent (`launchable` = the family is in the
     * launch-templated subset; `authMode` = `'marker' | 'in-app' | 'env-key' | null` — both DERIVED at read
     * time from the launch seam, never a second hand-maintained list, so a family becomes
     * cockpit-launchable exactly when its template lands), and hands the enriched agents to the
     * Body-side pure map (`createFleetCockpitStatus` — which never imports `ai/graph` or the Brain
     * launch seam; the hemisphere boundary holds, the Body only hoists what arrives stamped).
     *
     * Rides the authenticated `registryBridge` as a **read** verb; it carries NO lifecycle-write /
     * restart authority (the R3 read-observe ÷ lifecycle-write seam). An agent without an identity
     * root resolves to null display facts — rendered unclassified / tagless, never guessed. Activity
     * stays on its own {@link #fleetActivity} verb; this DTO's activity capability is declared
     * accordingly rather than duplicated.
     * @returns {Object} the serializable cockpit DTO `{sources, capabilities, rows, events}`.
     */
    async fleetRoster() {
        const
            me       = this,
            registry = me.getRegistry(),
            manager  = me.getManager(),
            resolve  = me.getIdentityResolver();

        const agents = (registry.listAgents() ?? []).map(agent => ({
            ...agent,
            ...resolve(agent.githubUsername ?? agent.id),
            launchable: LAUNCHABLE_HARNESS_TYPES.includes(agent.harnessType),
            authMode  : getHarnessAuthMode(agent.harnessType)
        }));

        // The S2 telltale axes join the roster here: each producer snapshot becomes per-row state +
        // one capability. Fail-honest end to end: an un-injected producer — or a manager seam
        // without the producer method at all — yields not-wired/unknown, never a guessed state.
        // Read concurrently: the axes share no state, so serializing them would just add the
        // slower one's latency to every roster read.
        const [wake, throttle] = await Promise.all([
            manager.fleetWakeStatus?.()     ?? null,
            manager.fleetThrottleStatus?.() ?? null
        ]);

        return createFleetCockpitStatus({
            agents,
            fleetStatus   : manager.fleetRepoStatus() ?? [],
            runtimeStatus : manager.fleetRuntimeStatus() ?? [],
            wakeStatus    : wake?.states ?? [],
            throttleStatus: throttle?.states ?? [],
            capabilities  : {
                activity: createNotWiredCapability(FLEET_COCKPIT_SOURCES.activity, 'activity rides the dedicated fleetActivity verb'),
                runtime : {
                    source    : FLEET_COCKPIT_SOURCES.runtime,
                    state     : 'wired',
                    confidence: 'observed'
                },
                wake    : wake?.capability     ?? createNotWiredCapability(FLEET_COCKPIT_SOURCES.wake, 'wake-state producer not wired'),
                throttle: throttle?.capability ?? createNotWiredCapability(FLEET_COCKPIT_SOURCES.throttle, 'throttle-state producer not wired')
            }
        });
    }
}

export default Neo.setupClass(FleetControlBridge);
