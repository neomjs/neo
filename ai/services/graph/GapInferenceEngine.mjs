import Base                                                             from '../../../src/core/Base.mjs';
import {Memory_Config as aiConfig, Memory_GraphService as GraphService} from '../../services.mjs';
import KBRecorderService                                                from '../../services/knowledge-base/KBRecorderService.mjs';
import logger                                                           from '../../mcp/server/memory-core/logger.mjs';
import {NL_ACTION_TELEMETRY_NODE_TYPE}                                  from '../memory-core/helpers/nlActionTelemetryStore.mjs';

/**
 * Default freshness window for Concept Ontology source-grounding. Concepts with missing,
 * null, invalid, or older `verifiedAt` values emit `[CONCEPT_REVERIFY_DUE]` so curators
 * can review them again. This signal is intentionally non-destructive: it never mutates
 * concept weights, edge weights, validation state, or graph visibility.
 * @type {Number}
 * @private
 */
const CONCEPT_REVERIFY_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;
const NL_ACTION_WEAK_EVIDENCE_TAG  = '[NL_ACTION_WEAK_EVIDENCE]';

/**
 * ISO freshness stamps accept either a date-only value (`YYYY-MM-DD`) or the canonical
 * JavaScript UTC timestamp emitted by `Date#toISOString()`.
 * @type {RegExp}
 * @private
 */
const ISO_VERIFIED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/;

/**
 * @summary Service for deterministic capability-gap inference over the Native Edge Graph.
 *
 * Operates in two passes per REM cycle:
 *
 * 1. **TEST_GAP inference (session-scoped):** iterates session-artifact structural nodes
 *    (CLASS / METHOD / COMPONENT) and matches tokenized node names against precise `test/*`
 *    file evidence in the graph. Multi-token structural names require all name tokens to be
 *    present in the test path before a `VALIDATES` edge is created.
 *
 * 2. **Concept-graph inference (edge traversal, cycle-scoped):** iterates CONCEPT nodes ingested
 *    by `ConceptIngestor` and emits deterministic signals via metadata + outbound-edge checks:
 *    - `[CONCEPT_REVERIFY_DUE]` — `verifiedAt` is null, missing, invalid, or older than the
 *      90-day freshness window. This queues curation only; it never fades graph nodes or edges.
 *    - `[GUIDE_GAP]` — no `EXPLAINED_BY` edge
 *    - `[EXAMPLE_GAP]` — has `EXPLAINED_BY`, lacks `EXEMPLIFIED_BY`
 *    - `[ORPHAN_CONCEPT]` — no `IMPLEMENTED_BY` edge (concept exists in ontology but no source
 *      code anchors it; either the ontology is stale/aspirational or the implementation is
 *      missing and should be added). Surfaced through the same `capabilityGap` channel +
 *      `sandman_handoff.md` section pattern as the other gap types, not via `logger.warn`
 *      (logger is ephemeral; the graph + handoff is the durable substrate).
 *    - `[CONCEPT_PROJECTION_INTEGRITY]` — a version-controlled ontology row could not become
 *      canonical graph evidence (for example, a missing or escaping file target). The exact row
 *      and deterministic rejection reason remain on the CONCEPT node until the source is repaired.
 *    - `[KB_DEMAND_GAP]` — repeated agent questions from the Knowledge Base FAQ telemetry
 *      table map to this concept, but the FAQ cluster still lacks strong guide coverage.
 *    The three coverage signals share the `aiConfig.guideGapWeightThreshold` gate
 *    (config-lifted for curator tuning; defaults to `0.8` = tier-1 baseline).
 *    `[CONCEPT_REVERIFY_DUE]` is not weight-gated because freshness review is a curation
 *    cadence, not a severity claim. Low-priority concepts may need review without becoming
 *    more important.
 *
 *    **Why graph traversal over LLM verification?** The concept graph's edges are
 *    curator-maintained (`.neo-ai-data/concepts/edges.jsonl` is version-controlled; each edge
 *    exists because a human — or an agent under PR review — asserted it). The LLM verification
 *    step that existed pre-refactor was a patch for regex imprecision when matching concept names
 *    against guide file paths; concepts don't have that imprecision, so the check becomes
 *    rubber-stamping. Removing it reclaims per-node inference cost from the REM pipeline without
 *    loss of signal fidelity.
 *
 * @class Neo.ai.daemons.services.GapInferenceEngine
 * @extends Neo.core.Base
 * @see Neo.ai.daemons.services.ConceptIngestor
 * @see Neo.ai.daemons.services.GoldenPathSynthesizer
 * @singleton
 */
class GapInferenceEngine extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.GapInferenceEngine'
         * @protected
         */
        className: 'Neo.ai.daemons.services.GapInferenceEngine',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Session-scoped TEST_GAP inference entry point. Iterates CLASS / METHOD / COMPONENT nodes
     * from the session artifact and checks for precise matching test-file evidence.
     * Internal-config lifecycle hooks (`beforeSet*`, `afterSet*`, `beforeGet*`) are excluded
     * since they're structurally shared and not individually testable.
     *
     * Gaps are persisted as a JSON-array-encoded string on `node.properties.capabilityGap` with
     * `[TEST_GAP]` prefix so `GoldenPathSynthesizer` can categorize them into the correct
     * `sandman_handoff.md` section. The `lastGapCheck` timestamp supports TTL-based staleness
     * pruning.
     *
     * Paired with `inferConceptGraphGaps` — which runs at cycle-scope, not per-session — to form
     * the full capability-gap pass while keeping session-bound test coverage separate from
     * ontology-wide concept coverage.
     * @param {Object} payload The parsed Tri-Vector schema from `SemanticGraphExtractor`
     */
    async inferTestGapsFromSession(payload) {
        if (!payload || !payload.session_artifact || !payload.session_artifact.graph || !payload.session_artifact.graph.nodes) return;

        const structuralNodes = payload.session_artifact.graph.nodes.filter(n =>
            (n.type === 'CLASS' || n.type === 'METHOD' || n.type === 'COMPONENT') &&
            (typeof n.confidence === 'number' ? n.confidence : 1.0) >= 0.6
        );

        if (structuralNodes.length === 0) return;

        logger.info(`[GapInferenceEngine] TEST_GAP pass: scanning ${structuralNodes.length} structural nodes.`);

        // INTERNAL MAPPING NOTE: The native SQLite items iterate over `Neo.ai.graph.NodeModel`
        // instances. To align with formal Graph Database taxonomy, the DTO `.type` property
        // is mapped to `.label` on Nodes (while Edges retain `.type`).
        const testFileNodes = GraphService.db.nodes.items.filter(n =>
            n.label === 'FILE' && n.properties?.path?.startsWith('test/')
        ).map(n => ({
            id       : n.id,
            path     : n.properties?.path || '',
            pathLower: (n.properties?.path || '').toLowerCase()
        }));

        for (const node of structuralNodes) {
            const isInternalConfigHook = node.type === 'METHOD' && /^(beforeGet|beforeSet|afterSet)[A-Z]/.test(node.name);
            const dbNode               = GraphService.db.nodes.get(node.id) || GraphService.db.nodes.get(node._resolvedId);

            if (!dbNode) continue;

            let testGap           = null;
            let matchingTestFiles = [];

            if (!isInternalConfigHook) {
                const nodeTokens = this.getStructuralNameTokens(node.name);

                matchingTestFiles = testFileNodes.filter(testFile =>
                    this.doesTestFileValidateStructuralNode(testFile, node, nodeTokens)
                );

                if (matchingTestFiles.length === 0) {
                    testGap = `[TEST_GAP] The ${node.type} '${node.name}' lacks corresponding automated validation suites (Playwright) with precise test-file evidence within the test/ directory.`;
                } else {
                    this.linkTestEvidenceToStructuralNode(matchingTestFiles, dbNode, node);
                }
            }

            this.applyGapsToNode(dbNode, testGap ? [testGap] : []);
        }
    }

    /**
     * @summary Tokenizes a structural name for deterministic test-file evidence matching.
     *
     * CamelCase boundaries and non-alphanumeric separators are normalized into lower-case
     * tokens. Short connective tokens are ignored to keep evidence matching focused on semantic
     * names rather than path noise.
     * @param {String} name Structural node name or test-path fragment
     * @returns {String[]} Unique lower-case evidence tokens
     * @protected
     */
    getStructuralNameTokens(name = '') {
        const
            raw    = String(name || ''),
            tokens = raw
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter(token => token.length > 2);

        return tokens.length > 0 ? [...new Set(tokens)] : (raw ? [raw.toLowerCase()] : []);
    }

    /**
     * @summary Extracts comparable evidence tokens from a test-file path.
     *
     * Test suffixes are stripped before tokenization so `ButtonFeature.spec.mjs` contributes
     * `button` + `feature`, while directory segments can still satisfy split evidence paths
     * such as `button/Feature.spec.mjs`.
     * @param {String} filePath Test-file path from a graph `FILE` node
     * @returns {String[]} Unique lower-case evidence tokens
     * @protected
     */
    getTestFileEvidenceTokens(filePath = '') {
        const pathWithoutTestSuffix = String(filePath || '')
            .replace(/\.(spec|test)\.[cm]?[jt]sx?$/i, '')
            .replace(/\.[cm]?[jt]sx?$/i, '');

        return this.getStructuralNameTokens(pathWithoutTestSuffix);
    }

    /**
     * @summary Determines whether a test file is strong enough evidence for a structural node.
     *
     * A `VALIDATES` edge is only written when the test path contains every semantic token from
     * the structural node name. This preserves single-token matches while preventing sibling
     * false positives such as `ButtonFeature` being validated by `ButtonStore.spec.mjs`.
     * @param {Object}   testFile   Test-file node descriptor
     * @param {Object}   sourceNode Session-artifact structural node
     * @param {String[]} nodeTokens Pre-tokenized structural-node name
     * @returns {Boolean} `true` when the file is precise validation evidence
     * @protected
     */
    doesTestFileValidateStructuralNode(testFile, sourceNode, nodeTokens = this.getStructuralNameTokens(sourceNode?.name)) {
        if (nodeTokens.length === 0) return false;

        const evidenceTokens = this.getTestFileEvidenceTokens(testFile?.path);

        return nodeTokens.every(token => evidenceTokens.includes(token));
    }

    /**
     * @summary Links durable test-file evidence to a structural graph node.
     *
     * `FILE` nodes whose `properties.path` starts with `test/` are the canonical evidence node
     * for this first relation contract. The edge metadata keeps downstream reward / gap-downgrade
     * consumers from re-parsing `capabilityGap` strings once a matching test file exists.
     * @param {Object[]} testFileNodes Matching test-file node descriptors
     * @param {Object}   dbNode        SQLite-persisted structural graph node
     * @param {Object}   sourceNode    Session-artifact structural node
     * @protected
     */
    linkTestEvidenceToStructuralNode(testFileNodes, dbNode, sourceNode) {
        const linkedIds = new Set();

        for (const testFile of testFileNodes) {
            if (!testFile.id || linkedIds.has(testFile.id)) continue;

            linkedIds.add(testFile.id);

            GraphService.linkNodes(testFile.id, dbNode.id, 'VALIDATES', 1.0, {
                evidenceKind     : 'permanent-test-file',
                evidencePath     : testFile.path,
                inferredBy       : 'GapInferenceEngine.inferTestGapsFromSession',
                validatedNodeName: sourceNode.name,
                validatedNodeType: sourceNode.type
            });
        }
    }

    /**
     * Pass 2: concept-graph gap inference via deterministic edge traversal.
     *
     * For each CONCEPT node in the graph, emits a non-destructive freshness signal plus three
     * weight-gated coverage signals based on outbound edges in the Native Edge Graph:
     * - **`[CONCEPT_REVERIFY_DUE]`**: `verifiedAt` is `null`, missing,
     *   invalid, or older than the 90-day freshness window. This queues source-grounding review
     *   work only; it never changes concept weight, edge weight, validation, or graph visibility.
     * - **`[GUIDE_GAP]`**: no outbound `EXPLAINED_BY` edge. Concept is architecturally relevant
     *   but undocumented — write a guide.
     * - **`[EXAMPLE_GAP]`**: has `EXPLAINED_BY` but no `EXEMPLIFIED_BY`. Concept is documented
     *   but lacks a working example — lower severity than a missing guide.
     * - **`[ORPHAN_CONCEPT]`**: no `IMPLEMENTED_BY` edge. Concept exists in
     *   the ontology but no source code anchors it. Either add an implementation or retire the
     *   concept from `nodes.jsonl`. Replaces the ephemeral per-orphan `logger.warn` that used
     *   to live in `ConceptIngestor` — routing through `capabilityGap` + `sandman_handoff.md`
     *   makes the signal durable and aggregatable.
     *
     * The three coverage signals share the same `aiConfig.guideGapWeightThreshold` weight gate
     * (default `0.8` = tier-1 baseline; config-lifted for curator tuning). Lower-weight
     * concepts (tier-3 without uniqueness or coverage deficit lift) are considered low-priority —
     * missing guides/examples/implementations for them aren't worth surfacing in the handoff at
     * the current early stage of the ontology. As concept ingestion accumulates richer validation
     * and enrichment signals, meaningful gaps auto-promote through the same gate without config
     * changes. The derivation of the default (0.8) lives in `config.template.mjs` next to the
     * value itself. Freshness review remains independent of this gate.
     *
     * Uses the edges-direct traversal pattern (`db.edges.getByIndex('source', id).filter(...)`)
     * so coverage is determined from the typed relationship itself. ConceptIngestor validates
     * author-facing `file:<path>` rows and projects them onto FileSystemIngestor's canonical
     * `file-<path>` FILE nodes; invalid rows never become evidence and instead persist as
     * `conceptProjectionIntegrityFindings` on their source CONCEPT.
     *
     * **Scope:** cycle-scoped. Output depends only on ontology state, not on any individual
     * session — invoked once per REM cycle from `DreamService.processUndigestedSessions` after
     * the per-session loop, before garbage collection.
     */
    async inferConceptGraphGaps() {
        const
            conceptNodes = GraphService.db.nodes.items.filter(n => n.label === 'CONCEPT'),
            now          = Date.now();

        if (conceptNodes.length === 0) {
            logger.debug('[GapInferenceEngine] Concept graph empty — skipping concept-graph gap pass. (Is ConceptIngestor running before this?)');
            return;
        }

        const kbDemandGaps = await this.getKbDemandGapsByConcept();

        logger.info(`[GapInferenceEngine] Concept-graph gap pass: traversing ${conceptNodes.length} concepts.`);

        // Resolved once per cycle (not per concept) — the config value is read at gate time so
        // mid-cycle config mutations in tests / runtime take effect without re-importing.
        const threshold = aiConfig.guideGapWeightThreshold;

        for (const concept of conceptNodes) {
            const
                projectionFindings = Array.isArray(concept.properties?.conceptProjectionIntegrityFindings)
                    ? concept.properties.conceptProjectionIntegrityFindings
                    : [],
                integrityGaps      = projectionFindings.map(finding => [
                    `[CONCEPT_PROJECTION_INTEGRITY] The CONCEPT '${concept.properties?.name || concept.name || concept.id}' has a rejected ontology row`,
                    `(${finding.code || 'UNKNOWN'}): ${finding.reason || 'unspecified projection failure'}`,
                    `Source row: ${finding.sourceRow || JSON.stringify(finding)}`
                ].join(' '));

            // Unvalidated concepts (candidates from ConceptDiscoveryService awaiting curator
            // review) are silenced for concept-quality signals regardless of weight. Projection
            // integrity is different: it reports a deterministic source/projector failure, so
            // hiding it behind candidate validation would reintroduce silent row omission.
            if (concept.properties?.validated === false) {
                this.applyGapsToNode(concept, integrityGaps);
                continue;
            }

            const
                outboundEdges      = GraphService.db.edges.getByIndex('source', concept.id),
                explainedByEdges   = outboundEdges.filter(e => e.type === 'EXPLAINED_BY'),
                exemplifiedByEdges = outboundEdges.filter(e => e.type === 'EXEMPLIFIED_BY'),
                implementedByEdges = outboundEdges.filter(e => e.type === 'IMPLEMENTED_BY'),
                weight             = concept.properties?.weight ?? 0,
                codeGapEligible    = concept.properties?.codeGapEligible !== false && concept.properties?.ontologyLayer !== 'process-mx',
                gaps               = [...integrityGaps],
                name               = concept.properties?.name || concept.name || concept.id;

            if (this.isConceptReverifyDue(concept, now)) {
                const verifiedAt = concept.properties?.verifiedAt ?? null;
                gaps.push([
                    `[CONCEPT_REVERIFY_DUE] The CONCEPT '${name}' has verifiedAt=${JSON.stringify(verifiedAt)}`,
                    'and needs source-grounded re-verification. Re-check the Concept Ontology metadata;',
                    'do not decay graph weight or edges automatically.'
                ].join(' '));
            }

            if (codeGapEligible && weight >= threshold) {
                if (explainedByEdges.length === 0) {
                    gaps.push(`[GUIDE_GAP] The CONCEPT '${name}' lacks a corresponding architectural Guide (no EXPLAINED_BY edge in the concept ontology).`);
                } else if (exemplifiedByEdges.length === 0) {
                    gaps.push(`[EXAMPLE_GAP] The CONCEPT '${name}' is documented but lacks a working example (no EXEMPLIFIED_BY edge in the concept ontology).`);
                }

                if (implementedByEdges.length === 0) {
                    gaps.push(`[ORPHAN_CONCEPT] The CONCEPT '${name}' has no IMPLEMENTED_BY edge — either anchor it to a source file or retire the concept from nodes.jsonl if aspirational/stale.`);
                }
            }

            gaps.push(...(kbDemandGaps.get(concept.id) || []));

            this.applyGapsToNode(concept, gaps);
        }
    }

    /**
     * @summary Digests successful Neural Link action sequences into weak TEST_GAP evidence.
     *
     * Neural Link action telemetry is structured relational data, not semantic prose. It used to live in
     * an `nl_action_log` table that a HOST process wrote directly; since the data relocation the host
     * admits it through Memory Core and it lands as `nl-action-telemetry` graph nodes. This pass still
     * reads it directly through the already-mounted graph handle rather than importing `RecorderService`
     * or opening a second MCP-side connection — only the shape being read changed, and the digest keeps
     * grouping by the host-minted correlation token. Qualifying sequences create `NL_ACTION_SEQUENCE -> VALIDATES ->
     * CLASS/COMPONENT` edges with `evidenceKind: neural-link-action-sequence` and annotate existing
     * `[TEST_GAP]` strings with a weak-evidence marker. They never remove the gap: live agent
     * interaction is useful signal, but permanent Playwright coverage remains the stronger evidence.
     *
     * @returns {Object} Digest stats.
     */
    async inferNlActionDigest() {
        const
            lookbackMs     = aiConfig.nlActionDigestLookbackMs,
            sequenceLimit  = aiConfig.nlActionDigestSequenceLimit,
            minSuccessRate = aiConfig.nlActionDigestMinSuccessRate,
            evidenceWeight = aiConfig.nlActionDigestEvidenceWeight,
            sinceTimestamp = Date.now() - lookbackMs,
            rows           = this.readNlActionRows({sinceTimestamp, sequenceLimit});

        if (rows.status !== 'ok') {
            return rows;
        }

        const sequences                    = this.groupNlActionRowsBySequence(rows.rows);
        const resetWeakEvidenceAnnotations = this.resetNlActionWeakEvidenceAnnotations();
        let   qualifyingSequences          = 0,
            linkedEdges         = 0,
            downgradedGaps      = 0,
            targetMatches       = 0;

        for (const [sequenceId, sequenceRows] of sequences) {
            const sequence = this.buildNlActionSequenceEvidence({sequenceId, rows: sequenceRows, minSuccessRate});
            if (!sequence) continue;

            qualifyingSequences++;

            const targets = this.findNlActionTargetNodes(sequence.targets);
            targetMatches += targets.length;

            for (const target of targets) {
                if (this.linkNlActionEvidenceToStructuralNode(sequence, target, evidenceWeight)) {
                    linkedEdges++;
                }

                if (this.annotateTestGapWithNlActionEvidence(target, sequence)) {
                    downgradedGaps++;
                }
            }
        }

        return {
            status       : 'completed',
            rowsRead     : rows.rows.length,
            sequencesRead: sequences.size,
            qualifyingSequences,
            targetMatches,
            linkedEdges,
            downgradedGaps,
            resetWeakEvidenceAnnotations
        };
    }

    /**
     * @param {Object} options
     * @returns {Object}
     * @protected
     */
    /**
     * Both SELECTs below require `properties.visibility = 'team'`, which is this reader's ROW-VISIBILITY
     * boundary rather than a filter for convenience.
     *
     * `GraphService.upsertNode` stamps `Nodes.user_id` from the writing context, so telemetry rows are
     * tenant-scoped unless their writer declares otherwise — and `admitNlActions` declares team visibility
     * deliberately, because this digest is a swarm-wide pass over shared CLASS/COMPONENT nodes. Reading
     * with no predicate at all would have worked identically today and silently read every OTHER tenant's
     * private rows the moment one existed. The predicate is what keeps "what this digest sees" equal to
     * "what was deliberately shared".
     */
    readNlActionRows({sinceTimestamp, sequenceLimit}) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) {
            return {status: 'skipped', reason: 'graph-sqlite-unavailable'};
        }

        try {
            const safeLimit    = Math.max(1, Number(sequenceLimit) || aiConfig.nlActionDigestSequenceLimit);
            const sequenceRows = sqlite.prepare(`
                SELECT json_extract(data, '$.properties.sequenceId')        AS sequence_id,
                       MAX(json_extract(data, '$.properties.timestamp'))    AS latest_timestamp
                FROM Nodes
                WHERE json_extract(data, '$.label') = ?
                  AND json_extract(data, '$.properties.timestamp') >= ?
                  AND json_extract(data, '$.properties.visibility') = 'team'
                GROUP BY sequence_id
                HAVING sequence_id IS NOT NULL
                ORDER BY latest_timestamp DESC
                LIMIT ?
            `).all(NL_ACTION_TELEMETRY_NODE_TYPE, Number(sinceTimestamp) || 0, safeLimit);

            const sequenceIds = sequenceRows.map(row => row.sequence_id).filter(Boolean);

            if (sequenceIds.length === 0) {
                return {status: 'ok', rows: []};
            }

            const placeholders = sequenceIds.map(() => '?').join(',');
            const rows         = sqlite.prepare(`
                SELECT data
                FROM Nodes
                WHERE json_extract(data, '$.label') = ?
                  AND json_extract(data, '$.properties.visibility') = 'team'
                  AND json_extract(data, '$.properties.sequenceId') IN (${placeholders})
            `).all(NL_ACTION_TELEMETRY_NODE_TYPE, ...sequenceIds)
                .map(row => JSON.parse(row.data)?.properties || {})
                // Re-shaped to the row contract the rest of this digest already speaks, so the grouping,
                // scoring and linking below are untouched by where the telemetry now lives. `success` is
                // stored as a boolean and compared here as 1/0, which is the column semantic it replaces.
                .map(properties => ({
                    sequence_id: properties.sequenceId ?? null,
                    session_id : properties.sessionId  ?? null,
                    timestamp  : properties.timestamp  ?? null,
                    tool       : properties.tool       ?? null,
                    success    : properties.success === true ? 1 : 0,
                    duration_ms: properties.durationMs ?? null,
                    app_name   : properties.appName    ?? null,
                    targets    : properties.targets    ?? {classNames: [], componentIds: []}
                }))
                // The table applied `ORDER BY timestamp ASC`; JSON extraction does not, and
                // `buildNlActionSequenceEvidence` reads first/last timestamps positionally.
                .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

            return {status: 'ok', rows};
        } catch (err) {
            logger.debug('[GapInferenceEngine] NL action digest skipped:', err.message);
            return {status: 'skipped', reason: 'nl-action-telemetry-read-failed', error: err.message};
        }
    }

    /**
     * @param {Object[]} rows
     * @returns {Map<String, Object[]>}
     * @protected
     */
    groupNlActionRowsBySequence(rows = []) {
        const grouped = new Map();

        for (const row of rows) {
            const sequenceId = row?.sequence_id;
            if (!sequenceId) continue;
            if (!grouped.has(sequenceId)) {
                grouped.set(sequenceId, []);
            }
            grouped.get(sequenceId).push(row);
        }

        for (const sequenceRows of grouped.values()) {
            sequenceRows.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
        }

        return grouped;
    }

    /**
     * @param {Object} options
     * @returns {Object|null}
     * @protected
     */
    buildNlActionSequenceEvidence({sequenceId, rows, minSuccessRate}) {
        if (!Array.isArray(rows) || rows.length === 0) return null;

        const successfulRows = rows.filter(row => Number(row.success) === 1);
        const successRate    = successfulRows.length / rows.length;

        if (successRate < minSuccessRate) {
            return null;
        }

        const targets = this.extractNlActionTargets(successfulRows);
        if (targets.classNames.size === 0 && targets.componentIds.size === 0) {
            return null;
        }

        return {
            sequenceId,
            nodeId           : `nl-action-sequence:${sequenceId}`,
            rows,
            targets,
            actionCount      : rows.length,
            successfulActions: successfulRows.length,
            successRate,
            firstTimestamp   : rows[0]?.timestamp ?? null,
            lastTimestamp    : rows[rows.length - 1]?.timestamp ?? null,
            tools            : [...new Set(rows.map(row => row.tool).filter(Boolean))],
            sessionIds       : [...new Set(rows.map(row => row.session_id).filter(Boolean))],
            appNames         : [...new Set(rows.map(row => row.app_name).filter(Boolean))]
        };
    }

    /**
     * @param {Object[]} rows
     * @returns {{classNames: Set<String>, componentIds: Set<String>}}
     * @protected
     */
    extractNlActionTargets(rows = []) {
        const targets = {classNames: new Set(), componentIds: new Set()};

        for (const row of rows) {
            // The validation-tool gate stays HERE even though the projection moved to the host. Which
            // tools may mint weak evidence is this digest's judgment, not the recorder's, and a host that
            // decided it could quietly widen what counts as validation.
            if (!this.isNlActionValidationTool(row.tool)) continue;

            const projected = row.targets || {};

            if (Array.isArray(projected.classNames))   projected.classNames  .forEach(value => targets.classNames  .add(value));
            if (Array.isArray(projected.componentIds)) projected.componentIds.forEach(value => targets.componentIds.add(value));
        }

        return targets;
    }

    /**
     * @summary Determines whether an NL tool can provide weak validation evidence.
     *
     * Read/orientation tools can mention broad component ids or class names without exercising
     * the returned surface. Only write/interaction tools are allowed to mint weak runtime evidence.
     * @param {String} tool Neural Link tool name.
     * @returns {Boolean} `true` when the tool has target-bearing mutation or interaction intent.
     * @protected
     */
    isNlActionValidationTool(tool = '') {
        const name = String(tool || '');

        if (/^(get|list|inspect|query|read|health|who|manage)_/i.test(name)) {
            return false;
        }

        return /^(create|set|update|remove|destroy|call|patch|simulate|trigger|click|type|drag|select|focus|blur|undo|redo|commit|abort|begin)_/i.test(name);
    }

    /**
     * `collectNlActionTargets` and `parseJsonValue` lived here and are gone rather than kept: raw `args`
     * no longer reach the container, so both had nothing left to parse. The allowlist itself was not
     * deleted — it moved verbatim to `RecorderService.projectTargets`, which is now the only place the
     * arguments still exist.
     */

    /**
     * @param {Object} targets
     * @returns {Object[]}
     * @protected
     */
    findNlActionTargetNodes(targets) {
        const targetNodes = [];
        const seen        = new Set();

        for (const node of GraphService.db.nodes.items) {
            const label = node.label || node.get?.('label');
            if (label !== 'CLASS' && label !== 'COMPONENT') continue;

            if (!this.doesNlActionTargetStructuralNode(node, targets)) continue;

            const nodeId = node.id || node.get?.('id');
            if (!nodeId || seen.has(nodeId)) continue;
            seen.add(nodeId);
            targetNodes.push(node);
        }

        return targetNodes;
    }

    /**
     * @param {Object} node
     * @param {Object} targets
     * @returns {Boolean}
     * @protected
     */
    doesNlActionTargetStructuralNode(node, targets) {
        const
            label      = node.label || node.get?.('label'),
            id         = node.id || node.get?.('id'),
            properties = (node.properties || node.get?.('properties') || {}),
            name       = properties.name || node.name || '';

        const candidateValues = new Set([
            id,
            name,
            properties.className,
            properties.componentId,
            properties.id,
            id && label ? `${label}:${name}` : null
        ].filter(Boolean));

        if (label === 'CLASS') {
            for (const className of targets.classNames) {
                if (candidateValues.has(className) || candidateValues.has(`CLASS:${className}`)) {
                    return true;
                }
            }
        }

        for (const componentId of targets.componentIds) {
            if (candidateValues.has(componentId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param {Object} sequence
     * @param {Object} dbNode
     * @param {Number} evidenceWeight Weak validation edge weight.
     * @returns {Boolean} true when a new weak validation edge was added.
     * @protected
     */
    linkNlActionEvidenceToStructuralNode(sequence, dbNode, evidenceWeight) {
        const targetId = dbNode.id || dbNode.get?.('id');
        if (!targetId || !sequence?.nodeId) return false;

        const existing = GraphService.db.edges.items.find(edge =>
            edge.source === sequence.nodeId &&
            edge.target === targetId &&
            edge.type === 'VALIDATES' &&
            edge.properties?.evidenceKind === 'neural-link-action-sequence'
        );

        if (existing) return false;

        GraphService.upsertNode({
            id        : sequence.nodeId,
            type      : 'NL_ACTION_SEQUENCE',
            name      : sequence.sequenceId,
            properties: {
                sequenceId       : sequence.sequenceId,
                actionCount      : sequence.actionCount,
                successfulActions: sequence.successfulActions,
                successRate      : sequence.successRate,
                firstTimestamp   : sequence.firstTimestamp,
                lastTimestamp    : sequence.lastTimestamp,
                tools            : sequence.tools,
                sessionIds       : sequence.sessionIds,
                appNames         : sequence.appNames,
                evidenceKind     : 'neural-link-action-sequence',
                weakEvidence     : true
            }
        });

        GraphService.linkNodes(sequence.nodeId, targetId, 'VALIDATES', evidenceWeight, {
            evidenceKind      : 'neural-link-action-sequence',
            weakEvidence      : true,
            successRate       : sequence.successRate,
            actionCount       : sequence.actionCount,
            successfulActions : sequence.successfulActions,
            sequenceId        : sequence.sequenceId,
            inferredBy        : 'GapInferenceEngine.inferNlActionDigest',
            validationStrength: 'weak-runtime-interaction'
        });

        return true;
    }

    /**
     * @summary Clears stale NL weak-evidence annotations before applying the current digest.
     *
     * NL action evidence is intentionally weaker and more volatile than permanent Playwright
     * coverage. Recomputing the marker per successful digest keeps the annotation aligned with
     * the decaying `VALIDATES` edge instead of leaving permanent text after the evidence ages out.
     * @returns {Number} Number of nodes whose weak-evidence annotation state changed.
     * @protected
     */
    resetNlActionWeakEvidenceAnnotations() {
        let resetCount = 0;

        for (const node of GraphService.db.nodes.items) {
            const properties = node.properties || node.get?.('properties') || {};
            const gaps       = this.parseCapabilityGaps(properties.capabilityGap);
            const evidence   = Array.isArray(properties.nlActionEvidence) ? properties.nlActionEvidence : [];

            if (gaps.length === 0 && evidence.length === 0) continue;

            const cleanedGaps = gaps.map(gap => this.stripNlActionWeakEvidence(gap));
            const gapChanged  = cleanedGaps.some((gap, index) => gap !== gaps[index]);

            if (!gapChanged && evidence.length === 0) continue;

            const nextProperties = {
                ...properties,
                nlActionEvidence: []
            };

            if (cleanedGaps.length > 0) {
                nextProperties.capabilityGap = JSON.stringify(cleanedGaps);
            } else {
                delete nextProperties.capabilityGap;
            }

            node.properties = nextProperties;

            GraphService.upsertNode(node);
            resetCount++;
        }

        return resetCount;
    }

    /**
     * @param {String} gap Capability-gap string.
     * @returns {String}
     * @protected
     */
    stripNlActionWeakEvidence(gap) {
        const index = String(gap).indexOf(NL_ACTION_WEAK_EVIDENCE_TAG);
        return index === -1 ? gap : gap.slice(0, index).trim();
    }

    /**
     * @param {Object} dbNode
     * @param {Object} sequence
     * @returns {Boolean}
     * @protected
     */
    annotateTestGapWithNlActionEvidence(dbNode, sequence) {
        const properties = dbNode.properties || dbNode.get?.('properties') || {};
        const gaps       = this.parseCapabilityGaps(properties.capabilityGap);
        if (gaps.length === 0) return false;

        let   changed     = false;
        const updatedGaps = gaps.map(gap => {
            if (!gap.includes('[TEST_GAP]') || gap.includes(NL_ACTION_WEAK_EVIDENCE_TAG)) {
                return gap;
            }
            changed = true;
            return `${gap} ${NL_ACTION_WEAK_EVIDENCE_TAG} Successful Neural Link action sequence '${sequence.sequenceId}' provides weak runtime-interaction evidence (${Math.round(sequence.successRate * 100)}% success), but permanent Playwright coverage is still required.`;
        });

        if (!changed) return false;

        const targetId         = dbNode.id || dbNode.get?.('id');
        const label            = dbNode.label || dbNode.get?.('label');
        const existingEvidence = Array.isArray(properties.nlActionEvidence) ? properties.nlActionEvidence : [];

        GraphService.upsertNode({
            id        : targetId,
            type      : label,
            properties: {
                ...properties,
                capabilityGap   : JSON.stringify(updatedGaps),
                nlActionEvidence: [
                    ...existingEvidence.filter(item => item.sequenceId !== sequence.sequenceId),
                    {
                        sequenceId       : sequence.sequenceId,
                        successRate      : sequence.successRate,
                        actionCount      : sequence.actionCount,
                        successfulActions: sequence.successfulActions,
                        evidenceKind     : 'neural-link-action-sequence',
                        weakEvidence     : true,
                        checkedAt        : Date.now()
                    }
                ]
            }
        });

        return true;
    }

    /**
     * @param {String|String[]} value
     * @returns {String[]}
     * @protected
     */
    parseCapabilityGaps(value) {
        if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
        if (typeof value !== 'string' || value.length === 0) return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
        } catch {
            return [];
        }
    }

    /**
     * @summary Maps materialized Agent FAQ demand rows onto Concept Ontology nodes.
     *
     * `KBRecorderService` owns `kb_query_log` / `kb_query_faqs`; this method only consumes its
     * read model and converts high-frequency uncovered questions into the same durable
     * `capabilityGap` channel used by structural concept gaps. The FAQ table's
     * `has_strong_guide_coverage` flag is authoritative here — it keeps the daemon from
     * re-running semantic coverage checks during every REM cycle.
     *
     * @returns {Promise<Map<String, String[]>>} Concept ID to `[KB_DEMAND_GAP]` strings.
     * @protected
     */
    async getKbDemandGapsByConcept() {
        const gapsByConcept = new Map();

        try {
            await KBRecorderService.ready();

            const {faqs} = KBRecorderService.listAgentFaqs({refresh: true});

            for (const faq of faqs) {
                if (faq.hasStrongGuideCoverage) continue;

                const relatedConceptIds = faq.relatedConceptIds || [];

                for (const conceptId of relatedConceptIds) {
                    if (!gapsByConcept.has(conceptId)) {
                        gapsByConcept.set(conceptId, []);
                    }

                    gapsByConcept.get(conceptId).push(
                        `[KB_DEMAND_GAP] Agents asked "${faq.canonicalQuery}" ${faq.count} times ` +
                        `(cluster ${faq.clusterId}) but the mapped Concept Ontology area lacks strong guide coverage.`
                    );
                }
            }
        } catch (err) {
            logger.debug('[GapInferenceEngine] KB demand gap pass skipped:', err.message);
        }

        return gapsByConcept;
    }

    /**
     * @summary Determines whether a Concept Ontology node is due for source-grounded re-verification.
     *
     * `verifiedAt` is freshness metadata, not graph physics. Returning `true` means the concept
     * should appear in the curation queue via `[CONCEPT_REVERIFY_DUE]`; callers must not treat this
     * as permission to reduce graph weight, weaken edges, flip `validated`, or hide the concept.
     * Missing legacy values, explicit `null`, non-ISO / invalid date strings, and dates older than the
     * configured review window are all due.
     * @param {Object} conceptNode                      SQLite-persisted CONCEPT node
     * @param {Number} now=Date.now()                   Epoch milliseconds used for deterministic tests
     * @param {Number} reviewWindowMs=CONCEPT_REVERIFY_INTERVAL_MS Freshness window in milliseconds
     * @returns {Boolean}
     * @protected
     */
    isConceptReverifyDue(conceptNode, now=Date.now(), reviewWindowMs=CONCEPT_REVERIFY_INTERVAL_MS) {
        const verifiedAt = conceptNode?.properties?.verifiedAt ?? null;
        if (!verifiedAt || typeof verifiedAt !== 'string') return true;
        if (!ISO_VERIFIED_AT_PATTERN.test(verifiedAt)) return true;

        const verifiedTime = Date.parse(verifiedAt);
        if (!Number.isFinite(verifiedTime)) return true;

        return now - verifiedTime > reviewWindowMs;
    }

    /**
     * Writes gaps to `node.properties.capabilityGap` as a JSON-encoded array of tagged strings,
     * or garbage-collects the property if the current pass produced zero gaps for a node that
     * previously had any. Updates `lastGapCheck` on every invocation so `GoldenPathSynthesizer`'s
     * TTL pruning (7-day window) can reliably distinguish fresh from stale records.
     * @param {Object}   dbNode       The SQLite-persisted graph node
     * @param {String[]} gapsForNode  Array of gap strings discovered this pass (may be empty)
     * @protected
     */
    applyGapsToNode(dbNode, gapsForNode) {
        if (!dbNode) return;

        dbNode.properties = dbNode.properties || {};

        if (gapsForNode.length > 0) {
            dbNode.properties.capabilityGap = JSON.stringify(gapsForNode);
            dbNode.properties.lastGapCheck  = Date.now();
            GraphService.upsertNode(dbNode);
            logger.debug(`[GapInferenceEngine] Gap(s) attached to ${dbNode.id}: ${gapsForNode.length} entry(ies).`);
        } else if (dbNode.properties.capabilityGap) {
            delete dbNode.properties.capabilityGap;
            dbNode.properties.lastGapCheck = Date.now();
            GraphService.upsertNode(dbNode);
            logger.debug(`[GapInferenceEngine] Gap eradicated for ${dbNode.id} — coverage complete.`);
        }
    }
}

export default Neo.setupClass(GapInferenceEngine);
