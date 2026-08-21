import path                            from 'path';
import aiConfig                        from '../../mcp/server/memory-core/config.mjs';
import logger                          from '../../mcp/server/memory-core/logger.mjs';
import Base                            from '../../../src/core/Base.mjs';
import CoreDatabase                    from '../../../ai/graph/Database.mjs';
import SQLite                          from '../../../ai/graph/storage/SQLite.mjs';
import { IDENTITIES }                  from '../../../ai/graph/identityRoots.mjs';
import {createGraphBootSeedManifest}   from '../../../ai/graph/bootSeedManifest.mjs';
import {createGraphBootSeedNodeRecord} from '../../../ai/graph/bootSeedManifest.mjs';
import {getGraphBootSeedNodeSpec}      from '../../../ai/graph/bootSeedManifest.mjs';
import { normalizeUserId }             from '../../mcp/server/shared/services/RequestContextService.mjs';
import fsExtra                         from 'fs-extra';
import {isDeepStrictEqual}             from 'node:util';
import {projectNode}                   from './nodeProjection.mjs';

/**
 * Row-level-security visibility predicate for an in-memory graph **node or edge**, mirroring
 * the SQL RLS clause that `SQLite.loadNodeVicinitySync` / `searchNodes` apply to BOTH the
 * `Nodes` and `Edges` tables. Applied at the public read return boundary because the
 * node/edge Stores are a process-wide cache, so an entity warmed by one requester's
 * RLS-filtered lazy-load is otherwise readable by any other requester straight from the cache.
 * Edges carry their own `properties.userId` (server-stamped), so a private edge between two
 * otherwise-visible nodes is a distinct leak surface from the nodes themselves.
 * @param {Object|null} entity A graph node or edge (Record or plain object) from an in-memory Store.
 * @param {String|null} requesterUserId The acting agent-identity node id, or null.
 * @returns {Boolean} true when the entity is visible to the requester.
 */
function isRlsVisible(entity, requesterUserId) {
    if (!entity) {
        return false;
    }

    const properties  = (entity.isRecord ? entity.get('properties') : entity.properties) || {},
          ownerUserId = properties.userId;

    // Compare canonical-to-canonical: the stored owner key (`properties.userId`) exists in BOTH the
    // `@`-prefixed (getAgentIdentityNodeId) and normalized (normalizeUserId(getUserId)) forms across
    // node types, while `requesterUserId` is resolved canonically (resolveRlsUserId). Normalizing the
    // owner key here matches an agent's OWN nodes regardless of which form they were stored in, and
    // never widens across tenants (distinct tenants normalize to distinct ids).
    return ownerUserId == null                              ||
           normalizeUserId(ownerUserId) === requesterUserId ||
           properties.sharedEntity === 1                    ||
           properties.sharedEntity === true                 ||
           properties.visibility === 'team';
}

/**
 * Resolves the canonical (normalized, no-`@`) RLS tenant key for the acting request. The isolation
 * key is the userId (`RequestContextService.getUserId`); `getAgentIdentityNodeId` is an `@`-prefixed
 * node id explicitly NOT for isolation, used only as a fallback when no userId is bound. Returning the
 * normalized form lets the RLS predicate match an owner's own nodes regardless of the (historically
 * inconsistent) stored `user_id` form.
 *
 * Namespace-disjointness invariant (per Grace's identity-boundary review): the only id this collapses
 * is `@X`↔`X` (one agent's two stamping forms). It therefore assumes tenant userIds and agent
 * identities occupy DISJOINT namespaces — a tenant userId equal to an agent identity sans-`@` (e.g.
 * tenant `neo-opus-grace` vs agent `@neo-opus-grace`) would normalize-collide and cross the boundary.
 * This holds today (tenant ids are gitlab / SHARED_USER_ID-shaped, never `@neo-*`).
 * @param {Object|null|undefined} rcs The request-bound RequestContextService.
 * @returns {String|null} Normalized userId, or null when no identity is bound.
 */
function resolveRlsUserId(rcs) {
    const raw = rcs?.getUserId?.() ?? rcs?.getAgentIdentityNodeId?.() ?? null;
    return raw == null ? null : normalizeUserId(raw);
}

/**
 * Validates the Native Edge Graph node-id contract before writes/deletes reach
 * the lower Store layer, where `null` otherwise looks object-like.
 * @param {*} id Candidate graph node id.
 * @returns {Boolean} true for non-empty string ids.
 */
function isValidGraphNodeId(id) {
    return typeof id === 'string' && id.length > 0;
}

export const PROTECTED_EDGE_TYPES = Object.freeze([
    'ADVANCED_BY',   // business layer: goal→work advancement is history, never scent; zombie-priority is handled by explicit retirement reweight (ai/graph/businessSchema.mjs), not decay
    'ATTRIBUTED_TO', // direction layer: motion→direction attribution is measurement substrate — a velocity number built on decaying edges rots invisibly; fact-class per the direction contract (ai/graph/directionSchema.mjs)
    'DELIVERED_TO',  // mailbox layer: per-recipient broadcast read/archive carrier — readAt/archivedAt live ON this edge (ai/services/memory-core/MailboxService.mjs markRead/archive); pruning it resurfaces read messages as unread
    'SENT_TO',       // mailbox layer: recipiency authorization — markRead/archive resolve "is this mine?" by walking it; deletion erases who a message was for, which never becomes less true with age
    'SENT_BY',       // mailbox layer: sender provenance — record, not scent; the decay floor sits below the prune threshold, so an unprotected carrier is a countdown, not an equilibrium
    'IMPLEMENTS',
    'EXTENDS',
    'SYSTEM_TENET',
    'RESOLVES'
]);
const PROTECTED_EDGE_TYPE_SET = new Set(PROTECTED_EDGE_TYPES);

/**
 * @summary Service that manages the SQLite Knowledge Graph (Nodes and Edges).
 *
 * It provides the topological layout of the Neo.mjs namespace, knowledge,
 * and history structurally mapping against semantic ChromaDB queries.
 *
 * @class Neo.ai.services.memory-core.GraphService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.GraphService'
         */
        className: 'Neo.ai.services.memory-core.GraphService',
        /**
         * @member {Object|null} db=null
         */
        db: null,
        /**
         * @member {Object|null} graphInitError=null
         */
        graphInitError: null,
        /**
         * @member {Boolean} singleton=true
         */
        singleton: true
    }

    /**
     * @summary Completes construction WITHOUT touching the database.
     *
     * `core.Base` schedules `initAsync()` unconditionally from every constructor, and this class is
     * a `singleton`, so `Neo.setupClass` constructs it during module evaluation. Mounting storage
     * here therefore meant that *importing* the Brain barrel opened the graph — a native module
     * load, a `mkdir`, a SQLite handle and a WAL writer — in every process that touched
     * `ai/services.mjs`, whether or not it ever read a node.
     */
    async initAsync() {
        await super.initAsync()
    }

    /**
     * @summary Mounts the graph on first readiness await, then memoizes.
     *
     * The open moves here rather than disappearing, because ~20 call sites already treat
     * `await GraphService.ready()` as "the graph is usable" and would otherwise be handed a null
     * database. Deferring to `ready()` keeps that contract exactly and only changes *when* the cost
     * is paid: a process that imports the barrel without awaiting readiness never opens the file.
     * @returns {Promise<void>}
     */
    async ready() {
        await super.ready();
        await this.mountGraph()
    }

    /**
     * @summary Opens the SQLite database and native edge structures, once.
     *
     * Split out of `initAsync()` verbatim so the mount sequence stays one reviewable unit. The
     * `_initPromise` guard is the memoization: concurrent `ready()` awaits share one mount, and a
     * mount that already failed is not retried — `graphInitError` stays the record of why.
     * @returns {Promise<void>}
     */
    async mountGraph() {
        if (this.db || this._initPromise) {
            if (this._initPromise) {
                await this._initPromise;
            }
            return;
        }

        this._initPromise = (async () => {
            try {
                const dbPath  = aiConfig.storagePaths.graph;
                let   storage = Neo.create(SQLite, {dbPath: dbPath});
                await storage.ready();

                let memoryCoreGraph = Neo.get ? Neo.get('memory-core-graph') : Neo.idMap?.['memory-core-graph'];
                if (memoryCoreGraph) {
                    this.db         = memoryCoreGraph;
                    this.db.storage = storage;
                } else {
                    this.db = Neo.create(CoreDatabase, {
                        id     : 'memory-core-graph',
                        storage: storage
                    });
                }

                await storage.load();
                this.graphInitError = null;

                // One enumerable manifest is shared by ordinary boot and the exact
                // restore-empty-target freshness proof. Boot remains additive-only:
                // missing records are provisioned, existing records are never replayed
                // from a potentially stale process-local registry.
                try {
                    this.provisionMissingBootSeeds();
                } catch (error) {
                    logger.warn(`[GraphService] Non-fatal DB contention during canonical boot-seed provisioning: ${error.message}`);
                }

                logger.log('[GraphService] SQLite database mounted securely via ai.graph.Database.');
            } catch (error) {
                this.db = null;
                this.graphInitError = {
                    message: error.message,
                    name   : error.name
                };
                logger.warn(`[GraphService] SQLite graph unavailable during init (degraded, graph-backed tools may fail): ${error.message}`);
            }
        })();

        await this._initPromise;
    }

    /**
     * @summary Provisions every missing record from the canonical graph boot-seed
     * manifest without rewriting an existing node or edge.
     *
     * The explicit edge-existence check is load-bearing: calling `linkNodes` on
     * every boot increments an existing edge's weight, which would make a
     * deterministic fresh graph cease to match its own boot fingerprint after
     * the second process start.
     *
     * @param {Object} [manifest=createGraphBootSeedManifest()] Enumerable seed manifest.
     * @returns {{nodesCreated: Number, edgesCreated: Number}}
     */
    provisionMissingBootSeeds(manifest = createGraphBootSeedManifest()) {
        let nodesCreated = 0,
            edgesCreated = 0;

        for (const node of manifest.nodes) {
            this.db.getAdjacentNodes(node.id, 'both');

            if (!this.db.nodes.has(node.id)) {
                this.upsertGlobalNode(node);
                nodesCreated++;
            }
        }

        const storageDb = this.db?.storage?.db;
        if (!storageDb) {
            throw new Error('provisionMissingBootSeeds: graph storage database is required')
        }

        const findEdge = storageDb.prepare(`
            SELECT id
            FROM Edges
            WHERE source = ? AND target = ? AND type = ?
            LIMIT 1
        `);

        for (const edge of manifest.edges) {
            if (!findEdge.get(edge.source, edge.target, edge.type)) {
                this.linkGlobalNodes(edge.source, edge.target, edge.type, edge.weight);
                edgesCreated++;
            }
        }

        return {nodesCreated, edgesCreated}
    }

    /**
     * @summary Add canonical AgentIdentity and BroadcastSentinel roots that are absent from the
     * mounted graph, without rewriting records already owned by the persisted projection.
     *
     * This is the ordinary-boot half of the identity write-authority split. Existing records may
     * contain a newer activation state, operator provenance, or runtime-added properties than the
     * process-local registry snapshot. Leaving them byte-stable prevents a stale MCP checkout from
     * making identity state last-boot-wins. Intentional registry updates remain the responsibility
     * of `ai/scripts/setup/seedAgentIdentities.mjs`.
     * @param {Object[]} [identities=IDENTITIES] Canonical roots to provision when missing.
     * @returns {Number} Number of roots created during this pass.
     */
    provisionMissingIdentityRoots(identities = IDENTITIES) {
        let created = 0;

        for (const identity of identities) {
            // Trigger the cache-coherent SQLite lazy load before deciding the root is absent.
            this.db.getAdjacentNodes(identity.id, 'both');

            if (!this.db.nodes.has(identity.id)) {
                this.upsertGlobalNode(identity);
                created++;
            }
        }

        return created;
    }

    /**
     * Builds the canonical degraded-graph error surfaced by graph-backed Memory Core tools.
     * @param {String} surface Consumer surface reporting the unavailable graph.
     * @returns {Error}
     */
    createUnavailableError(surface='GraphService') {
        const reason = this.graphInitError?.message || 'graph database is unavailable';
        return new Error(`[${surface}] GraphService unavailable: ${reason}`);
    }

    /**
     * @summary Returns the mounted graph database or throws the canonical degraded-graph error.
     *
     * WAL-only paths such as `add_memory` must stay callable during graph startup degradation, but
     * graph-backed tool paths must fail closed with a stable error instead of leaking `TypeError`
     * from a `null` database dereference.
     * @param {String} surface Consumer surface requiring the graph.
     * @returns {Neo.ai.graph.Database}
     */
    requireDb(surface='GraphService') {
        if (!this.db) {
            throw this.createUnavailableError(surface);
        }

        return this.db;
    }

    /**
     * Upserts a Node representation into the graph securely linking the ID.
     * @important The `type` string is mapped directly to `node.label` to comply with strict Graph Database taxonomy (Node Labels).
     * @param {Object} nodeData
     */
    upsertNode({id, type, name, description, semanticVectorId, state, updatedAt, properties}) {
        if (!isValidGraphNodeId(id)) {
            throw new Error(`[GraphService] Cannot upsert graph node without a non-empty string id. Received: ${String(id)}`);
        }

        // Lazy-load from SQLite before in-memory check — prevents cold-cache stubs from
        // overwriting rich SQLite rows via addNodes' ON CONFLICT DO UPDATE semantics.
        // Mirrors the read path's cache-warm discipline before mutating cached records.
        this.db.getAdjacentNodes(id, 'both');

        let node = this.db.nodes.get(id);

        // Stamp the canonical normalized isolation key (mirrors the RLS read boundary) — never the @-form node id.
        let currentUserId = resolveRlsUserId(this.db.storage?.RequestContextService) ?? undefined;

        if (node) {
            const currentLabel = node.isRecord ? node.get('label') : node.label;
            const updatedLabel = type || currentLabel || 'NODE';

            if (node.isRecord) {
                node.set({ label: updatedLabel });
            } else {
                node.label = updatedLabel;
            }

            const currentProperties = node.isRecord ? node.get('properties') : node.properties;
            let   p                 = Object.assign({}, currentProperties || {});
            if (name !== undefined) {
                p.name = name;
            }
            if (description !== undefined) {
                p.description = description;
            }
            if (semanticVectorId !== undefined) {
                p.semanticVectorId = semanticVectorId;
            }
            if (state !== undefined) {
                p.state = state;
            }
            if (updatedAt !== undefined) {
                p.updatedAt = updatedAt;
            }

            if (properties !== undefined && typeof properties === 'object') {
                Object.assign(p, properties);
            }

            if (currentUserId !== undefined && p.userId === undefined) {
                p.userId = currentUserId;
            }

            if (node.isRecord) {
                node.set({ properties: p });
            } else {
                node.properties = p;
            }

            // Directly commit delta to SQLite since Store.update does not exist
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addNodes([node]);
                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        } else {
            let p = {
                name       : name || id,
                description: description || '',
                semanticVectorId,
                state,
                updatedAt,
                ...(properties || {})
            };

            if (currentUserId !== undefined && p.userId === undefined) {
                p.userId = currentUserId;
            }

            this.db.addNode({
                id,
                label     : type || 'NODE',
                properties: p
            });
            // logger.debug(`Successfully added node to Database RAM: ${id}`);
        }
    }

    /**
     * Upserts a globally-visible system node, forcing `userId: null` so it stays
     * reachable to every tenant under RLS regardless of which boot harness creates
     * it first. Plain {@link GraphService#upsertNode} stamps the active request's
     * bound identity, which would isolate these shared sentinels (`frontier`, the
     * `Neo-Master-Architecture` primer, `_SYSTEM_STATE`, and the identity roots) to
     * a single tenant — they would then vanish from the graph for all others.
     * @param {Object} spec See {@link GraphService#upsertNode}; `properties.userId`
     * is forced to `null`.
     */
    upsertGlobalNode(spec) {
        this.upsertNode({...spec, properties: {...spec.properties, userId: null}});
    }

    /**
     * Guarantees one fixed boot-seed node is **manifest-declared-field compliant and global**,
     * restoring or repairing it from the canonical {@link module:ai/graph/bootSeedManifest}
     * declaration rather than a hand-written copy, and reporting loudly when it had to heal.
     *
     * Deliberately NOT "manifest-equal": the open contract below preserves undeclared runtime
     * fields, so a repaired row can carry a legacy `semanticVectorId: null` that makes the
     * full-manifest fingerprint predicate (`evaluateGraphBootSeedFreshness`) report `fresh: false`.
     * That predicate is the authority on whole-graph freshness and is intentionally untouched
     * here; this method's guarantee is narrower and must not be described in its terms.
     *
     * @summary Anchor & Echo: `linkNodes` culls an edge whose endpoint does not exist and
     * returns no error, so a caller that names a shared hub (`frontier`) loses its write in
     * silence when the hub is missing. Callers therefore ensure the hub before linking — via
     * this method, never by declaring the spec locally. Two prior copies of the `frontier`
     * spec had already drifted in description AND tenancy: one used plain
     * {@link GraphService#upsertNode}, which stamps the caller's identity and produces the
     * per-tenant invisibility this class's own {@link GraphService#upsertGlobalNode} docs warn
     * about. Healing is deliberately noisy: an absent boot seed means boot or fresh-target
     * recovery left the persisted graph non-manifest-equal, which is a defect to fix at the
     * boot path, not a condition to paper over on every read.
     *
     * The SQLite warm-read mirrors {@link GraphService#upsertNode}'s cold-cache discipline —
     * without it a node present on disk but absent from the in-memory map would be re-upserted
     * from the manifest stub, overwriting a richer persisted row and emitting a false warning.
     *
     * @param {String} id Fixed boot-seed node id, e.g. `'frontier'`.
     * @returns {Boolean} `true` **iff a write occurred** — the row was absent and restored, OR
     * present and repaired. `false` when the existing row already complied and nothing was written.
     * Callers may surface the `true` case; none should depend on it.
     */
    ensureGlobalBootSeedNode(id) {
        // Resolve the spec BEFORE any early return. An unrelated row already sitting under an
        // unknown id must not let the caller skip the fail-loud unknown-id contract.
        const record = createGraphBootSeedNodeRecord(getGraphBootSeedNodeSpec(id));

        // Lazy-load from SQLite before inspecting, for the reason upsertNode states.
        this.db.getAdjacentNodes(id, 'both');

        const existing  = this.db.nodes.get(id),
              divergent = existing ? this.#bootSeedDivergence(existing, record) : null;

        if (existing && !divergent) {
            return false
        }

        this.upsertGlobalNode(getGraphBootSeedNodeSpec(id));

        logger.warn(
            existing
                ? `[GraphService] boot-seed node "${id}" existed but violated its manifest invariants ` +
                  `(${divergent}) and has been repaired. A pre-existing divergent row is usually a locally ` +
                  'declared copy: a tenant-stamped or drifted seed is invisible or non-manifest-equal to ' +
                  'other tenants. Note the failure is on the READ, not the write: linkNodes\' endpoint check is ' +
                  'RLS-blind, so those edges were written and then skipped by the structural-support read.'
                : `[GraphService] boot-seed node "${id}" was absent and has been restored from the canonical ` +
                  'manifest. Boot or fresh-target recovery left the persisted graph non-manifest-equal — fix ' +
                  'the boot path. Until then any edge naming this hub was silently culled by the FK guard.'
        );

        return true
    }

    /**
     * @summary Names the first boot-seed reconciliation invariant an existing row violates, or
     * `null` when the row already complies.
     *
     * **The reconciliation contract is OPEN, not closed, and that is deliberate.** A boot-seed
     * row is reconciled on two axes only:
     *
     * 1. **Tenancy** — `properties.userId` MUST be `null`. This is the load-bearing invariant:
     *    it is what makes the row readable by tenants other than its creator. A tenant-stamped
     *    seed is present-but-invisible to everyone else, and note that the write path cannot
     *    detect that — `linkNodes`' endpoint check is `SELECT count(*) FROM Nodes WHERE id IN (?, ?)`,
     *    which is RLS-blind, so the edge is written and the loss appears later on the READ path.
     * 2. **Canonical declared fields** — `label` plus every property the manifest itself declares
     *    for this seed, compared against `createGraphBootSeedNodeRecord`'s projection rather than
     *    a hand-listed field set, so the check cannot drift from the manifest's persisted shape.
     *
     * Properties the manifest does NOT declare are **runtime-owned and preserved untouched**:
     * `semanticVectorId`, `state` and `updatedAt` are written by embedding and lifecycle paths, and
     * a populated `semanticVectorId` is legitimate enrichment rather than drift. Reconciliation
     * therefore never asserts on them and never removes them — which is also the honest contract,
     * because {@link GraphService#upsertNode} MERGES (`Object.assign` over current properties and
     * overwrite only what is defined), so a repair physically cannot strip an undeclared leftover.
     * A stale `semanticVectorId: null` from an older local declaration survives repair by design;
     * it is inert, and claiming otherwise would be a promise the write path cannot keep.
     *
     * @param {Object} existing Persisted node record.
     * @param {Object} record Canonical projection from the boot-seed manifest.
     * @returns {String|null} Human-readable violation, or `null` when compliant.
     * @private
     */
    #bootSeedDivergence(existing, record) {
        const properties = existing.properties || {};

        if (properties.userId !== null) {
            return `userId is ${JSON.stringify(properties.userId ?? null)}, expected null (global)`
        }

        if (existing.label !== record.label) {
            return `label is ${JSON.stringify(existing.label)}, expected ${JSON.stringify(record.label)}`
        }

        // Declared fields only. Undeclared keys are runtime-owned; see the contract above.
        for (const [key, expected] of Object.entries(record.properties)) {
            if (key !== 'userId' && properties[key] !== expected) {
                return `${key} is ${JSON.stringify(properties[key])}, expected ${JSON.stringify(expected)}`
            }
        }

        return null
    }

    /**
     * Links two globally-visible system nodes, forcing the edge's `userId: null` so the
     * **connection itself** stays visible to every tenant under RLS. {@link GraphService#getContextFrontier}
     * and {@link GraphService#getNeighbors} / {@link GraphService#queryNodeTopology} require BOTH the node
     * AND the edge to be RLS-visible, so a global sentinel reached only through a tenant-stamped edge
     * (the default {@link GraphService#linkNodes} stamps the active request's identity) would still vanish
     * from topology traversal for non-booting tenants — even when {@link GraphService#upsertGlobalNode}
     * already made the node itself global.
     * @param {String} source
     * @param {String} target
     * @param {String} relationship
     * @param {Number} [weight=1.0]
     */
    linkGlobalNodes(source, target, relationship, weight = 1.0) {
        this.linkNodes(source, target, relationship, weight, {userId: null});
    }

    /**
     * Creates a structural relation exactly once and reports verification without reinforcing
     * an existing edge.
     *
     * @summary This is the write-idempotent counterpart to {@link GraphService#linkNodes}.
     * Structural projectors repeatedly assert topology that is already authoritative; routing
     * those assertions through `linkNodes` would increase weight, execute `UPDATE Edges`, and
     * append a false GraphLog invalidation on every verification pass. The creation weight is
     * therefore deliberately NOT an equivalence invariant: an existing edge may carry legitimate
     * or historical reinforcement and must remain byte-stable.
     *
     * Caller-declared `properties` ARE structural invariants. A mismatch is returned as
     * `drifted` with the divergent keys and is never silently rewritten or reinforced. Missing
     * endpoints retain `linkNodes`' cache-warm/cull posture. The operation owns one atomic graph
     * transaction and rejects an outer transaction rather than pretending that SQLite alone can
     * represent its queued node/edge additions and removals. The table still has no unique
     * `(source, target, type)` constraint, so this method does not claim cross-process exactly-once
     * creation.
     *
     * @param {String} source Source node id.
     * @param {String} target Target node id.
     * @param {String} relationship Edge type.
     * @param {Number} [weight=1.0] Initial weight used only when the edge is created.
     * @param {Object} [properties={}] Structural properties that must match when already present.
     * @returns {{status: ('unavailable'|'drifted'|'verified'|'culled'|'created'), divergentKeys: (String[]|undefined)}}
     * @throws {Error} When called inside an existing Graph Database transaction.
     */
    ensureStructuralEdge(source, target, relationship, weight = 1.0, properties = {}) {
        if (!this.db?.storage?.db) {
            return {status: 'unavailable'}
        }

        if (this.db.isExecutingTransaction) {
            throw new Error('ensureStructuralEdge owns its transaction and cannot run inside another Graph Database transaction')
        }

        const
            findEdges = this.db.storage.db.prepare(`
                SELECT id, user_id, data
                FROM Edges
                WHERE source = ?
                  AND target = ?
                  AND type = ?
            `),
            findCachedEdges = () => this.db.edges.getByIndex('source', source)
                .filter(edge => edge.target === target && edge.type === relationship),
            reconcileCachedTuple = persistedEdges => {
                const persistedEdgeIds = new Set(persistedEdges.map(edge => edge.id));
                const staleEdges       = findCachedEdges()
                    .filter(edge => !persistedEdgeIds.has(edge.id));

                if (staleEdges.length === 0) return

                const wasAutoSave = this.db.autoSave;
                this.db.autoSave = false;

                try {
                    this.db.edges.remove(staleEdges.map(edge => edge.id));
                    // Store.remove() clears the current map records. Also remove exact stale
                    // references that a prior refresh may have left in secondary index Sets.
                    this.db.edges.updateIndexMaps?.(null, staleEdges)
                } finally {
                    this.db.autoSave = wasAutoSave
                }
            },
            expectedUserId = properties.userId === undefined
                ? resolveRlsUserId(this.db.storage?.RequestContextService) ?? null
                : properties.userId == null ? null : normalizeUserId(properties.userId),
            classifyExisting = existing => {
                const
                    existingProperties = existing.data
                        ? JSON.parse(existing.data)?.properties || {}
                        : existing.get?.('properties') || existing.properties || {},
                    existingUserId = existing.user_id === undefined
                        ? existingProperties.userId == null ? null : normalizeUserId(existingProperties.userId)
                        : existing.user_id == null ? null : normalizeUserId(existing.user_id),
                    existingJsonUserId = existingProperties.userId == null
                        ? null
                        : normalizeUserId(existingProperties.userId),
                    structuralProperties = {...properties};

                // Weight is creation-time topology metadata, not a verification invariant. Preserve
                // any intentional or historical reinforcement instead of normalizing it back to 1.
                delete structuralProperties.weight;
                delete structuralProperties.userId;

                const divergentKeys = Object.entries(structuralProperties)
                    .filter(([key, value]) => !isDeepStrictEqual(existingProperties[key], value))
                    .map(([key]) => key);

                // SQL `user_id` is the RLS authority. JSON historically omitted `userId` for a
                // global edge, so missing and null are equivalent; a present divergent value is not.
                if ((existingUserId !== expectedUserId || existingJsonUserId !== expectedUserId)
                    && !divergentKeys.includes('userId')) {
                    divergentKeys.push('userId')
                }

                return divergentKeys.length > 0
                    ? {status: 'drifted', divergentKeys}
                    : {status: 'verified'}
            },
            findCurrentEdges = () => findEdges.all(source, target, relationship),
            cachedBeforeSync = findCachedEdges();

        // An absent persisted tuple makes any same-tuple RAM record stale. Consume pending peer
        // invalidations before the local transaction can acknowledge beyond them, then reconcile
        // any orphaned cache record that predates the retained GraphLog window.
        let persistedEdges = findCurrentEdges();

        if (persistedEdges.length === 0 && cachedBeforeSync.length > 0) {
            this.db.syncCache()
            persistedEdges = findCurrentEdges()
        }

        const existing = persistedEdges[0];
        reconcileCachedTuple(persistedEdges);

        if (existing) return classifyExisting(existing);

        let outcome;

        const createIfStillAbsent = () => {
            const concurrent = findCurrentEdges()[0];
            if (concurrent) {
                outcome = classifyExisting(concurrent);
                return
            }

            const
                endpointCount = this.db.storage.db.prepare(
                    'SELECT count(*) AS count FROM Nodes WHERE id IN (?, ?)'
                ).get(source, target).count,
                expectedCount = source === target ? 1 : 2;

            if (endpointCount !== expectedCount) {
                // Preserve linkNodes' cache-warm/cull behavior without ever invoking its
                // reinforcing existing-edge branch.
                this.db.getAdjacentNodes?.(source, 'both');
                this.db.getAdjacentNodes?.(target, 'both');

                const warmedCount = this.db.storage.db.prepare(
                    'SELECT count(*) AS count FROM Nodes WHERE id IN (?, ?)'
                ).get(source, target).count;

                if (warmedCount !== expectedCount) {
                    logger.warn(`[GraphService] Culling hallucinated structural edge mapping: ${source} -> ${target} (count was ${warmedCount})`);
                    outcome = {status: 'culled'};
                    return
                }
            }

            const edge = {
                id        : globalThis.crypto.randomUUID(),
                source,
                target,
                type      : relationship,
                properties: {weight, ...properties, userId: expectedUserId}
            };

            this.db.addEdge(edge);
            outcome = {status: 'created'}
        };

        this.db.transaction(createIfStillAbsent);
        reconcileCachedTuple(findCurrentEdges());

        return outcome
    }

    /**
     * Links two nodes via a relationship tracking edge weight metadata.
     *
     * @summary Creates an edge between two nodes. This method executes as an atomic transaction
     * (if not already inside one) to prevent race conditions during SQLite WAL flushes. It also
     * features a cache-warm retry mechanism on FK verify miss to account for WAL-snapshot-lag
     * from other processes.
     *
     * @description
     * **Transaction Overhead:** Future callers should be aware that invoking `linkNodes` rapidly
     * in a hot path incurs SQLite transaction overhead.
     * **WAL Snapshot Lag:** If a peer process writes a node, the current connection's snapshot
     * might lack it temporarily. This method automatically attempts to warm the cache and retry
     * the FK verification before culling the edge.
     *
     * @param {String} source
     * @param {String} target
     * @param {String} relationship
     * @param {Number} weight
     * @param {Object} [properties={}] Additional edge metadata (e.g. justification, context_source).
     * @see {@link GraphService#ensureStructuralEdge} for asserted topology that must not reinforce
     *     an equivalent existing relation.
     */
    linkNodes(source, target, relationship, weight = 1.0, properties = {}) {
        if (!this.db?.storage?.db) {
            return;
        } // Safe guard for SQLite backend

        const executeLink = () => {
            // Enforce Foreign Key constraints preemptively to prevent SQLite crash from hallucinated paths
            const verifyStmt = this.db.storage.db.prepare('SELECT count(*) as count FROM Nodes WHERE id IN (?, ?)');
            let   count      = verifyStmt.get(source, target).count;

            let expectedCount = source === target ? 1 : 2;

            if (count !== expectedCount) {
                // Cache-warm retry: If the count check fails, the node might exist in the SQLite WAL
                // from another agent but hasn't been synced to this connection's snapshot yet.
                // We force a cache warm (which invokes syncCache and WAL read) and re-verify.
                if (this.db && typeof this.db.getAdjacentNodes === 'function') {
                    // Ensure we attempt to warm both endpoints in case either is the missing link
                    this.db.getAdjacentNodes(source, 'both');
                    this.db.getAdjacentNodes(target, 'both');

                    // Re-evaluate the count after forcing synchronization
                    count = verifyStmt.get(source, target).count;
                }
            }

            if (count !== expectedCount) {
                 logger.warn(`[GraphService] Culling hallucinated edge mapping: ${source} -> ${target} (count was ${count})`);
                 return;
            }

            const stmt = this.db.storage.db.prepare(`SELECT id, json_extract(data, '$.properties.weight') as weight
                                                         FROM Edges
                                                         WHERE source = ?
                                                           AND target = ?
                                                           AND type = ?`);
            const existing = stmt.get(source, target, relationship);

            // Stamp the canonical normalized isolation key (mirrors the RLS read boundary) — never the @-form node id.
            let currentUserId  = resolveRlsUserId(this.db.storage?.RequestContextService) ?? undefined;
            let edgeProperties = {weight, ...properties};
            if (currentUserId !== undefined && edgeProperties.userId === undefined) {
                edgeProperties.userId = currentUserId;
            }

            if (!existing) {
                this.db.addEdge({
                    id        : globalThis.crypto.randomUUID(),
                    source,
                    target,
                    type      : relationship,
                    properties: edgeProperties
                });
            } else {
                const currentWeight = parseFloat(existing.weight) || 1.0;
                const newWeight     = Math.min(currentWeight + (weight * 0.1), 5.0);

                // Fetch the entire current JSON to merge new properties natively
                const dataStmt = this.db.storage.db.prepare(`SELECT data FROM Edges WHERE id = ?`);
                const row      = dataStmt.get(existing.id);
                if (row && row.data) {
                    let parsed = JSON.parse(row.data);
                    parsed.properties = { ...(parsed.properties || {}), ...edgeProperties, weight: newWeight };

                    const updateStmt = this.db.storage.db.prepare(`UPDATE Edges SET data = ? WHERE id = ?`);
                    updateStmt.run(JSON.stringify(parsed), existing.id);
                }

                // Keep RAM cache functionally coherent if edge actively exists
                let ramEdge = this.db.edges.get(existing.id);
                if (ramEdge) {
                    if (ramEdge.isRecord) {
                        const newProps = { ...(ramEdge.get('properties') || {}), ...edgeProperties, weight: newWeight };
                        ramEdge.set({properties: newProps});
                    } else {
                        ramEdge.properties.weight = newWeight;
                        Object.assign(ramEdge.properties, edgeProperties);
                    }
                }

                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        };

        if (this.db.isExecutingTransaction) {
            executeLink();
        } else {
            this.db.transaction(executeLink);
        }
    }

    /**
     * Async variant of {@link GraphService#linkNodes linkNodes} that performs **lazy
     * back-fill** on missing endpoints before attempting the edge creation.
     *
     * Where the sync `linkNodes` silently culls edges whose source or target is absent from the
     * graph, this async path first attempts to materialize the missing endpoints from their
     * Chroma source rows via `MemorySessionIngestor.ingestSingleRow`. Back-fill applies only to
     * node IDs matching the `memory:<chromaId>` or `session:<sessionId>` prefix (case-insensitive
     * — consumes the uppercase-prefix convention used by queued lazy edges without requiring a
     * canonical-format migration). Unrecognized prefixes fall
     * through to the sync `linkNodes` cull behavior unchanged.
     *
     * **Why a separate method rather than making `linkNodes` async:** the sync `linkNodes` is
     * called from many synchronous code paths where adding an `await` would have wide blast
     * radius. Back-fill-aware callers such as `LazyEdgeDrainer`, mailbox `IN_REPLY_TO`, and
     * identity `AUTHORED_BY` edge creators use this async path; existing sync callers remain
     * unaffected.
     *
     * **Prefix normalization:** if either endpoint uses the uppercase `MEMORY:`/`SESSION:`
     * prefix, the back-filled node lands under the canonical lowercase ID and the edge is
     * created against the canonical form. Callers should expect the edge's actual source/target
     * in SQLite to be the normalized lowercase variant regardless of the input case.
     *
     * @param {String} source Source node ID
     * @param {String} target Target node ID
     * @param {String} relationship Edge type
     * @param {Number} [weight=1.0] Edge weight
     * @param {Object} [properties={}] Additional edge metadata
     * @returns {Promise<Boolean>} `true` if the edge was created or already existed; `false` if
     *     back-fill failed or the endpoints were unrecognized/unresolvable.
     */
    async linkNodesAsync(source, target, relationship, weight = 1.0, properties = {}) {
        if (!this.db?.storage?.db) {
            return false;
        }

        const
            normalizedSource = this.normalizeGraphNodeId(source),
            normalizedTarget = this.normalizeGraphNodeId(target);

        const
            sourceReady = await this.ensureNodeExists(normalizedSource),
            targetReady = await this.ensureNodeExists(normalizedTarget);

        if (!sourceReady || !targetReady) {
            logger.warn(`[GraphService] linkNodesAsync: endpoint resolution failed (source=${sourceReady}, target=${targetReady}) — ${normalizedSource} -> ${normalizedTarget}`);
            return false;
        }

        this.linkNodes(normalizedSource, normalizedTarget, relationship, weight, properties);
        return true;
    }

    /**
     * Ensures a graph node exists, attempting lazy back-fill from its Chroma source row if
     * absent. Used by `linkNodesAsync` and the `LazyEdgeDrainer` to resolve missing endpoints
     * before edge creation.
     *
     * Back-fill applies only to the `memory:` / `session:` prefix pattern — nodes managed by
     * other substrates (concepts, classes, AgentIdentity, files) remain the responsibility of
     * their owning ingestor. Returns `false` for unrecognized-prefix IDs: callers treat that as
     * "genuine hallucination, cull" rather than "back-fill failed".
     *
     * **Dynamic import rationale:** `MemorySessionIngestor` imports `GraphService` via
     * `ai/services.mjs`, so a static import here would create a module-load cycle. The dynamic
     * import resolves at call-time, after both modules have finished their top-level evaluation.
     *
     * @param {String} graphNodeId Canonical-form graph node ID to resolve
     * @returns {Promise<Boolean>} `true` if the node now exists (was present or was successfully
     *     back-filled); `false` otherwise.
     */
    async ensureNodeExists(graphNodeId) {
        if (!this.db?.storage?.db || !graphNodeId) {
            return false;
        }

        if (this.db.nodes.has(graphNodeId)) {
            return true;
        }

        const {default: MemorySessionIngestor} = await import('../../services/ingestion/MemorySessionIngestor.mjs');
        const result                           = await MemorySessionIngestor.ingestSingleRow(graphNodeId);

        if (!result.success) {
            if (result.reason !== 'unrecognized-prefix') {
                logger.warn(`[GraphService] ensureNodeExists: back-fill failed for ${graphNodeId} — ${result.reason}${result.error ? ' (' + result.error + ')' : ''}`);
            }
            return false;
        }

        return this.db.nodes.has(result.graphNodeId || graphNodeId);
    }

    /**
     * Normalizes a graph node ID's prefix to its canonical lowercase form. Non-`memory:` /
     * non-`session:` IDs pass through unchanged. Used by `linkNodesAsync` to accept edges
     * queued with the uppercase `MEMORY:`/`SESSION:` convention without polluting the
     * graph with case-variant duplicate nodes.
     *
     * @param {String} id Raw graph node ID
     * @returns {String} Normalized ID (lowercase prefix when recognized, unchanged otherwise)
     */
    normalizeGraphNodeId(id) {
        if (!id || typeof id !== 'string') {
            return id;
        }

        const lower = id.toLowerCase();

        if (lower.startsWith('memory:')) {
            return 'memory:' + id.slice(7);
        }

        if (lower.startsWith('session:')) {
            return 'session:' + id.slice(8);
        }

        return id;
    }

    /**
     * Applies geometric weight decay mapping to existing graph relationships over time.
     * Enforces a 24-hour algorithmic lock to prevent amnesia under high execution frequency.
     *
     * @param {Number} decayFactor
     * @param {Number} pruningThreshold
     * @param {Boolean} force Bypass the 24-hour lock (used strictly for manual forcing/tuning)
     */
    decayGlobalTopology(decayFactor = aiConfig.decayFactor, pruningThreshold = 0.2, force = false) {
        if (!this.db?.storage?.db) {
            return;
        }

        // Initialize or fetch the global _SYSTEM_STATE node for cycle tracking
        let systemNode = this.db.nodes.get('_SYSTEM_STATE');
        if (!systemNode) {
            this.upsertGlobalNode({
                id         : '_SYSTEM_STATE',
                type       : 'SYSTEM_CLOCK',
                name       : 'Global System Clock',
                description: 'Tracks algorithmic time intervals for global physics.'
            });
            systemNode = this.db.nodes.get('_SYSTEM_STATE');
        }

        const systemProperties = systemNode.isRecord ? systemNode.get('properties') : systemNode.properties;
        const lastDecayedAt    = systemProperties?.lastDecayedAt || 0;
        const now              = Date.now();
        const hoursElapsed     = (now - lastDecayedAt) / 3600000;

        // 24-hour Algorithmic Lock
        if (!force && hoursElapsed < 24) {
            logger.info(`[GraphService] Skipping global topology decay (Algorithmic Lock: only ${hoursElapsed.toFixed(1)}h elapsed).`);
            return;
        }

        logger.info(`[GraphService] Running ambient topology decay (factor: ${decayFactor})...`);

        const protectedEdgePlaceholders = PROTECTED_EDGE_TYPES.map(() => '?').join(', ');

        // Shield durable structural/provenance edges completely from decay and pruning.
        const decayStmt = this.db.storage.db.prepare(`
            UPDATE Edges
            SET data = json_set(data, '$.properties.weight',
                                MAX(COALESCE(CAST(json_extract(data, '$.properties.weight') AS REAL), 1.0) * ?, 0.1))
            WHERE type NOT IN (${protectedEdgePlaceholders})
        `);
        decayStmt.run(decayFactor, ...PROTECTED_EDGE_TYPES);

        // Prune dead pathways permanently mapping via physical SQL
        const pruneStmt = this.db.storage.db.prepare(`
            DELETE
            FROM Edges
            WHERE type NOT IN (${protectedEdgePlaceholders})
              AND COALESCE(CAST(json_extract(data, '$.properties.weight') AS REAL), 1.0) < ?
        `);
        const info = pruneStmt.run(...PROTECTED_EDGE_TYPES, pruningThreshold);

        // The bulk SQL above bypasses Database's Store mutation path. Consume its SQLite-triggered
        // invalidation delta before the clock upsert acknowledges local mutations; otherwise the
        // acknowledgement advances lastSyncId past the changed edges and RAM keeps pre-decay weights.
        this.db.syncCache();

        // Commit global clock update
        this.upsertGlobalNode({
            id        : '_SYSTEM_STATE',
            type      : systemNode.isRecord ? systemNode.get('label') : systemNode.label,
            properties: {
                ...(systemProperties || {}),
                lastDecayedAt: now
            }
        });

        logger.info(`[GraphService] Ambient Decay complete. Pruned ${info.changes} dead pathways.`);
    }

    /**
     * Retrieves a specific node by its ID.
     *
     * The default `lean` projection hoists only the identity fields — the token-economy contract
     * roster-wide sweeps rely on. `projection: 'full'` returns the SAME shape plus the type's
     * PUBLIC FACT SET (e.g. the IdentitySchema facts on an AgentIdentity node), so a single node's
     * public facts are readable through the graph's own read verb.
     *
     * **The full projection is a field-level pick, never the raw bag** — the policy lives in the
     * pure {@link module:ai/services/memory-core/nodeProjection} module (hermetically witnessed):
     * graph-row RLS answers "may this row participate in the caller's graph?" — it is NOT field
     * authorization (the `MESSAGE` counterexample: shared row, mailbox-audience-gated body; the
     * auto-provision counterexample: a global AgentIdentity row carrying provider/auth/timing
     * metadata). Types without a public fact set answer the LEAN shape.
     * @param {Object} data
     * @param {String} data.id
     * @param {'lean'|'full'} [data.projection='lean'] `'full'` adds the type's public fact set to the lean shape.
     * @returns {Object|null}
     */
    getNode({id, projection = 'lean'}) {
        // Guarantee lazy-loading from SQLite triggers if not cached
        this.db.getAdjacentNodes(id, 'both');

        let node = this.db.nodes.get(id);
        if (!node) {
            return null;
        }

        // RLS: the node Store is a process-wide cache — re-check visibility at the
        // return boundary so a cross-requester cache-warmed node is not leaked.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);
        if (!isRlsVisible(node, rlsUserId)) {
            return null;
        }

        return projectNode({
            id        : node.isRecord ? node.get('id') : node.id,
            label     : node.isRecord ? node.get('label') : node.label,
            properties: node.isRecord ? node.get('properties') : node.properties
        }, projection);
    }

    /**
     * @summary Retrieves a node's full record — including the `properties` blob that {@link GraphService#getNode} strips.
     *
     * `getNode` projects only the hoisted fields (`id` / `type` / `name` / `description` / `semanticVectorId` /
     * `state`); a consumer that stores a structured payload under `properties` needs the raw
     * `properties` object. This getter applies the identical RLS visibility re-check as
     * `getNode` — a cross-tenant node returns `null` — so it is a
     * properties-returning read, not an RLS bypass.
     * @param {Object} data
     * @param {String} data.id Node id.
     * @returns {Object|null} `{id, type, properties}`, or `null` when the node is absent or RLS-invisible.
     */
    getNodeRecord({id}) {
        // Guarantee lazy-loading from SQLite triggers if not cached (mirrors getNode).
        this.db.getAdjacentNodes(id, 'both');

        const node = this.db.nodes.get(id);
        if (!node) {
            return null;
        }

        // RLS: the node Store is a process-wide cache — re-check visibility at the
        // return boundary so a cross-requester cache-warmed node is not leaked.
        const rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);
        if (!isRlsVisible(node, rlsUserId)) {
            return null;
        }

        return {
            id        : node.isRecord ? node.get('id') : node.id,
            type      : node.isRecord ? node.get('label') : node.label,
            properties: (node.isRecord ? node.get('properties') : node.properties) || {}
        };
    }

    /**
     * @summary The ONE sanctioned context-free node read, for background writers that run outside any request.
     *
     * Every RLS-scoped read ({@link GraphService#getNode}, {@link GraphService#getNodeRecord}) resolves its
     * requester from the request-bound `RequestContextService`. A background timer — a coalescing flush, a
     * delivery retry, a maintenance sweep — has no bound request, so `resolveRlsUserId` yields `null`, every
     * branch of the visibility predicate evaluates false, and the read returns `null` for a node that plainly
     * exists. The failure is silent and reads as absence: the caller concludes "no such node" and skips the
     * work it was scheduled to do — a dead wake route that can never be marked degraded re-runs its failing
     * delivery attempts on every subsequent message, forever.
     *
     * Consumers previously reached into `db.nodes.get` by hand to route around this, each with its own
     * explanatory comment. This is that bypass, named once, so it is greppable and reviewable instead of
     * arriving by copy-paste.
     *
     * **This is NOT an RLS bypass for request-scoped reads.** Calling it from a request path re-opens exactly
     * the cross-requester cache leak the return-boundary re-check exists to prevent. That misuse is not
     * mechanically preventable here, so it is made *visible*: a bound request context means the caller is on a
     * request path and should be using `getNodeRecord`, and the accessor logs a warning naming the writer.
     * @param {Object} data
     * @param {String} data.id     Node id.
     * @param {String} data.writer Name of the background writer, for the misuse warning and audit trails.
     * @returns {Object|null} `{id, type, properties}`, or `null` only when the node genuinely does not exist.
     */
    getUnscopedNodeRecord({id, writer}) {
        if (!writer) {
            throw new Error('[GraphService] getUnscopedNodeRecord requires a `writer` name identifying the background writer.');
        }

        // Guarantee lazy-loading from SQLite triggers if not cached (mirrors the RLS-scoped reads).
        this.db.getAdjacentNodes(id, 'both');

        const node = this.db.nodes.get(id);
        if (!node) {
            return null;
        }

        // Misuse tripwire: a resolvable requester means a request IS bound, so this caller is on a request
        // path and must use the RLS-scoped `getNodeRecord` instead. Warn rather than throw — a background
        // task can legitimately be kicked off during a request — but never let the misuse be silent.
        if (resolveRlsUserId(this.db.storage?.RequestContextService) !== null) {
            logger.warn(`[GraphService] getUnscopedNodeRecord called by '${writer}' inside a bound request context; use getNodeRecord on request paths.`);
        }

        return {
            id        : node.isRecord ? node.get('id') : node.id,
            type      : node.isRecord ? node.get('label') : node.label,
            properties: (node.isRecord ? node.get('properties') : node.properties) || {}
        };
    }

    /**
     * @summary Lists full node records of one graph type through the same RLS boundary as single-node reads.
     *
     * This is the sanctioned enumeration companion to {@link GraphService#getNodeRecord}. It keeps
     * type-level discovery under the graph service instead of forcing consumers to issue raw SQL or
     * iterate the process-wide node cache directly, and it re-applies the same visibility predicate at
     * the return boundary.
     * @param {Object} data
     * @param {String} data.type Node label/type to enumerate.
     * @param {String|null} [data.idPrefix=null] Optional id prefix filter.
     * @param {Number} [data.limit=500] Maximum records to return.
     * @returns {{records: Object[]}} Full `{id, type, properties}` records.
     */
    listNodeRecordsByType({type, idPrefix = null, limit = 500} = {}) {
        if (!Neo.isString(type) || type.length === 0) {
            throw new TypeError('GraphService.listNodeRecordsByType: type must be a non-empty string');
        }

        const
            max       = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 500,
            prefix    = Neo.isString(idPrefix) && idPrefix.length > 0 ? idPrefix : null,
            rlsUserId = resolveRlsUserId(this.db?.storage?.RequestContextService),
            toRecord  = node => {
                if (!node || !isRlsVisible(node, rlsUserId)) {
                    return null;
                }

                const
                    id         = node.isRecord ? node.get('id')         : node.id,
                    nodeType   = node.isRecord ? node.get('label')      : node.label,
                    properties = node.isRecord ? node.get('properties') : node.properties;

                if (nodeType !== type || (prefix && !id.startsWith(prefix))) {
                    return null;
                }

                return {id, type: nodeType, properties: properties || {}};
            };

        if (this.db?.storage?.db) {
            // Match searchNodes' SQL-level RLS filter, then re-check in-memory visibility below.
            const stmt = this.db.storage.db.prepare(`
                SELECT data FROM Nodes
                WHERE json_extract(data, '$.label') = ?
                  AND (? IS NULL OR substr(id, 1, ?) = ?)
                  AND (user_id = ?
                       OR user_id = ?
                       OR user_id IS NULL
                       OR json_extract(data, '$.properties.sharedEntity') = 1
                       OR json_extract(data, '$.properties.visibility') = 'team')
                ORDER BY id
                LIMIT ?
            `);

            const rows = stmt.all(type, prefix, prefix?.length || 0, prefix, rlsUserId, rlsUserId == null ? null : `@${rlsUserId}`, max);

            return {
                records: rows.map(row => toRecord(JSON.parse(row.data))).filter(Boolean)
            };
        }

        const nodes = Array.isArray(this.db?.nodes?.items) ? this.db.nodes.items : [];

        return {
            records: nodes
                .map(toRecord)
                .filter(Boolean)
                .sort((a, b) => a.id.localeCompare(b.id))
                .slice(0, max)
        };
    }

    /**
     * @summary Lists edge records of one or more relation types through the same RLS boundary as the
     * node enumerations.
     *
     * The edge-side companion to {@link GraphService#listNodeRecordsByType}. A foreign edge between two
     * otherwise-visible nodes is a distinct leak surface — it discloses both a relation and its
     * provenance — so type-level edge discovery belongs behind the same visibility predicate rather than
     * in a consumer's raw SQL. Filters at the SQL layer and re-checks each row at the return boundary,
     * matching the node enumeration.
     *
     * Truncation is reported, never silent: a caller that bounds a read cannot honestly describe the
     * result as the whole relation set, and a consumer that cannot see the cap would present a partial
     * topology as complete.
     * @param {Object} data
     * @param {String[]} data.types Relation types to enumerate; an empty list yields no records.
     * @param {Number} [data.limit=5000] Maximum records to return.
     * @returns {{records: Object[], truncated: Boolean}} `{source, target, type}` records, plus whether
     *   more matching edges existed than the bound allowed.
     */
    listEdgeRecordsByType({types, limit = 5000} = {}) {
        if (!Array.isArray(types) || types.some(type => !Neo.isString(type) || type.length === 0)) {
            throw new TypeError('GraphService.listEdgeRecordsByType: types must be an array of non-empty strings');
        }

        const
            max       = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5000,
            typeSet   = new Set(types),
            rlsUserId = resolveRlsUserId(this.db?.storage?.RequestContextService),
            toRecord  = edge => {
                if (!edge || !isRlsVisible(edge, rlsUserId)) {
                    return null;
                }

                const
                    source   = edge.isRecord ? edge.get('source') : edge.source,
                    target   = edge.isRecord ? edge.get('target') : edge.target,
                    edgeType = edge.isRecord ? edge.get('type')   : edge.type;

                return typeSet.has(edgeType) ? {source, target, type: edgeType} : null;
            };

        if (types.length === 0) {
            return {records: [], truncated: false};
        }

        // One row beyond the bound is read purely to detect the cap: the caller must be able to tell a
        // complete relation set from a clipped one.
        const probe = max + 1;

        if (this.db?.storage?.db) {
            const placeholders = types.map(() => '?').join(', ');

            // Match listNodeRecordsByType's SQL-level RLS filter, then re-check visibility below.
            const stmt = this.db.storage.db.prepare(`
                SELECT data FROM Edges
                WHERE type IN (${placeholders})
                  AND (user_id = ?
                       OR user_id = ?
                       OR user_id IS NULL
                       OR json_extract(data, '$.properties.sharedEntity') = 1
                       OR json_extract(data, '$.properties.visibility') = 'team')
                ORDER BY id
                LIMIT ?
            `);

            const rows    = stmt.all(...types, rlsUserId, rlsUserId == null ? null : `@${rlsUserId}`, probe),
                  records = rows.map(row => toRecord(JSON.parse(row.data))).filter(Boolean);

            return {records: records.slice(0, max), truncated: rows.length > max};
        }

        const edges   = Array.isArray(this.db?.edges?.items) ? this.db.edges.items : [],
              visible = edges.map(toRecord).filter(Boolean);

        return {records: visible.slice(0, max), truncated: visible.length > max};
    }

    /**
     * @summary Per-node RLS visibility for the acting request — the GraphService-owned seam the
     * concept-walk's `rlsPredicate` consumes so a private / other-tenant intermediate is never traversed
     * THROUGH (path-level Depth-Floor; terminal-candidate authorization does NOT authorize the crossed
     * path). Raw-reads the node's stored properties and applies the canonical `isRlsVisible` predicate
     * against the request's resolved RLS user. A missing node, absent db, or read error fails CLOSED.
     * @param {String} nodeId
     * @returns {Boolean} true when the node is visible to the acting requester.
     */
    isNodeVisibleToRequester(nodeId) {
        const storage = this.db?.storage;

        if (!storage?.db || !isValidGraphNodeId(nodeId)) {
            return false
        }

        let node;
        try {
            const row = storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(nodeId);
            node = row ? JSON.parse(row.data) : null
        } catch {
            return false
        }

        return isRlsVisible(node, resolveRlsUserId(storage.RequestContextService))
    }

    /**
     * @summary Per-EDGE RLS visibility for the acting request — the GraphService-owned seam the concept
     * walk's `edgeRlsPredicate` consumes. A foreign / other-tenant edge between two visible nodes is a
     * DISTINCT leak surface (relation + provenance), so it must never become a hop / parent / path, nor be
     * allowed to expand or hydrate a candidate: getNeighbors exposes a neighbor only when BOTH the node AND
     * the connecting edge pass isRlsVisible, but readRawNodeEdges reads raw rows and otherwise bypasses that
     * contract. Applies the canonical `isRlsVisible` policy to the already-read edge's properties (the same
     * source-of-truth predicate the node seam uses — no duplicated tenant logic). A null/absent edge fails
     * CLOSED.
     * @param {Object} edge A raw edge object carrying `.properties` (the shape readRawNodeEdges yields).
     * @returns {Boolean} true when the edge is visible to the acting requester.
     */
    isEdgeVisibleToRequester(edge) {
        return isRlsVisible(edge, resolveRlsUserId(this.db?.storage?.RequestContextService))
    }

    /**
     * Dynamically computes the structural gravity (inbound/outbound edges) for a node natively via SQLite.
     * @param {String} id
     * @returns {Object} { in_degree, out_degree }
     */
    getNodeGravity(id) {
        if (!this.db?.storage?.db) {
            return { in_degree: 0, out_degree: 0 };
        }

        try {
            const inStmt  = this.db.storage.db.prepare('SELECT count(*) as count FROM Edges WHERE target = ?');
            const inCount = inStmt.get(id).count || 0;

            const outStmt  = this.db.storage.db.prepare('SELECT count(*) as count FROM Edges WHERE source = ?');
            const outCount = outStmt.get(id).count || 0;

            return { in_degree: inCount, out_degree: outCount };
        } catch (e) {
            return { in_degree: 0, out_degree: 0 };
        }
    }

    /**
     * @summary Returns one RLS-safe inbound-support projection for Golden Path scoring and
     * Discussion liveness. Total support preserves existing structural scoring; decaying support
     * excludes protected fact edges and Golden Path's own `frontier → GUIDES` output so archaeology
     * or a prior route cannot masquerade as current swarm motion. The same visible inbound projection
     * exposes open-blocker and parent facts, keeping admission and cold-start inheritance cache-safe.
     *
     * Root, source node, and edge must all be visible at the cache return boundary. `BLOCKS`,
     * non-positive, and non-finite weights contribute to neither projection. A missing edge weight
     * retains the graph's established default of 1.
     *
     * @param {Object} data
     * @param {String} data.id Graph node id.
     * @returns {{totalWeight: Number, decayingWeight: Number, totalEdgeCount: Number, decayingEdgeCount: Number, hasOpenBlocker: Boolean, parentId: String|null}|null}
     * @throws {Error} When the graph store cannot load or project the candidate topology.
     */
    getInboundStructuralSupport({id} = {}) {
        if (!isValidGraphNodeId(id) || !this.db) return null;

        try {
            this.db.getAdjacentNodes(id, 'both');

            const
                rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService),
                rootNode  = this.db.nodes.get(id);

            if (!rootNode || !isRlsVisible(rootNode, rlsUserId)) return null;

            const support = {
                totalWeight      : 0,
                decayingWeight   : 0,
                totalEdgeCount   : 0,
                decayingEdgeCount: 0,
                hasOpenBlocker   : false,
                parentId         : null
            };

            for (const edge of this.db.edges.getByIndex('target', id)) {
                const sourceNode = this.db.nodes.get(edge.source);

                if (!isRlsVisible(sourceNode, rlsUserId) || !isRlsVisible(edge, rlsUserId)) continue;

                if (edge.type === 'BLOCKS') {
                    const sourceState = sourceNode.properties?.state ?? sourceNode.state;
                    if (sourceState === 'OPEN') support.hasOpenBlocker = true;
                    continue
                }

                if (edge.type === 'PARENT_OF' && support.parentId === null) {
                    support.parentId = edge.source
                }

                const weight = Number(edge.properties?.weight ?? 1);
                if (!Number.isFinite(weight) || weight <= 0) continue;

                support.totalWeight += weight;
                support.totalEdgeCount++;

                const isGoldenPathOutput = edge.type === 'GUIDES' && edge.source === 'frontier';
                if (!PROTECTED_EDGE_TYPE_SET.has(edge.type) && !isGoldenPathOutput) {
                    support.decayingWeight += weight;
                    support.decayingEdgeCount++
                }

            }

            return support
        } catch (error) {
            logger.warn(`[GraphService] getInboundStructuralSupport failed for ${id}:`, error?.message ?? error);
            throw error
        }
    }

    /**
     * Retrieves adjacent connected nodes (neighbors) alongside relationship metadata.
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object} Object containing connected Node objects with edge relationship mapping.
     *     Neighbor objects include `semanticVectorId` when present on the adjacent node,
     *     enabling vector-backed consumers such as `preBriefSession` to hydrate context.
     */
    getNeighbors({id}) {
        // Guarantee lazy-loading vicinity topology securely
        this.db.getAdjacentNodes(id, 'both');

        // RLS: resolve the requester once; do not expose the vicinity of a node the
        // requester cannot see, and filter each neighbor by node + edge visibility.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService),
            rootNode  = this.db.nodes.get(id);

        if (!rootNode || !isRlsVisible(rootNode, rlsUserId)) {
            return {neighbors: []};
        }

        let results  = [],
            inbound  = this.db.edges.getByIndex('target', id),
            outbound = this.db.edges.getByIndex('source', id);

        [...inbound, ...outbound].forEach(e => {
            let adjacentId = e.source === id ? e.target : e.source;
            let node       = this.db.nodes.get(adjacentId);
            // A neighbor is exposed only when BOTH the adjacent node and the connecting
            // edge are RLS-visible — a private edge between visible nodes still leaks.
            if (node && isRlsVisible(node, rlsUserId) && isRlsVisible(e, rlsUserId)) {
                results.push({
                    id              : node.id,
                    type            : node.label,
                    name            : node.properties?.name,
                    description     : node.properties?.description,
                    semanticVectorId: node.properties?.semanticVectorId,
                    relationship    : e.type,
                    weight          : e.properties?.weight || 1.0,
                    source          : e.source,
                    target          : e.target
                });
            }
        });

        return {neighbors: results};
    }

    /**
     * Performs a text-based fuzzy search across node topology to find structural entities.
     * @param {Object} data
     * @param {String} data.query
     * @returns {Object} List of matching Nodes.
     */
    searchNodes({query}) {
        if (!this.db?.storage?.db) {
            return {nodes: []};
        }

        let q = `%${query.toLowerCase()}%`;

        const userId = resolveRlsUserId(this.db.storage?.RequestContextService);

        // Match the canonical (no-`@`) key AND its `@`-prefixed legacy form — the user_id column was
        // written in both (see isRlsVisible) — so own-private rows stay visible to their owner
        // regardless of stored form, without widening to other tenants.
        let rlsClause = `AND (user_id = ? OR user_id = ? OR user_id IS NULL OR json_extract(data, '$.properties.sharedEntity') = 1 OR json_extract(data, '$.properties.visibility') = 'team')`;

        const stmt = this.db.storage.db.prepare(`
            SELECT data FROM Nodes
            WHERE (lower(json_extract(data, '$.properties.name')) LIKE ?
               OR lower(json_extract(data, '$.properties.description')) LIKE ?
               OR lower(id) LIKE ?)
              ${rlsClause}
            LIMIT 50
        `);

        let   matches = [];
        const rows    = stmt.all(q, q, q, userId, userId == null ? null : '@' + userId);
        for (const row of rows) {
            let node = JSON.parse(row.data);
            matches.push({
                id         : node.id,
                type       : node.label,
                name       : node.properties?.name,
                description: node.properties?.description
            });
        }

        return {nodes: matches};
    }

    /**
     * Retrieves the structural topology of the active context frontier.
     * @param {Object} args
     * @param {Number} [args.depth=2] The traversal depth from the frontier node.
     * @returns {Object|null}
     */
    getContextFrontier({depth = 2} = {}) {
        // Guarantee lazy-loading of frontier topology explicitly
        this.db.getAdjacentNodes('frontier', 'both');

        const frontierNode = this.db.nodes.get('frontier');
        if (!frontierNode) {
            logger.info('[GraphService] No frontier node found in graph.');
            return null;
        }

        // RLS: the frontier anchor is shared, but its strategic neighbors may be
        // tenant-private — filter them at the return boundary.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);

        const topology = {
            frontier          : {
                id              : frontierNode.id,
                type            : frontierNode.label,
                name            : frontierNode.properties?.name,
                description     : frontierNode.properties?.description,
                semanticVectorId: frontierNode.properties?.semanticVectorId
            },
            strategicNeighbors: []
        };

        // Get immediate high-weight connections
        const inbound  = this.db.edges.getByIndex('target', 'frontier');
        const outbound = this.db.edges.getByIndex('source', 'frontier');

        [...inbound, ...outbound].forEach(e => {
            const weight = e.properties?.weight || 1.0;
            if (weight >= 0.8) {
                let adjacentId = e.source === 'frontier' ? e.target : e.source;
                let node       = this.db.nodes.get(adjacentId);

                // Actively filter out CLOSED structural paths plus RLS-invisible nodes/edges.
                if (node && isRlsVisible(node, rlsUserId) && isRlsVisible(e, rlsUserId) && node.properties?.state !== 'CLOSED' && !node.properties?.archivedAt) {
                    topology.strategicNeighbors.push({
                        id              : node.id,
                        type            : node.label,
                        name            : node.properties?.name,
                        description     : node.properties?.description,
                        semanticVectorId: node.properties?.semanticVectorId,
                        relationship    : e.type,
                        weight,
                        direction       : e.source === 'frontier' ? 'outbound' : 'inbound'
                    });
                }
            }
        });

        // Sort by highest weight
        topology.strategicNeighbors.sort((a, b) => b.weight - a.weight);

        return topology;
    }

    /**
     * Retrieves the structural topology surrounding a specific node.
     * @param {Object} args
     * @param {String} args.nodeId The ID of the root node.
     * @param {Number} [args.maxDepth=2] The traversal depth from the root.
     * @returns {Object|null}
     */
    queryNodeTopology({nodeId, maxDepth = 2} = {}) {
        const rootNode = this.db.nodes.get(nodeId);
        if (!rootNode) {
            logger.info(`[GraphService] Node ${nodeId} not found in graph.`);
            return null;
        }

        // RLS: the node Store is a process-wide cache — re-check the cache-resident
        // root and every traversed node at the return boundary.
        let rlsUserId = resolveRlsUserId(this.db.storage?.RequestContextService);
        if (!isRlsVisible(rootNode, rlsUserId)) {
            logger.info(`[GraphService] Node ${nodeId} not visible to the active requester.`);
            return null;
        }

        const topology = {
            root : {
                id              : rootNode.id,
                type            : rootNode.label,
                name            : rootNode.properties?.name,
                description     : rootNode.properties?.description,
                semanticVectorId: rootNode.properties?.semanticVectorId
            },
            nodes: [],
            edges: []
        };

        topology.nodes.push(topology.root);

        let currentLevel = new Set([nodeId]);
        let visitedNodes = new Set([nodeId]);
        let visitedEdges = new Set();

        for (let depth = 0; typeof maxDepth === 'number' && depth < maxDepth; depth++) {
            let nextLevel = new Set();
            for (let id of currentLevel) {
                // Guarantee lazy-loading of the topology explicitly
                this.db.getAdjacentNodes(id, 'both');

                const inbound  = this.db.edges.getByIndex('target', id);
                const outbound = this.db.edges.getByIndex('source', id);

                [...inbound, ...outbound].forEach(e => {
                    let adjacentId = e.source === id ? e.target : e.source;
                    let n          = this.db.nodes.get(adjacentId);

                    // RLS: skip an edge that is itself not visible, or whose far node
                    // is absent or not visible — do not leak the node, edge, or traverse it.
                    if (!n || !isRlsVisible(n, rlsUserId) || !isRlsVisible(e, rlsUserId)) {
                        return;
                    }

                    if (!visitedEdges.has(e.id)) {
                        visitedEdges.add(e.id);
                        topology.edges.push({
                            source      : e.source,
                            target      : e.target,
                            relationship: e.type,
                            weight      : e.properties?.weight || 1.0
                        });
                    }

                    if (!visitedNodes.has(adjacentId)) {
                        visitedNodes.add(adjacentId);
                        nextLevel.add(adjacentId);
                        topology.nodes.push({
                            id              : n.id,
                            type            : n.label,
                            name            : n.properties?.name,
                            description     : n.properties?.description,
                            semanticVectorId: n.properties?.semanticVectorId
                        });
                    }
                });
            }
            if (nextLevel.size === 0) {
                break;
            }
            currentLevel = nextLevel;
        }

        // Sort edges by highest weight as a convenience
        topology.edges.sort((a, b) => b.weight - a.weight);

        return topology;
    }

    /**
     * Actively mutates the relationships originating from the frontier node.
     * Upserts the frontier node if necessary, establishes the new relationship, and safely
     * decays older strategic neighbors to prevent context saturation.
     * @param {Object} args
     * @param {String} args.targetNodeId The ID of the node to pivot focus to.
     * @param {Number} [args.weight=1.0] Importance weight, typically very high for a new pivot.
     * @param {String} [args.relationship='STRATEGIC_PIVOT'] The semantic edge type.
     */
    mutateFrontier({targetNodeId, weight = 1.0, relationship = 'STRATEGIC_PIVOT'}) {
        let frontierNode = this.db.nodes.get('frontier');
        if (!frontierNode) {
            this.upsertGlobalNode({
                id         : 'frontier',
                type       : 'SYSTEM_ANCHOR',
                name       : 'Active Context Frontier',
                description: 'The shifting focal point of the active Neo OS agent session.'
            });
        }

        // First, apply decay to existing frontier edges to prevent saturation
        const outbound      = this.db.edges.getByIndex('source', 'frontier');
        const edgesToUpdate = [];
        outbound.forEach(e => {
            if (e.target !== targetNodeId) {
                // Decay by 50%
                let currentWeight = e.properties?.weight || 1.0;
                e.properties.weight = currentWeight * 0.5;
                edgesToUpdate.push(e);
            }
        });
        if (edgesToUpdate.length > 0 && this.db.autoSave && this.db.storage) {
            this.db.storage.addEdges(edgesToUpdate);
            if (typeof this.db.acknowledgeLocalMutations === 'function') {
                this.db.acknowledgeLocalMutations();
            }
        }

        // Upsert target node placeholder if it doesn't exist, to prevent getContextFrontier filtering it out
        if (!this.db.nodes.get(targetNodeId)) {
            this.upsertNode({
                id         : targetNodeId,
                type       : 'CONTEXT_NODE',
                name       : targetNodeId,
                description: `Dynamically injected context target during a STRATEGIC_PIVOT.`
            });
        }

        // Establish the new high-weight connection
        let existingEdge = this.db.edges.items.find(e => e.source === 'frontier' && e.target === targetNodeId && e.type === relationship);
        if (existingEdge) {
            existingEdge.properties.weight = weight;
            if (this.db.autoSave && this.db.storage) {
                this.db.storage.addEdges([existingEdge]);
                if (typeof this.db.acknowledgeLocalMutations === 'function') {
                    this.db.acknowledgeLocalMutations();
                }
            }
        } else {
            this.db.addEdge({
                id        : globalThis.crypto.randomUUID(),
                source    : 'frontier',
                target    : targetNodeId,
                type      : relationship,
                properties: {weight}
            });
        }

        logger.info(`[GraphService] Mutated [Frontier] -> ${targetNodeId} w/ weight ${weight}`);

        return {success: true, targetNodeId, newWeight: weight};
    }

    /**
     * Finds nodes that have lost all structural edges to trigger algorithmic forgetting.
     * Protects structural-anchor node types (`SYSTEM_ANCHOR`, `System`, `ADR`, `ISSUE`, `DISCUSSION`,
     * `PULL_REQUEST`, `SESSION`, `MEMORY`, `AgentIdentity`, `BroadcastSentinel`, `WAKE_SUBSCRIPTION`) from pruning regardless of edge state. `SESSION` and
     * `MEMORY` are protected because they are load-bearing anchors for future mailbox
     * (`IN_REPLY_TO`), identity (`AUTHORED_BY`), and provenance (`MENTIONED_IN`) edges — they may
     * be momentarily edgeless during the ingestion window or for empty sessions, and must persist
     * so downstream edge-creators attach to real targets.
     * `AgentIdentity` and `BroadcastSentinel` are protected to prevent silent wipes during
     * idle or fresh Memory Core states prior to their first activity edges.
     * `WAKE_SUBSCRIPTION` nodes are protected natively against GC race conditions during background
     * maintenance sweeps. `ADR` nodes are durable architectural authority records, so they remain
     * graph-queryable even before relationship edges are materialized.
     * @returns {String[]} Array of node IDs mapping to orphaned vectors.
     */
    getOrphanedNodes() {
        if (!this.db || !this.db.storage || !this.db.storage.db) return [];

        const stmt = this.db.storage.db.prepare(`
            SELECT n.id, n.data
            FROM Nodes n
            WHERE NOT EXISTS (SELECT 1 FROM Edges WHERE source = n.id)
              AND NOT EXISTS (SELECT 1 FROM Edges WHERE target = n.id)
        `);

        let orphaned = [];
        for (let row of stmt.all()) {
            let data;
            try {
                // n.data maps to JSON payload storing the node label
                data = JSON.parse(row.data);
            } catch(e) { continue; }

            // SUMMARY_SESSION / SUMMARY_DAILY: durable temporal-pyramid records (ai/graph/temporalSummarySchema.mjs)
            // are irreplaceable aggregation facts — an edge-less window record is still substrate, never orphan-collectable.
            if (data.label !== 'SYSTEM_ANCHOR' && data.label !== 'System' && data.label !== 'ADR' && data.label !== 'ISSUE' && data.label !== 'DISCUSSION' && data.label !== 'PULL_REQUEST' && data.label !== 'SESSION' && data.label !== 'MEMORY' && data.label !== 'AgentIdentity' && data.label !== 'BroadcastSentinel' && data.label !== 'WAKE_SUBSCRIPTION' && data.label !== 'SUMMARY_SESSION' && data.label !== 'SUMMARY_DAILY') {
                orphaned.push(row.id);
            }
        }

        return orphaned;
    }

    /**
     * @summary On-demand Memory/Session graph lifecycle census for storage-growth observability.
     *
     * Returns counts of durable `MEMORY` / `SESSION` provenance-anchor nodes plus the graph SQLite
     * file sizes (main / WAL / SHM). Deliberately **not** a healthcheck field and **not** an MCP tool:
     * the optional incident-edge count is an `O(edges)` scan (multi-second at millions of edges, growing
     * linearly with the graph), so this is invoked on demand via the maintenance report script, never on
     * the healthcheck hot path or in an always-loaded tool-response schema. The node counts + file sizes
     * are cheap (sub-second); the incident-edge counts are opt-in via `includeIncidentEdges`.
     *
     * @param {Object} [options]
     * @param {Boolean} [options.includeIncidentEdges=false] Also count edges incident to MEMORY/SESSION
     *     nodes — an `O(edges)` scan, off by default so the census stays cheap at scale.
     * @returns {Promise<{available: Boolean, memoryNodes: Number, sessionNodes: Number, sqliteBytes: Number, sqliteWalBytes: Number, sqliteShmBytes: Number, measuredAt: String, memoryIncidentEdges: Number, sessionIncidentEdges: Number, error: String}>} Incident-edge counts only present with `includeIncidentEdges`; `error` only on failure.
     */
    async getLifecycleCensus({includeIncidentEdges = false} = {}) {
        const measuredAt = new Date().toISOString(),
              storage    = this.db?.storage,
              sqliteDb   = storage?.db,
              dbPath     = storage?.dbPath;

        if (!sqliteDb || !dbPath) {
            return {
                available  : false, memoryNodes: 0, sessionNodes: 0,
                sqliteBytes: 0, sqliteWalBytes: 0, sqliteShmBytes: 0,
                measuredAt, error: 'Graph SQLite storage is unavailable.'
            };
        }

        try {
            const countNodes = label => Number(sqliteDb.prepare(`
                SELECT COUNT(*) AS count FROM Nodes WHERE json_extract(data, '$.label') = ?
            `).get(label)?.count || 0);

            const fileSize = async filePath => {
                try {
                    return Number((await fsExtra.stat(filePath)).size || 0);
                } catch (e) {
                    return 0;
                }
            };

            const [sqliteBytes, sqliteWalBytes, sqliteShmBytes] = await Promise.all([
                fileSize(dbPath),
                fileSize(`${dbPath}-wal`),
                fileSize(`${dbPath}-shm`)
            ]);

            const census = {
                available   : true,
                memoryNodes : countNodes('MEMORY'),
                sessionNodes: countNodes('SESSION'),
                sqliteBytes, sqliteWalBytes, sqliteShmBytes,
                measuredAt
            };

            if (includeIncidentEdges) {
                const countIncidentEdges = label => Number(sqliteDb.prepare(`
                    SELECT COUNT(*) AS count FROM Edges e
                    WHERE EXISTS (SELECT 1 FROM Nodes n WHERE n.id = e.source AND json_extract(n.data, '$.label') = ?)
                       OR EXISTS (SELECT 1 FROM Nodes n WHERE n.id = e.target AND json_extract(n.data, '$.label') = ?)
                `).get(label, label)?.count || 0);

                census.memoryIncidentEdges  = countIncidentEdges('MEMORY');
                census.sessionIncidentEdges = countIncidentEdges('SESSION');
            }

            return census;
        } catch (e) {
            return {
                available  : false, memoryNodes: 0, sessionNodes: 0,
                sqliteBytes: 0, sqliteWalBytes: 0, sqliteShmBytes: 0,
                measuredAt, error: e?.message || String(e)
            };
        }
    }

    /**
     * Bulk atomic deletion of graph nodes mapping back to SQLite natively.
     * @param {String[]} nodeIds
     */
    removeNodes(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) return;

        const invalidNodeIds = nodeIds.filter(id => !isValidGraphNodeId(id));

        if (invalidNodeIds.length > 0) {
            throw new Error(`[GraphService] removeNodes received invalid node id(s): ${invalidNodeIds.map(id => String(id)).join(', ')}`);
        }

        this.db.transaction(() => {
            nodeIds.forEach(id => this.db.removeNode(id));
        });
        logger.debug(`[GraphService] Obliterated ${nodeIds.length} Nodes from Native Engine synchronously.`);
    }

    /**
     * @summary Count SESSION-labeled graph nodes (deployment-wide, untenanted).
     * This is **Axis B** of the 5-axis REM observability model: the count of
     * sessions actually committed to the Semantic Graph by the REM digest pipeline.
     *
     * Mirrors the deployment-wide filter shape used by
     * {@link Neo.ai.services.memory-core.HealthService}: `label='SESSION'` and
     * empty `properties.userId`. A tenant-scoped variant
     * (`getSessionNodeCount({userId})`) is a future extension if operator
     * deployments need per-tenant axis counts.
     *
     * **Important divergence semantic:** the divergence between this count and
     * {@link Neo.ai.services.memory-core.managers.ChromaManager#getGraphDigestedCount}
     * is the empirical signal the 5-axis model surfaces: large divergence points
     * to silent failures in the graph-write arm of
     * DreamService.processUndigestedSessions. A healthy pipeline produces
     * `chroma.graphDigested ≈ graph.SESSION` within batch-window tolerance.
     *
     * @returns {Number} Count of deployment-wide SESSION nodes; 0 on storage error
     * @see Neo.ai.services.memory-core.managers.ChromaManager#getGraphDigestedCount
     */
    getSessionNodeCount() {
        try {
            const sqliteDb = this.db?.storage?.db;
            if (!sqliteDb) return 0;

            const stmt = sqliteDb.prepare(`
                SELECT COUNT(*) AS c FROM Nodes
                WHERE json_extract(data, '$.label') = 'SESSION'
                  AND COALESCE(json_extract(data, '$.properties.userId'), '') = ''
            `);
            return stmt.get().c;
        } catch (e) {
            logger.warn('[GraphService] getSessionNodeCount failed:', e?.message ?? e);
            return 0;
        }
    }

    /**
     * @summary Count inbound entity-relation edges TO a specific session node.
     * This is **Axis C** of the 5-axis REM observability model: the per-session
     * extraction yield, measured as the number of graph edges where the session
     * node is the TARGET (the canonical provenance direction).
     *
     * **Edge-direction contract:** the session node is the TARGET of provenance
     * edges from extracted entities (memories ORIGINATES_IN session;
     * concepts/classes DISCUSSED_IN session; etc.). Counting
     * `Edges.target = session:<id>` captures the
     * full extraction-yield surface — a session with zero inbound edges
     * either had no entities OR suffered the extraction-failed-silent path
     * such as repeated JSON parse exhaustion returning `null`.
     *
     * **Case normalization:** delegated to
     * {@link GraphService#normalizeGraphNodeId}, which canonicalizes `memory:`
     * / `session:` prefixes to lowercase regardless of input case. The canonical
     * SQLite-stored convention is lowercase `session:<id>`. The `SESSION:`
     * uppercase form appears in SemanticGraphExtractor LLM prompts as an
     * instruction shape but is normalized to lowercase before any persistence;
     * querying SQLite with the uppercase form returns 0.
     *
     * @param {String} sessionId Session ID, with or without `session:` / `SESSION:` prefix
     * @returns {Number} Count of inbound edges; 0 on storage error, unknown session, or empty session
     * @see GraphService#normalizeGraphNodeId — case-canonicalization primitive
     */
    getSessionEntityCount(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') return 0;

        try {
            const sqliteDb = this.db?.storage?.db;
            if (!sqliteDb) return 0;

            // Normalize via the canonical primitive — handles both bare `<id>`
            // and prefixed `session:<id>` / `SESSION:<id>` inputs, always
            // returning the lowercase `session:<id>` form that matches SQLite
            // storage. For a bare-id input, manually prefix first so
            // normalizeGraphNodeId has a recognizable shape.
            const prefixed = /^(session|memory):/i.test(sessionId)
                ? sessionId
                : `session:${sessionId}`;
            const normalizedId = this.normalizeGraphNodeId(prefixed);

            const stmt = sqliteDb.prepare('SELECT count(*) as count FROM Edges WHERE target = ?');
            return stmt.get(normalizedId).count;
        } catch (e) {
            logger.warn('[GraphService] getSessionEntityCount failed:', e?.message ?? e);
            return 0;
        }
    }
}

export default Neo.setupClass(GraphService);
