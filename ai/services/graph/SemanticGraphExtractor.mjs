import fs from 'fs';
import path from 'path';
import aiConfig from '../../mcp/server/memory-core/config.mjs';
import Base from '../../../src/core/Base.mjs';
import {emitConsumerFriction, invokeWithGuardrail} from '../../services/memory-core/helpers/ConsumerFrictionHelper.mjs';
import GraphService from '../../services/memory-core/GraphService.mjs';
import Json from '../../../src/util/Json.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import {buildGraphProvider, resolveGraphModelProvider} from './providerDispatch.mjs';

/**
 * @class Neo.ai.daemons.services.SemanticGraphExtractor
 * @extends Neo.core.Base
 * @singleton
 */
class SemanticGraphExtractor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.SemanticGraphExtractor'
         * @protected
         */
        className: 'Neo.ai.daemons.services.SemanticGraphExtractor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Tests whether a graph node ID references a row-backed Memory or Session node.
     *
     * @summary Anchor & Echo: Defines the producer-side provenance predicate for the
     * Memory/Session lazy-edge queue. Matching is case-insensitive for compatibility
     * with legacy uppercase inputs while non-row-backed prefixes remain untouched.
     *
     * @param {String} id Graph node ID candidate
     * @returns {Boolean} `true` for Memory/Session graph node IDs
     * @protected
     */
    isMemorySessionGraphNodeId(id) {
        return typeof id === 'string' && /^(memory|session):/i.test(id);
    }

    /**
     * Normalizes row-backed Memory/Session graph node IDs to canonical lowercase prefixes.
     *
     * @summary Anchor & Echo: Keeps `memory:` / `session:` as the producer canonical
     * form while accepting `MEMORY:` / `SESSION:` as compatibility inputs. Semantic and
     * identity prefixes such as `CONCEPT:`, `CLASS:`, and `AGENT:` pass through unchanged.
     *
     * @param {String} id Raw graph node ID
     * @returns {String} Canonical Memory/Session ID, or the original ID for other prefixes
     * @protected
     */
    normalizeMemorySessionGraphNodeId(id) {
        return this.isMemorySessionGraphNodeId(id) ? GraphService.normalizeGraphNodeId(id) : id;
    }

    /**
     * Executes the Tri-Vector Synthesis (Semantic Graph, Open Deltas, Roadmap Strategy)
     * from the session memory log via JSON schema extraction.
     *
     * @summary Anchor & Echo: Employs a relaxed schema validation strategy. Missing or truncated
     * `graph.nodes` and `graph.edges` default to empty arrays rather than triggering strict validation
     * failures. This graceful degradation prevents token-exhaustion crash-loops under peak payload sizes.
     *
     * @param {Object} session Wrapped session object containing id, document, and meta
     * @returns {Promise<Object|null>} The extracted payload, or null on failure
     */
    async executeTriVectorExtraction(session) {
        logger.info(`[SemanticGraphExtractor] Extracting Tri-Vector Synthesis for session ID: ${session.meta.sessionId}`);

        const systemInstruction = `You are the Neo.mjs REM (Rapid Eye Movement) Sleep digestion agent.
Your task is to analyze the following episodic development session history and extract three vital vectors of intelligence into a strict A2A 2026 JSON object:

1. **Semantic Graph:** Core concepts, framework components, and their relationships.
2. **Feature Namespace:** What primary class or namespace were we working on?
3. **Human Readable Summary:** A single sentence summary of the turn/session.

Enforce this STRICT JSON schema:
{
  "a2a_version": "1.0",
  "agent_id": "Antigravity_Primary",
  "session_artifact": {
    "feature_namespace": "String (e.g. Neo.dashboard.Main, or null)",
    "human_readable_summary": "String (1 sentence high-level summary of the session or turn)",
    "roadmap_impact": "String (Proposal for a long-term strategy pivot) or null",
    "graph": {
      "nodes": [
        {
          "id": "Type:Name",
          "type": "String (MUST BE EXACTLY ONE OF: SESSION, MEMORY, ARTIFACT_PLAN, ARTIFACT_TASK, ISSUE, STRATEGY, SYSTEM_ANCHOR, CONCEPT, CLASS, METHOD, FILE, GUIDE, BLOG, TEST)",
          "name": "String",
          "description": "String",
          "logical_layer": "String (e.g. UI, State, Network, Build, Docs, Core, Unknown)",
          "stability": "String (EXPERIMENTAL, STABLE, DEPRECATED, UNKNOWN)",
          "gravity_well": "Boolean (Is this a long-term strategic anchor from roadmap/boardroom?)",
          "strategic_weight": 0.9,
          "confidence": 0.9,
          "tags": ["Array", "of", "Strings"]
        }
      ],
      "edges": [
        {
          "source": "String (must match a node id, or 'frontier')",
          "target": "String (must match a node id, or 'frontier')",
          "relationship": "String (MUST BE EXACTLY ONE OF: IMPLEMENTS, EXTENDS, DEPENDS_ON, BLOCKS, BLOCKED_BY, RELATES_TO, RESOLVES, CAUSES_ISSUE, MENTIONED_IN, DISCUSSED_IN, REFERENCED_BY)",
          "weight": 1.0,
          "justification": "String (Brief reason for this edge's algorithmic relevance)"
        }
      ]
    }
  }
}

PROVENANCE EDGES:
When extracting entities, you MUST emit provenance edges linking them back to the source Memory or Session, for example:
- MENTIONED_IN (Concept -> memory:xyz)
- DISCUSSED_IN (Class/Method -> session:xyz)
- REFERENCED_BY (Issue -> memory:xyz)

Row-backed Memory and Session provenance targets MUST use lowercase canonical IDs (memory:<id> and session:<id>).
Uppercase MEMORY: / SESSION: are compatibility input forms only; do not emit them.
This does not recase semantic or identity prefixes such as CONCEPT:, CLASS:, or AGENT:.

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.`;

        try {
            const graphProvider = resolveGraphModelProvider(aiConfig);
            const provider = buildGraphProvider({
                modelProvider         : graphProvider,
                ollamaConfig          : aiConfig.ollama,
                openAiCompatibleConfig: aiConfig.openAiCompatible
            });

            // Format boundaries securely
            const messages = [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `--- Session Episodic Memory ---\n${session.document}` }
            ];

            let maxRetries = 3;
            let attempt = 0;
            let payload = null;
            let result = null;

            // Wrap each LLM invocation with the Consumer-Friction guardrail. The upstream
            // pre-check skips invocation when the composed messages' estimated token count
            // exceeds the consumer's safe processing band (default 75% of the consumer's
            // context limit). The downstream try/catch categorizes engine-level failures
            // into friction symptoms. Friction is emitted into the in-memory aggregator
            // (with `serviceDomain: 'dream-pipeline'`) for handoff rendering by
            // `GoldenPathSynthesizer.synthesizeGoldenPath`.
            // consumerModel reflects the active graph-generation provider for accurate
            // telemetry; localModels.chat.* provides the role-keyed context-limit
            // threshold (model-role axis, not provider-namespace — remote providers like
            // Gemini are API-bound and don't expose these knobs; local providers
            // share the same caps because the limit comes from the loaded model).
            const consumerModel          = aiConfig[graphProvider].model;
            const consumerContextTokens  = aiConfig.localModels.chat.contextLimitTokens;
            const consumerSafeTokens     = aiConfig.localModels.chat.safeProcessingLimitTokens;

            while (attempt < maxRetries && !payload) {
                attempt++;

                const inputPayloadText = messages.map(m => m.content).join('\n');
                const guardrailed      = await invokeWithGuardrail({
                    invocationFn             : () => provider.generate(messages),
                    inputPayload             : inputPayloadText,
                    model                    : consumerModel,
                    assetRef                 : session.meta.sessionId,
                    consumer                 : 'SemanticGraphExtractor',
                    contextLimitTokens       : consumerContextTokens,
                    safeProcessingLimitTokens: consumerSafeTokens,
                    serviceDomain            : 'dream-pipeline',
                    note                     : `Tri-Vector session-aggregation attempt ${attempt} of ${maxRetries}`
                });

                if (!guardrailed.result) {
                    logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: invocation guardrail emitted ${guardrailed.friction?.symptom} for session ${session.meta.sessionId}; aborting retry loop.`);
                    return null;
                }

                result = guardrailed.result;

                // Silent context-overflow detection: provider can stream-close immediately
                // with an empty body when its loaded-model context window is smaller than
                // the prompt (LM Studio loaded-context-cap signature: ttftMs===ttltMs,
                // outputChars===0, no thrown error). The retry loop below appends the
                // assistant echo + feedback prompt monotonically — if root cause is overflow,
                // retries make it strictly worse. Emit the existing deterministic
                // `'context-overflow'` symptom (auto-surfaces, no 3-emission threshold) and
                // abort retry to break the amplification.
                if (!result?.content || result.content.trim() === '') {
                    logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Empty response from provider for session ${session.meta.sessionId}; classifying as context-overflow (silent: no thrown error, no body).`);

                    emitConsumerFriction({
                        symptom                  : 'context-overflow',
                        consumer                 : 'SemanticGraphExtractor',
                        model                    : consumerModel,
                        assetRef                 : session.meta.sessionId,
                        serviceDomain            : 'dream-pipeline',
                        emissionPoint            : 'post-invocation-failure',
                        inputBytes               : Buffer.byteLength(inputPayloadText),
                        contextLimitTokens       : consumerContextTokens,
                        safeProcessingLimitTokens: consumerSafeTokens,
                        note                     : `Silent empty-response from provider (no thrown error, no body). Prompt chars: ${inputPayloadText.length}. Attempt ${attempt}/${maxRetries}.`
                    });

                    return null;
                }

                // Extract using robust Json parser to catch malformed boundaries
                payload = Json.extract(result.content);

                // Validation check
                if (!payload || !payload.session_artifact) {
                    logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Failed to validate extracted Tri-Vector A2A payload for session: ${session.meta.sessionId}`);

                    if (attempt < maxRetries) {
                        logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Injecting autonomous JSON repair feedback loop.`);
                        messages.push({ role: 'assistant', content: result.content });
                        messages.push({
                            role: 'user',
                            content: `Your previous response failed internal schema validation. You are missing required keys (e.g., session_artifact) or you provided malformed JSON. Please correct your output and provide ONLY the exact JSON shape requested in the instructions.`
                        });
                        payload = null; // Ensure loop continues
                    } else {
                        logger.warn(`[SemanticGraphExtractor] --- FINAL EXHAUSTED RAW LLM DUMP ---\n${result.content}\n-----------------------------`);
                    }
                } else {
                    // Relaxed schema validation: default missing or malformed graph/nodes/edges to empty arrays to prevent exhaustion loops.
                    payload.session_artifact.graph = payload.session_artifact.graph || {};

                    if (!Array.isArray(payload.session_artifact.graph.nodes)) {
                        payload.session_artifact.graph.nodes = [];
                    }
                    if (!Array.isArray(payload.session_artifact.graph.edges)) {
                        payload.session_artifact.graph.edges = [];
                    }
                }
            }

            if (!payload) {
                return null;
            }

            logger.debug(`[SemanticGraphExtractor] Successfully extracted Tri-Vector A2A schema for session ${session.meta.sessionId} after ${attempt} attempts.`);

            const artifact = payload.session_artifact;

            // --- VECTOR 1: SEMANTIC GRAPH ---
            // Ensure frontier exists, if not, stub it so we can link to it
            if (!GraphService.db.nodes.has('frontier')) {
                GraphService.upsertNode({
                    id: 'frontier',
                    type: 'SYSTEM_ANCHOR',
                    name: 'Active Context Frontier',
                    description: 'The actively tracked development front for the current project scope.',
                    semanticVectorId: null
                });
            }

            const VALID_TYPES = ['SESSION', 'MEMORY', 'ARTIFACT_PLAN', 'ARTIFACT_TASK', 'ISSUE', 'STRATEGY', 'SYSTEM_ANCHOR', 'CONCEPT', 'CLASS', 'METHOD', 'FILE', 'GUIDE', 'BLOG', 'TEST'];

            // Bridge to GraphService (SQLite)
            for (const node of artifact.graph.nodes) {
                if (node.id === 'frontier') continue;

                let nodeType = node.type && VALID_TYPES.includes(node.type.toUpperCase()) ? node.type.toUpperCase() : 'CONCEPT';
                let nodeId = node.id;

                // Enforce Neo native Graph ID specification (Type:Name) if hallucinated
                if (!nodeId.includes(':')) {
                    const cleanName = (node.name || nodeId).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                    nodeId = `${nodeType}:${cleanName}`;
                }
                nodeId = this.normalizeMemorySessionGraphNodeId(nodeId);

                GraphService.upsertNode({
                    id: nodeId,
                    type: nodeType,
                    name: node.name || 'Unknown',
                    description: node.description || '',
                    semanticVectorId: session.id,
                    properties: {
                        logical_layer: node.logical_layer || 'Unknown',
                        stability: node.stability || 'UNKNOWN',
                        gravity_well: node.gravity_well === true,
                        strategic_weight: typeof node.strategic_weight === 'number' ? node.strategic_weight : (node.gravity_well ? 1.0 : 0.1),
                        confidence: typeof node.confidence === 'number' ? node.confidence : 0.5,
                        tags: Array.isArray(node.tags) ? node.tags : [],
                        context_source: session.meta.sessionId
                    }
                });

                // Update the payload graph node id so edges bind correctly
                node._resolvedId = nodeId;
            }

            const validNodeRefs = new Set([...artifact.graph.nodes.map(n => n.id), ...artifact.graph.nodes.map(n => n._resolvedId), 'frontier']);

            for (const edge of artifact.graph.edges) {
                // Map the original edge source/target to the resolved Node IDs
                let resolvedSource = edge.source;
                let resolvedTarget = edge.target;

                const sourceNode = artifact.graph.nodes.find(n => n.id === edge.source);
                if (sourceNode && sourceNode._resolvedId) resolvedSource = sourceNode._resolvedId;

                const targetNode = artifact.graph.nodes.find(n => n.id === edge.target);
                if (targetNode && targetNode._resolvedId) resolvedTarget = targetNode._resolvedId;

                resolvedSource = this.normalizeMemorySessionGraphNodeId(resolvedSource);
                resolvedTarget = this.normalizeMemorySessionGraphNodeId(resolvedTarget);

                const sourceExists = validNodeRefs.has(resolvedSource) || GraphService.db.nodes.has(resolvedSource);
                const targetExists = validNodeRefs.has(resolvedTarget) || GraphService.db.nodes.has(resolvedTarget);

                if (!sourceExists || !targetExists) {
                    const isProvenance = ['MENTIONED_IN', 'DISCUSSED_IN', 'REFERENCED_BY'].includes(edge.relationship);
                    const targetsSessionOrMemory = this.isMemorySessionGraphNodeId(resolvedTarget) || this.isMemorySessionGraphNodeId(resolvedSource);

                    if (isProvenance && targetsSessionOrMemory) {
                        /**
                         * @summary Provenance Edge Lazy-Queue Strategy
                         * Provenance edges (MENTIONED_IN, DISCUSSED_IN, REFERENCED_BY) linking to past sessions/memories
                         * may reference nodes not in the current payload or synchronous graph cache.
                         * Instead of dropping them as invalid, we route them to a JSONL backfill queue.
                         * Consumer-side draining and retry logic is handled by LazyEdgeDrainer.
                         */
                        logger.info(`[SemanticGraphExtractor] Queuing unresolved provenance edge for lazy back-fill: ${resolvedSource} -> ${resolvedTarget}`);
                        const lazyQueueFile = aiConfig.lazyEdgesQueuePath;
                        const edgeData = JSON.stringify({ ...edge, source: resolvedSource, target: resolvedTarget, timestamp: new Date().toISOString() }) + '\n';
                        try {
                            // Ensure the directory exists before appending
                            await fs.promises.mkdir(path.dirname(lazyQueueFile), { recursive: true });
                            await fs.promises.appendFile(lazyQueueFile, edgeData, 'utf8');
                        } catch (err) {
                            logger.error('[SemanticGraphExtractor] Failed to queue lazy edge:', err);
                        }
                        continue;
                    }

                    logger.warn(`[SemanticGraphExtractor] Culling hallucinated edge from ${resolvedSource} to ${resolvedTarget}`);
                    continue; // Skip trying to link non-existent graph nodes
                }

                GraphService.linkNodes(
                    resolvedSource,
                    resolvedTarget,
                    edge.relationship || 'RELATES_TO',
                    edge.weight !== undefined ? parseFloat(edge.weight) : 1.0,
                    {
                        justification: edge.justification || '',
                        context_source: session.meta.sessionId
                    }
                );
            }

            logger.info(`[SemanticGraphExtractor] Graph entities committed to Neocortex for session ${session.meta.sessionId}.`);

            // --- VECTOR 2: STRATEGIC ROADMAP PIVOTS ---
            if (artifact.roadmap_impact && typeof artifact.roadmap_impact === 'string' && artifact.roadmap_impact.toLowerCase() !== 'null') {
                const auditLog = path.join('/tmp', 'roadmap_audits.log');
                const strategyEntry = `[${new Date().toISOString()}] Session ${session.meta.sessionId}:\n${artifact.roadmap_impact}\n\n`;
                await fs.promises.appendFile(auditLog, strategyEntry, 'utf8');
                logger.info(`[SemanticGraphExtractor] Extracted Strategy impact to roadmap_audits.log`);
            }

            return payload;

        } catch (error) {
            if (error.message && error.message.includes('fetch failed')) {
                logger.debug(`[SemanticGraphExtractor] Skipping extraction (API provider offline).`);
            } else {
                logger.error('[SemanticGraphExtractor] Error during graph extraction run:', error);
            }
            return null;
        }
    }

    /**
     * Extracts semantic concepts from a message body for auto-emission.
     *
     * Auto-extracted concepts carry distinct provenance from operator/agent-curated
     * `taggedConcepts`: the upsert path stamps `properties.auto_extracted: true` on
     * freshly-created concept nodes, and the `TAGGED_CONCEPT` edge is written at
     * weight `0.8` (vs `1.0` for curated). See `learn/agentos/ConceptOntology.md`
     * § Auto-Extracted Concept Provenance for the read-time consumer pattern +
     * edge-weight rationale.
     *
     * Pre-existing concept nodes are NOT re-stamped — the flag is set only on the
     * fresh-create path, preserving curated nodes' authoritative status even when
     * subsequently referenced by LLM-inferred MESSAGE bodies.
     *
     * @param {String} bodyText The message content to analyze
     * @returns {Promise<String[]>} Array of extracted Concept Node IDs
     * @see learn/agentos/ConceptOntology.md § Auto-Extracted Concept Provenance
     * @see ai/services/memory-core/MailboxService.mjs#addMessage — caller (fire-and-forget)
     */
    async extractMessageConcepts(bodyText) {
        if (!bodyText || typeof bodyText !== 'string' || bodyText.trim().length === 0) {
            return [];
        }

        logger.info(`[SemanticGraphExtractor] Extracting concepts from message body...`);

        const systemInstruction = `You are a concept extraction agent for the Neo.mjs Native Edge Graph.
Your task is to analyze the following message body and extract the top 1-5 architectural concepts, classes, or patterns it discusses.

Enforce this STRICT JSON schema:
{
  "concepts": [
    "String (must be in the exact format CONCEPT:name or CLASS:name, e.g. CONCEPT:multi-threading, CLASS:Neo.component.Base)"
  ]
}

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.`;

        try {
            const graphProvider = resolveGraphModelProvider(aiConfig);
            const provider = buildGraphProvider({
                modelProvider         : graphProvider,
                ollamaConfig          : aiConfig.ollama,
                openAiCompatibleConfig: aiConfig.openAiCompatible
            });

            const messages = [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `--- Message Body ---\n${bodyText}` }
            ];

            let maxRetries = 2;
            let attempt = 0;
            let payload = null;

            while (attempt < maxRetries && !payload) {
                attempt++;
                const result = await provider.generate(messages);
                payload = Json.extract(result.content);

                if (!payload || !Array.isArray(payload.concepts)) {
                    logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Failed to validate extracted concepts schema for message.`);
                    if (attempt < maxRetries) {
                        messages.push({ role: 'assistant', content: result.content });
                        messages.push({
                            role: 'user',
                            content: `Your previous response failed internal schema validation. You are either missing the 'concepts' array or provided malformed JSON. Please correct your output and provide ONLY the exact JSON shape requested.`
                        });
                        payload = null;
                    }
                }
            }

            if (!payload || !Array.isArray(payload.concepts)) {
                return [];
            }

            const validConcepts = payload.concepts.filter(c => typeof c === 'string' && c.includes(':'));
            logger.info(`[SemanticGraphExtractor] Extracted ${validConcepts.length} concepts from message.`);
            return validConcepts;

        } catch (error) {
            if (error.message && error.message.includes('fetch failed')) {
                logger.debug(`[SemanticGraphExtractor] Skipping message concept extraction (API provider offline).`);
            } else {
                logger.error('[SemanticGraphExtractor] Error during message concept extraction:', error);
            }
            return [];
        }
    }
}

export default Neo.setupClass(SemanticGraphExtractor);
