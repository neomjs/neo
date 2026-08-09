import crypto   from 'crypto';
import fs       from 'fs';
import path     from 'path';
import AiConfig from '../../mcp/server/memory-core/config.mjs';
import Base     from '../../../src/core/Base.mjs';
import {
    bytesToTokens,
    emitConsumerFriction,
    invokeWithGuardrail
} from '../../services/memory-core/helpers/consumerFrictionHelper.mjs';
import GraphService                                    from '../../services/memory-core/GraphService.mjs';
import {
    clearActiveRemCallState,
    writeActiveRemCallState
} from '../../services/memory-core/helpers/remRunStateStore.mjs';
import Json   from '../../../src/util/Json.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import {
    canonicalizeSemanticGraphNodeId,
    canonicalizeTaggedConceptIds
} from './conceptSpineCanonicalization.mjs';
import {buildGraphProvider, resolveGraphModelProvider} from './providerDispatch.mjs';
import {chunkSession}                                  from './sessionChunker.mjs';
import MemoryCoreRecorderService                       from '../memory-core/MemoryCoreRecorderService.mjs';

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
     * Estimates chat-message payload size using the shared consumer-friction token heuristic.
     *
     * @summary Anchor & Echo: Keeps post-invocation retry sizing on the same estimator as the
     * pre-invocation guardrail, so calibration fixes land in one place.
     *
     * @param {Object[]} messages Provider chat messages
     * @returns {Object} `{text, bytes, tokens}` estimate for the composed provider payload
     * @protected
     */
    estimateChatMessagesPayload(messages) {
        const text  = messages.map(m => m.content).join('\n'),
              bytes = Buffer.byteLength(text, 'utf8');

        return {
            text,
            bytes,
            tokens: bytesToTokens(bytes)
        };
    }

    /**
     * Builds bounded per-message fingerprints for REM provider request diagnostics.
     *
     * @summary Anchor & Echo: Lets operators correlate one provider-visible counter with
     * one Neo request without logging full session payloads or repair-loop output.
     *
     * @param {Object[]} messages Provider chat messages
     * @returns {Object[]} Bounded message-slot diagnostics
     * @protected
     */
    buildTriVectorRequestFingerprints(messages = []) {
        return messages.map((message, index) => {
            const content = String(message?.content ?? ''),
                  bytes   = Buffer.byteLength(content, 'utf8');

            return {
                index,
                role               : typeof message?.role === 'string' ? message.role : 'unknown',
                bytes,
                tokensEstimate     : bytesToTokens(bytes),
                contentSha256Prefix: crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
            };
        });
    }

    /**
     * Resolves provider completion finish reasons across supported raw envelopes.
     *
     * @summary Anchor & Echo: Normalizes OpenAI-compatible `finish_reason`, Ollama
     * `done_reason`, and Gemini `finishReason` shapes into one retry-loop predicate.
     *
     * @param {Object} result Provider generation result
     * @returns {String} Completion finish reason, or an empty string when unavailable
     * @protected
     */
    getCompletionFinishReason(result) {
        const reason = result?.finish_reason ??
                       result?.finishReason ??
                       result?.raw?.finish_reason ??
                       result?.raw?.finishReason ??
                       result?.raw?.done_reason ??
                       result?.raw?.doneReason ??
                       result?.raw?.choices?.[0]?.finish_reason ??
                       result?.raw?.choices?.[0]?.finishReason ??
                       result?.raw?.candidates?.[0]?.finishReason;

        return typeof reason === 'string' ? reason : '';
    }

    /**
     * Tests whether a provider finish reason means the response hit an output/token cap.
     *
     * @summary Anchor & Echo: Length-capped non-empty responses are treated as overflow
     * evidence because schema-repair retries would append the truncated body and grow the prompt.
     *
     * @param {String} finishReason Provider finish reason
     * @returns {Boolean} `true` when the reason indicates token-length truncation
     * @protected
     */
    isLengthTruncatedCompletion(finishReason) {
        return /^(length|max_tokens|token_limit)$/i.test(String(finishReason || '').trim());
    }

    /**
     * Builds the graph-generation provider from resolved AiConfig leaves.
     *
     * @summary Anchor & Echo: Keeps ADR-19 ownership local to this consumer: the
     * Provider tree is read at the graph-extraction use site, while the dispatch
     * helper receives only the plain constructor shape it needs for provider creation.
     *
     * @param {String} graphProvider Active graph-generation provider selector
     * @returns {{generate: Function}} Chat-capable graph provider
     * @protected
     */
    buildConfiguredGraphProvider(graphProvider) {
        return buildGraphProvider({
            modelProvider: graphProvider,
            ollamaConfig : {
                host          : AiConfig.ollama.host,
                model         : AiConfig.ollama.model,
                embeddingModel: AiConfig.ollama.embeddingModel,
                keep_alive    : AiConfig.ollama.keep_alive
            },
            openAiCompatibleConfig: {
                apiKey    : AiConfig.openAiCompatible.apiKey,
                host      : AiConfig.openAiCompatible.host,
                keep_alive: AiConfig.openAiCompatible.keep_alive,
                model     : AiConfig.openAiCompatible.model
            },
            providerActivityRecorder: MemoryCoreRecorderService,
            providerActivityService : 'dream-pipeline'
        });
    }

    /**
     * Emits deterministic context-overflow friction for post-invocation retry aborts.
     *
     * @summary Anchor & Echo: Reuses the established ConsumerFriction channel for retry-loop
     * overflow evidence instead of introducing a parallel symptom path.
     *
     * @param {Object} options
     * @param {String} options.sessionId Session identifier
     * @param {String} options.consumerModel Provider model identifier
     * @param {Number} options.consumerContextTokens Context window in tokens
     * @param {Number} options.consumerSafeTokens Safe processing band in tokens
     * @param {Number} options.inputBytes Estimated prompt bytes
     * @param {Number} options.inputTokensEstimate Estimated prompt tokens
     * @param {String} options.note Diagnostic note
     * @protected
     */
    emitRetryLoopContextOverflow({
        sessionId,
        consumerModel,
        consumerContextTokens,
        consumerSafeTokens,
        inputBytes,
        inputTokensEstimate,
        note
    }) {
        emitConsumerFriction({
            symptom                  : 'context-overflow',
            consumer                 : 'SemanticGraphExtractor',
            model                    : consumerModel,
            assetRef                 : sessionId,
            serviceDomain            : 'dream-pipeline',
            emissionPoint            : 'post-invocation-failure',
            inputBytes,
            inputTokensEstimate,
            contextLimitTokens       : consumerContextTokens,
            safeProcessingLimitTokens: consumerSafeTokens,
            note
        });
    }

    /**
     * Maps ConsumerFriction symptoms into REM digest-state `deferReason` values.
     *
     * @summary Anchor & Echo: Keeps the visibility taxonomy (`ConsumerFriction.symptom`)
     * separate from the REM cadence taxonomy (`deferReason`). The extractor owns this
     * bridge because it is the only layer with direct provider-failure evidence.
     *
     * @param {String} symptom ConsumerFriction symptom
     * @returns {String} REM digest-state defer reason
     * @protected
     */
    getDeferReasonForFrictionSymptom(symptom) {
        switch (symptom) {
            case 'size-precheck-skip':
                return 'skip-over-band';
            case 'timeout':
                return 'wall-clock-timeout';
            case 'parse-failure':
                return 'schema-failure';
            case 'context-overflow':
            default:
                return 'under-band-choke';
        }
    }

    /**
     * Creates the typed failure descriptor consumed by `DreamService`.
     *
     * @summary Anchor & Echo: Success still returns the Tri-Vector payload for compatibility.
     * Failure returns this descriptor instead of bare `null`, so REM cadence can persist
     * `deferReason` / `terminalForCadence` from provider-local evidence rather than guessing
     * from payload size after the fact.
     *
     * @param {Object} options
     * @param {String} options.deferReason REM digest-state reason
     * @param {String} [options.frictionSymptom] ConsumerFriction symptom used as visibility evidence
     * @param {Boolean} [options.terminalForCadence=true] Whether repeated failures may be deferred after max attempts
     * @param {Object} [options.evidence] Bounded diagnostic evidence
     * @returns {Object}
     * @protected
     */
    createTriVectorFailureDescriptor({
        deferReason,
        frictionSymptom,
        terminalForCadence = true,
        evidence = {}
    }) {
        return {
            ok: false,
            deferReason,
            frictionSymptom,
            terminalForCadence,
            evidence
        };
    }

    /**
     * Tests whether a Tri-Vector result is a typed extractor failure descriptor.
     *
     * @summary Anchor & Echo: `DreamService` treats the same shape as terminality evidence.
     * Keeping the producer predicate local lets chunk-map/reduce abort before any graph commit.
     *
     * @param {*} value Candidate Tri-Vector extraction result
     * @returns {Boolean}
     * @protected
     */
    isTriVectorFailureDescriptor(value) {
        return value?.ok === false;
    }

    /**
     * Estimates raw text token size using the ConsumerFriction heuristic.
     *
     * @summary Anchor & Echo: Tri-Vector chunk activation uses the same byte→token estimate as
     * the invocation guardrail, avoiding split-brain limits between chunking and provider calls.
     *
     * @param {String} text Raw prompt text
     * @returns {Number}
     * @protected
     */
    estimateTextTokens(text) {
        return bytesToTokens(Buffer.byteLength(text === undefined || text === null ? '' : String(text), 'utf8'));
    }

    /**
     * Creates deterministic turn-aligned Tri-Vector chunks after subtracting prompt overhead.
     *
     * @summary Anchor & Echo: Small sessions preserve the exact `session.document` single-pass path.
     * Large sessions use complete raw turn documents when available; oversized single turns remain
     * intact and flow through the typed failure/guardrail path instead of being split mid-turn.
     *
     * @param {Object} session Wrapped session object
     * @param {String} systemInstruction Tri-Vector system prompt
     * @returns {{chunked: Boolean, totalEstimatedTokens: Number, chunks: Object[]}}
     * @protected
     */
    createTriVectorChunks(session, systemInstruction) {
        const turnDocuments = Array.isArray(session.turnDocuments) && session.turnDocuments.length > 0
                ? session.turnDocuments
                : [session.document],
              envelopeTokens = this.estimateChatMessagesPayload([
                  {role: 'system', content: systemInstruction},
                  {role: 'user',   content: '--- Session Episodic Memory ---\n'}
              ]).tokens,
              {
                  contextLimitTokens,
                  safeProcessingLimitTokens,
                  graphOutputLimitTokens,
                  graphChunkLimitTokens
              } = AiConfig.localModels.chat,
              promptBudget = Math.min(graphChunkLimitTokens, safeProcessingLimitTokens, contextLimitTokens - graphOutputLimitTokens),
              chunkBudget  = Math.max(1, promptBudget - envelopeTokens);

        return chunkSession(turnDocuments, {
            sessionId                : session.meta.sessionId,
            safeProcessingLimitTokens: chunkBudget,
            estimate                 : text => this.estimateTextTokens(text)
        });
    }

    /**
     * Adds chunk provenance to a typed Tri-Vector failure descriptor.
     *
     * @param {Object} failure Typed failure descriptor
     * @param {Object} chunk Failed chunk descriptor
     * @param {Number} index Zero-based chunk index
     * @param {Number} total Total chunks in the plan
     * @returns {Object}
     * @protected
     */
    addChunkFailureEvidence(failure, chunk, index, total) {
        return {
            ...failure,
            evidence: {
                ...failure.evidence,
                chunkId      : chunk.chunkId,
                chunkIndex   : index,
                chunkCount   : total,
                turnIndices  : chunk.turnIndices,
                chunkTokens  : chunk.estimatedTokens,
                oversizedTurn: chunk.oversizedTurn === true
            }
        };
    }

    /**
     * Deterministically reduces chunk-level Tri-Vector payloads into one session payload.
     *
     * @summary Anchor & Echo: This is the deterministic map-reduce floor, not semantic-perfect
     * synthesis. Chunks are processed in monotonic chunk order; graph nodes dedupe by
     * `(type, name)`, and edges are remapped through the deduped node ids before graph commit.
     *
     * @param {Object[]} payloads Chunk-level Tri-Vector payloads
     * @param {Object} chunkPlan Chunk plan emitted by `sessionChunker`
     * @returns {Object} Reduced session-level Tri-Vector payload
     * @protected
     */
    reduceTriVectorPayloads(payloads, chunkPlan) {
        const nodeByTuple  = new Map(),
              nodeIdRemap  = new Map(),
              edgeByTuple  = new Map(),
              summaries    = [],
              roadmapItems = [];

        let featureNamespace = null;

        for (const payload of payloads) {
            const artifact = payload.session_artifact;

            if (!featureNamespace && typeof artifact.feature_namespace === 'string' && artifact.feature_namespace.trim()) {
                featureNamespace = artifact.feature_namespace;
            }
            if (typeof artifact.human_readable_summary === 'string' && artifact.human_readable_summary.trim()) {
                summaries.push(artifact.human_readable_summary.trim());
            }
            if (typeof artifact.roadmap_impact === 'string' && artifact.roadmap_impact.trim() && artifact.roadmap_impact.toLowerCase() !== 'null') {
                roadmapItems.push(artifact.roadmap_impact.trim());
            }

            for (const node of artifact.graph.nodes) {
                const type = typeof node.type === 'string' && node.type.trim() ? node.type.toUpperCase() : 'CONCEPT',
                      name = typeof node.name === 'string' && node.name.trim() ? node.name : (node.id || 'Unknown'),
                      key  = `${type}\u0000${name}`;

                if (!nodeByTuple.has(key)) {
                    const storedNode = {
                        ...node,
                        type,
                        name,
                        tags: Array.isArray(node.tags) ? [...new Set(node.tags)] : []
                    };
                    nodeByTuple.set(key, storedNode);
                    if (node.id) {
                        nodeIdRemap.set(node.id, storedNode.id);
                    }
                    continue;
                }

                const storedNode = nodeByTuple.get(key);
                if (node.id) {
                    nodeIdRemap.set(node.id, storedNode.id);
                }
                if (typeof node.description === 'string' && node.description.length > String(storedNode.description || '').length) {
                    storedNode.description = node.description;
                }
                if (node.gravity_well === true) {
                    storedNode.gravity_well = true;
                }
                if (typeof node.strategic_weight === 'number') {
                    storedNode.strategic_weight = Math.max(
                        typeof storedNode.strategic_weight === 'number' ? storedNode.strategic_weight : 0,
                        node.strategic_weight
                    );
                }
                if (typeof node.confidence === 'number') {
                    storedNode.confidence = Math.max(
                        typeof storedNode.confidence === 'number' ? storedNode.confidence : 0,
                        node.confidence
                    );
                }
                if (Array.isArray(node.tags)) {
                    storedNode.tags = [...new Set([...(storedNode.tags || []), ...node.tags])];
                }
            }

            for (const edge of artifact.graph.edges) {
                const source       = nodeIdRemap.get(edge.source) || edge.source,
                      target       = nodeIdRemap.get(edge.target) || edge.target,
                      relationship = edge.relationship || 'RELATES_TO',
                      key          = `${source}\u0000${target}\u0000${relationship}`;

                if (!edgeByTuple.has(key)) {
                    edgeByTuple.set(key, {...edge, source, target, relationship});
                    continue;
                }

                const storedEdge = edgeByTuple.get(key);
                if (edge.weight !== undefined) {
                    const oldWeight = Number(storedEdge.weight),
                          newWeight = Number(edge.weight);
                    storedEdge.weight = Number.isFinite(oldWeight) && Number.isFinite(newWeight)
                        ? Math.max(oldWeight, newWeight)
                        : edge.weight;
                }
                if (edge.justification && !String(storedEdge.justification || '').includes(edge.justification)) {
                    storedEdge.justification = [storedEdge.justification, edge.justification].filter(Boolean).join(' / ');
                }
            }
        }

        return {
            a2a_version     : payloads[0].a2a_version,
            agent_id        : payloads[0].agent_id,
            session_artifact: {
                feature_namespace     : featureNamespace,
                human_readable_summary: summaries.join(' / '),
                roadmap_impact        : roadmapItems.length > 0 ? roadmapItems.join('\n') : null,
                chunking              : {
                    chunked             : chunkPlan.chunked,
                    totalEstimatedTokens: chunkPlan.totalEstimatedTokens,
                    chunks              : chunkPlan.chunks.map(chunk => ({
                        chunkId        : chunk.chunkId,
                        turnIndices    : chunk.turnIndices,
                        estimatedTokens: chunk.estimatedTokens,
                        oversizedTurn  : chunk.oversizedTurn === true
                    }))
                },
                graph: {
                    nodes: [...nodeByTuple.values()],
                    edges: [...edgeByTuple.values()]
                }
            }
        };
    }

    /**
     * Runs one provider extraction pass for a single Tri-Vector document.
     *
     * @param {Object} options
     * @returns {Promise<Object>} Tri-Vector payload or typed failure descriptor
     * @protected
     */
    async extractTriVectorPayload({
        session,
        document,
        assetRef,
        consumerProvider,
        provider,
        consumerModel,
        consumerContextTokens,
        consumerSafeTokens,
        graphOutputLimitTokens,
        graphReasoningEffort,
        triVectorSchema,
        systemInstruction,
        chunkIndex = 0,
        chunkCount = 1,
        turnIndices = [],
        chunkTokens = null
    }) {
        const messages = [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `--- Session Episodic Memory ---\n${document}` }
        ];

        let maxRetries          = 3;
        let attempt             = 0;
        let payload             = null;
        let result              = null;
        let lastCallDiagnostics = null;

        while (attempt < maxRetries && !payload) {
            attempt++;

            const inputPayload     = this.estimateChatMessagesPayload(messages);
            const inputPayloadText = inputPayload.text;
            const startedAt        = new Date().toISOString();
            const callDiagnostics  = {
                phase                     : 'triVector',
                sessionId                 : session.meta.sessionId,
                assetRef,
                chunkIndex,
                chunkCount,
                turnIndices,
                chunkTokens,
                attempt,
                maxRetries,
                provider                  : consumerProvider,
                model                     : consumerModel,
                promptBytes               : inputPayload.bytes,
                promptTokensEstimate      : inputPayload.tokens,
                outputLimitTokens         : graphOutputLimitTokens,
                contextLimitTokens        : consumerContextTokens,
                safeProcessingLimitTokens : consumerSafeTokens,
                promptPlusOutputTokens    : inputPayload.tokens + graphOutputLimitTokens,
                requestMessageCount       : messages.length,
                requestMessageFingerprints: this.buildTriVectorRequestFingerprints(messages),
                startedAt
            };
            lastCallDiagnostics = callDiagnostics;

            if (callDiagnostics.promptPlusOutputTokens > consumerContextTokens) {
                logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Tri-Vector prompt + output reserve exceeds context cap for session ${session.meta.sessionId}; aborting before provider dispatch.`);

                this.emitRetryLoopContextOverflow({
                    sessionId          : assetRef,
                    consumerModel,
                    consumerContextTokens,
                    consumerSafeTokens,
                    inputBytes         : inputPayload.bytes,
                    inputTokensEstimate: callDiagnostics.promptPlusOutputTokens,
                    note               : `REM Tri-Vector prompt estimate ${inputPayload.tokens} plus output reserve ${graphOutputLimitTokens} exceeds context cap ${consumerContextTokens}. Attempt ${attempt}/${maxRetries}.`
                });

                return this.createTriVectorFailureDescriptor({
                    deferReason       : 'under-band-choke',
                    frictionSymptom   : 'context-overflow',
                    terminalForCadence: true,
                    evidence          : {
                        ...callDiagnostics,
                        note: `REM Tri-Vector prompt estimate ${inputPayload.tokens} plus output reserve ${graphOutputLimitTokens} exceeds context cap ${consumerContextTokens}.`
                    }
                });
            }

            const providerOptions = {
                reasoning_effort   : graphReasoningEffort || undefined,
                responseSchema     : triVectorSchema,
                responseSchemaName : 'triVector',
                maxCompletionTokens: graphOutputLimitTokens,
                operationLabel     : `REM Tri-Vector ${session.meta.sessionId} ${assetRef} attempt ${attempt}/${maxRetries}`,
                operationStage     : 'rem-tri-vector'
            };

            logger.info(
                `[SemanticGraphExtractor] Tri-Vector provider call started: session=${session.meta.sessionId} ` +
                `assetRef=${assetRef} chunk=${chunkIndex + 1}/${chunkCount} attempt=${attempt}/${maxRetries} ` +
                `provider=${consumerProvider} model=${consumerModel} promptTokens=${inputPayload.tokens} ` +
                `outputLimitTokens=${graphOutputLimitTokens} startedAt=${startedAt}.`
            );

            const guardrailed = await invokeWithGuardrail({
                invocationFn             : async () => {
                    this.activeTriVectorCall = callDiagnostics;
                    try {
                        await writeActiveRemCallState(callDiagnostics, {dir: AiConfig.remRunStateDir});
                    } catch (e) {
                        logger.error('[SemanticGraphExtractor] Failed to write active REM Tri-Vector diagnostics:', e);
                    }
                    try {
                        return await provider.generate(messages, providerOptions);
                    } finally {
                        this.activeTriVectorCall = null;
                        try {
                            await clearActiveRemCallState({dir: AiConfig.remRunStateDir});
                        } catch (e) {
                            logger.error('[SemanticGraphExtractor] Failed to clear active REM Tri-Vector diagnostics:', e);
                        }
                    }
                },
                inputPayload             : inputPayloadText,
                model                    : consumerModel,
                assetRef,
                consumer                 : 'SemanticGraphExtractor',
                contextLimitTokens       : consumerContextTokens,
                safeProcessingLimitTokens: consumerSafeTokens,
                serviceDomain            : 'dream-pipeline',
                note                     : `Tri-Vector session-aggregation attempt ${attempt} of ${maxRetries}; outputLimitTokens=${graphOutputLimitTokens}`
            });

            if (!guardrailed.result) {
                logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: invocation guardrail emitted ${guardrailed.friction?.symptom} for session ${session.meta.sessionId}; aborting retry loop.`);

                return this.createTriVectorFailureDescriptor({
                    deferReason       : this.getDeferReasonForFrictionSymptom(guardrailed.friction?.symptom),
                    frictionSymptom   : guardrailed.friction?.symptom,
                    terminalForCadence: true,
                    evidence          : {
                        ...callDiagnostics,
                        attempts                 : attempt,
                        assetRef,
                        emissionPoint            : guardrailed.friction?.emissionPoint,
                        inputBytes               : guardrailed.friction?.inputBytes,
                        inputTokensEstimate      : guardrailed.friction?.inputTokensEstimate,
                        contextLimitTokens       : guardrailed.friction?.contextLimitTokens,
                        safeProcessingLimitTokens: guardrailed.friction?.safeProcessingLimitTokens,
                        note                     : guardrailed.friction?.note
                    }
                });
            }

            result = guardrailed.result;
            const finishReason = this.getCompletionFinishReason(result);

            if (this.isLengthTruncatedCompletion(finishReason)) {
                logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Provider reported '${finishReason}' for session ${session.meta.sessionId}; classifying as context-overflow and aborting JSON repair loop.`);

                this.emitRetryLoopContextOverflow({
                    sessionId          : assetRef,
                    consumerModel,
                    consumerContextTokens,
                    consumerSafeTokens,
                    inputBytes         : inputPayload.bytes,
                    inputTokensEstimate: inputPayload.tokens,
                    note               : `Provider finish_reason='${finishReason}' before schema validation. Aborting repair loop to avoid appending a truncated response. Attempt ${attempt}/${maxRetries}.`
                });

                return this.createTriVectorFailureDescriptor({
                    deferReason       : 'under-band-choke',
                    frictionSymptom   : 'context-overflow',
                    terminalForCadence: true,
                    evidence          : {
                        ...callDiagnostics,
                        attempts           : attempt,
                        assetRef,
                        finishReason,
                        inputBytes         : inputPayload.bytes,
                        inputTokensEstimate: inputPayload.tokens,
                        note               : `Provider finish_reason='${finishReason}' before schema validation.`
                    }
                });
            }

            if (!result?.content || result.content.trim() === '') {
                logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Empty response from provider for session ${session.meta.sessionId}; classifying as context-overflow (silent: no thrown error, no body).`);

                emitConsumerFriction({
                    symptom                  : 'context-overflow',
                    consumer                 : 'SemanticGraphExtractor',
                    model                    : consumerModel,
                    assetRef,
                    serviceDomain            : 'dream-pipeline',
                    emissionPoint            : 'post-invocation-failure',
                    inputBytes               : Buffer.byteLength(inputPayloadText),
                    contextLimitTokens       : consumerContextTokens,
                    safeProcessingLimitTokens: consumerSafeTokens,
                    note                     : `Silent empty-response from provider (no thrown error, no body). Prompt chars: ${inputPayloadText.length}. Attempt ${attempt}/${maxRetries}.`
                });

                return this.createTriVectorFailureDescriptor({
                    deferReason       : 'under-band-choke',
                    frictionSymptom   : 'context-overflow',
                    terminalForCadence: true,
                    evidence          : {
                        ...callDiagnostics,
                        attempts           : attempt,
                        assetRef,
                        inputBytes         : Buffer.byteLength(inputPayloadText),
                        inputTokensEstimate: inputPayload.tokens,
                        note               : `Silent empty-response from provider (no thrown error, no body). Prompt chars: ${inputPayloadText.length}.`
                    }
                });
            }

            payload = Json.extract(result.content);

            if (!payload || !payload.session_artifact) {
                logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Failed to validate extracted Tri-Vector A2A payload for session: ${session.meta.sessionId}`);

                if (attempt < maxRetries) {
                    const repairMessages = [
                        ...messages,
                        { role: 'assistant', content: result.content },
                        { role: 'user', content: 'Your previous response failed internal schema validation. You are missing required keys (e.g., session_artifact) or you provided malformed JSON. Please correct your output and provide ONLY the exact JSON shape requested in the instructions.' }
                    ];
                    const repairPayload = this.estimateChatMessagesPayload(repairMessages);

                    if (repairPayload.tokens > consumerSafeTokens) {
                        logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: JSON repair prompt would exceed safe processing band for session ${session.meta.sessionId}; classifying as context-overflow and aborting retry loop.`);

                        this.emitRetryLoopContextOverflow({
                            sessionId          : assetRef,
                            consumerModel,
                            consumerContextTokens,
                            consumerSafeTokens,
                            inputBytes         : repairPayload.bytes,
                            inputTokensEstimate: repairPayload.tokens,
                            note               : `Repair retry prompt estimate ${repairPayload.tokens} tokens exceeds safe band ${consumerSafeTokens}. Aborting instead of appending assistant output and repair feedback. Attempt ${attempt}/${maxRetries}.`
                        });

                        return this.createTriVectorFailureDescriptor({
                            deferReason       : 'under-band-choke',
                            frictionSymptom   : 'context-overflow',
                            terminalForCadence: true,
                            evidence          : {
                                ...callDiagnostics,
                                attempts           : attempt,
                                assetRef,
                                inputBytes         : repairPayload.bytes,
                                inputTokensEstimate: repairPayload.tokens,
                                note               : `Repair retry prompt estimate ${repairPayload.tokens} tokens exceeds safe band ${consumerSafeTokens}.`
                            }
                        });
                    }

                    logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Injecting autonomous JSON repair feedback loop.`);
                    messages.push(repairMessages[repairMessages.length - 2]);
                    messages.push(repairMessages[repairMessages.length - 1]);
                    payload = null;
                } else {
                    logger.warn(`[SemanticGraphExtractor] --- FINAL EXHAUSTED RAW LLM DUMP ---\n${result.content}\n-----------------------------`);
                }
            } else {
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
            return this.createTriVectorFailureDescriptor({
                deferReason       : 'schema-failure',
                frictionSymptom   : 'parse-failure',
                terminalForCadence: true,
                evidence          : {
                    ...lastCallDiagnostics,
                    attempts: attempt,
                    assetRef,
                    note    : `Tri-Vector schema validation failed after ${attempt} attempt(s).`
                }
            });
        }

        logger.debug(`[SemanticGraphExtractor] Successfully extracted Tri-Vector A2A schema for session ${session.meta.sessionId} after ${attempt} attempts.`);

        return payload;
    }

    /**
     * Commits a reduced Tri-Vector payload to the Native Edge Graph.
     *
     * @summary Anchor & Echo: Chunked extraction completes every chunk before this method runs,
     * preserving the historical single graph-write phase and avoiding partial writes on chunk failure.
     *
     * @param {Object} payload Session-level Tri-Vector payload
     * @param {Object} session Wrapped session object
     * @returns {Promise<Object>} The committed payload
     * @protected
     */
    async commitTriVectorPayload(payload, session) {
        const artifact = payload.session_artifact;

        // Was a hand-written `frontier` spec upserted through plain upsertNode, which carried
        // two defects: the local description had drifted from the boot manifest, making the
        // persisted graph non-manifest-equal so the fresh-target recovery predicate fails
        // closed; and plain upsertNode stamps the caller's identity, leaving the restored hub
        // tenant-scoped where the manifest requires global — the per-tenant invisibility that
        // GraphService#upsertGlobalNode's own docs warn about for shared sentinels.
        GraphService.ensureGlobalBootSeedNode('frontier');

        const VALID_TYPES = ['SESSION', 'MEMORY', 'ARTIFACT_PLAN', 'ARTIFACT_TASK', 'ISSUE', 'STRATEGY', 'SYSTEM_ANCHOR', 'CONCEPT', 'CLASS', 'METHOD', 'FILE', 'GUIDE', 'BLOG', 'TEST'];

        for (const node of artifact.graph.nodes) {
            if (node.id === 'frontier') continue;

            let nodeType = node.type && VALID_TYPES.includes(node.type.toUpperCase()) ? node.type.toUpperCase() : 'CONCEPT';
            let nodeId   = node.id;

            if (!nodeId.includes(':')) {
                const cleanName = (node.name || nodeId).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                nodeId = `${nodeType}:${cleanName}`;
            }
            nodeId = this.normalizeMemorySessionGraphNodeId(nodeId);
            nodeId = canonicalizeSemanticGraphNodeId({id: nodeId, type: nodeType, name: node.name});

            GraphService.upsertNode({
                id              : nodeId,
                type            : nodeType,
                name            : node.name || 'Unknown',
                description     : node.description || '',
                semanticVectorId: session.id,
                properties      : {
                    logical_layer   : node.logical_layer || 'Unknown',
                    stability       : node.stability || 'UNKNOWN',
                    gravity_well    : node.gravity_well === true,
                    strategic_weight: typeof node.strategic_weight === 'number' ? node.strategic_weight : (node.gravity_well ? 1.0 : 0.1),
                    confidence      : typeof node.confidence === 'number' ? node.confidence : 0.5,
                    tags            : Array.isArray(node.tags) ? node.tags : [],
                    context_source  : session.meta.sessionId
                }
            });

            node._resolvedId = nodeId;
        }

        const validNodeRefs = new Set([...artifact.graph.nodes.map(n => n.id), ...artifact.graph.nodes.map(n => n._resolvedId), 'frontier']);

        for (const edge of artifact.graph.edges) {
            let resolvedSource = edge.source;
            let resolvedTarget = edge.target;

            const sourceNode = artifact.graph.nodes.find(n => n.id === edge.source);
            if (sourceNode && sourceNode._resolvedId) resolvedSource = sourceNode._resolvedId;

            const targetNode = artifact.graph.nodes.find(n => n.id === edge.target);
            if (targetNode && targetNode._resolvedId) resolvedTarget = targetNode._resolvedId;

            resolvedSource = this.normalizeMemorySessionGraphNodeId(resolvedSource);
            resolvedTarget = this.normalizeMemorySessionGraphNodeId(resolvedTarget);
            resolvedSource = canonicalizeSemanticGraphNodeId({id: resolvedSource});
            resolvedTarget = canonicalizeSemanticGraphNodeId({id: resolvedTarget});

            const sourceExists = validNodeRefs.has(resolvedSource) || GraphService.db.nodes.has(resolvedSource);
            const targetExists = validNodeRefs.has(resolvedTarget) || GraphService.db.nodes.has(resolvedTarget);

            if (!sourceExists || !targetExists) {
                const isProvenance           = ['MENTIONED_IN', 'DISCUSSED_IN', 'REFERENCED_BY'].includes(edge.relationship);
                const targetsSessionOrMemory = this.isMemorySessionGraphNodeId(resolvedTarget) || this.isMemorySessionGraphNodeId(resolvedSource);

                if (isProvenance && targetsSessionOrMemory) {
                    logger.info(`[SemanticGraphExtractor] Queuing unresolved provenance edge for lazy back-fill: ${resolvedSource} -> ${resolvedTarget}`);
                    const lazyQueueFile = AiConfig.lazyEdgesQueuePath;
                    const edgeData      = JSON.stringify({ ...edge, source: resolvedSource, target: resolvedTarget, timestamp: new Date().toISOString() }) + '\n';
                    try {
                        await fs.promises.mkdir(path.dirname(lazyQueueFile), { recursive: true });
                        await fs.promises.appendFile(lazyQueueFile, edgeData, 'utf8');
                    } catch (err) {
                        logger.error('[SemanticGraphExtractor] Failed to queue lazy edge:', err);
                    }
                    continue;
                }

                logger.warn(`[SemanticGraphExtractor] Culling hallucinated edge from ${resolvedSource} to ${resolvedTarget}`);
                continue;
            }

            GraphService.linkNodes(
                resolvedSource,
                resolvedTarget,
                edge.relationship || 'RELATES_TO',
                edge.weight !== undefined ? parseFloat(edge.weight) : 1.0,
                {
                    justification : edge.justification || '',
                    context_source: session.meta.sessionId
                }
            );
        }

        logger.info(`[SemanticGraphExtractor] Graph entities committed to Neocortex for session ${session.meta.sessionId}.`);

        if (artifact.roadmap_impact && typeof artifact.roadmap_impact === 'string' && artifact.roadmap_impact.toLowerCase() !== 'null') {
            const auditLog      = path.join('/tmp', 'roadmap_audits.log');
            const strategyEntry = `[${new Date().toISOString()}] Session ${session.meta.sessionId}:\n${artifact.roadmap_impact}\n\n`;
            await fs.promises.appendFile(auditLog, strategyEntry, 'utf8');
            logger.info(`[SemanticGraphExtractor] Extracted Strategy impact to roadmap_audits.log`);
        }

        return payload;
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
     * @returns {Promise<Object>} The extracted payload, or `{ok:false, ...}` on failure
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
            const graphProvider = resolveGraphModelProvider(AiConfig);
            const provider      = this.buildConfiguredGraphProvider(graphProvider);

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
            const consumerModel = graphProvider === 'ollama' ? AiConfig.ollama.model : AiConfig.openAiCompatible.model;
            const {
                contextLimitTokens,
                safeProcessingLimitTokens,
                graphOutputLimitTokens,
                graphReasoningEffort
            } = AiConfig.localModels.chat;

            // Per-task no-think + grammar-constrained tri-vector output. `graphReasoningEffort`
            // (default 'none') disables the gemma MoE's hidden thinking pass; `triVectorSchema` enforces
            // the A2A session_artifact/graph shape via the provider's json_schema path, which makes the
            // repair-retry loop below a safety net rather than the happy path. Schema mirrors the strict
            // shape declared in the systemInstruction above.
            const triVectorSchema = {
                type      : 'object',
                properties: {
                    a2a_version     : {type: 'string'},
                    agent_id        : {type: 'string'},
                    session_artifact: {
                        type      : 'object',
                        properties: {
                            feature_namespace     : {type: ['string', 'null']},
                            human_readable_summary: {type: 'string'},
                            roadmap_impact        : {type: ['string', 'null']},
                            graph                 : {
                                type      : 'object',
                                properties: {
                                    nodes: {type: 'array', items: {
                                        type      : 'object',
                                        properties: {
                                            id              : {type: 'string'},
                                            type            : {type: 'string'},
                                            name            : {type: 'string'},
                                            description     : {type: 'string'},
                                            logical_layer   : {type: 'string'},
                                            stability       : {type: 'string'},
                                            gravity_well    : {type: 'boolean'},
                                            strategic_weight: {type: 'number'},
                                            confidence      : {type: 'number'},
                                            tags            : {type: 'array', items: {type: 'string'}}
                                        },
                                        required: ['id', 'type', 'name', 'description']
                                    }},
                                    edges: {type: 'array', items: {
                                        type      : 'object',
                                        properties: {
                                            source       : {type: 'string'},
                                            target       : {type: 'string'},
                                            relationship : {type: 'string'},
                                            weight       : {type: 'number'},
                                            justification: {type: 'string'}
                                        },
                                        required: ['source', 'target', 'relationship']
                                    }}
                                },
                                required: ['nodes', 'edges']
                            }
                        },
                        required: ['feature_namespace', 'human_readable_summary', 'graph']
                    }
                },
                required: ['a2a_version', 'session_artifact']
            };
            const chunkPlan = this.createTriVectorChunks(session, systemInstruction);
            let   payload;

            if (chunkPlan.chunked) {
                logger.info(`[SemanticGraphExtractor] Tri-Vector chunking activated for session ${session.meta.sessionId}: ${chunkPlan.chunks.length} chunk(s), estimated ${chunkPlan.totalEstimatedTokens} tokens.`);
                const chunkPayloads = [];

                for (let index = 0; index < chunkPlan.chunks.length; index++) {
                    const chunk  = chunkPlan.chunks[index],
                          result = await this.extractTriVectorPayload({
                              session,
                              document             : chunk.text,
                              assetRef             : chunk.chunkId,
                              consumerProvider     : graphProvider,
                              provider,
                              consumerModel,
                              consumerContextTokens: contextLimitTokens,
                              consumerSafeTokens   : safeProcessingLimitTokens,
                              graphOutputLimitTokens,
                              graphReasoningEffort,
                              triVectorSchema,
                              systemInstruction,
                              chunkIndex           : index,
                              chunkCount           : chunkPlan.chunks.length,
                              turnIndices          : chunk.turnIndices,
                              chunkTokens          : chunk.estimatedTokens
                          });

                    if (this.isTriVectorFailureDescriptor(result)) {
                        logger.warn(`[SemanticGraphExtractor] Tri-Vector chunk ${index + 1}/${chunkPlan.chunks.length} failed for session ${session.meta.sessionId}; aborting reduce before graph commit.`);
                        return this.addChunkFailureEvidence(result, chunk, index, chunkPlan.chunks.length);
                    }

                    chunkPayloads.push(result);
                }

                payload = this.reduceTriVectorPayloads(chunkPayloads, chunkPlan);
            } else {
                payload = await this.extractTriVectorPayload({
                    session,
                    document             : session.document,
                    assetRef             : session.meta.sessionId,
                    consumerProvider     : graphProvider,
                    provider,
                    consumerModel,
                    consumerContextTokens: contextLimitTokens,
                    consumerSafeTokens   : safeProcessingLimitTokens,
                    graphOutputLimitTokens,
                    graphReasoningEffort,
                    triVectorSchema,
                    systemInstruction
                });

                if (this.isTriVectorFailureDescriptor(payload)) {
                    return payload;
                }
            }

            return await this.commitTriVectorPayload(payload, session);

        } catch (error) {
            if (error.message && error.message.includes('fetch failed')) {
                logger.debug(`[SemanticGraphExtractor] Skipping extraction (API provider offline).`);
            } else {
                logger.error('[SemanticGraphExtractor] Error during graph extraction run:', error);
            }
            return this.createTriVectorFailureDescriptor({
                deferReason       : 'schema-failure',
                frictionSymptom   : 'parse-failure',
                terminalForCadence: false,
                evidence          : {
                    errorMessage: error?.message ? String(error.message) : String(error)
                }
            });
        }
    }

    /**
     * Extracts and canonicalizes semantic concept IDs from one message body.
     *
     * This is a retained direct/test helper, not the production message-discovery path.
     * It performs no graph upsert and writes no `TAGGED_CONCEPT` edge; no runtime caller
     * invokes it. Current discovery is the orchestrator-scheduled, bounded
     * `ConceptDiscoveryService.runMessageConceptHarvest()` flow, while MailboxService
     * projects only explicit curated `taggedConcepts` in its hot path.
     *
     * Historical graph rows may still carry `properties.auto_extracted: true` and a
     * `TAGGED_CONCEPT` edge at weight `0.8`; those are legacy provenance, not evidence
     * that inline extraction remains active.
     *
     * @param {String} bodyText The message content to analyze
     * @returns {Promise<String[]>} Array of extracted Concept Node IDs
     * @see learn/agentos/ConceptOntology.md § Curated Tags, Historical Extraction, and Scheduled Discovery
     * @see Neo.ai.daemons.services.ConceptDiscoveryService#runMessageConceptHarvest
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
            const graphProvider = resolveGraphModelProvider(AiConfig);
            const provider      = this.buildConfiguredGraphProvider(graphProvider);

            const messages = [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `--- Message Body ---\n${bodyText}` }
            ];

            let maxRetries = 2;
            let attempt    = 0;
            let payload    = null;

            while (attempt < maxRetries && !payload) {
                attempt++;
                const result = await provider.generate(messages);
                payload = Json.extract(result.content);

                if (!payload || !Array.isArray(payload.concepts)) {
                    logger.warn(`[SemanticGraphExtractor] Attempt ${attempt}: Failed to validate extracted concepts schema for message.`);
                    if (attempt < maxRetries) {
                        messages.push({ role: 'assistant', content: result.content });
                        messages.push({
                            role   : 'user',
                            content: `Your previous response failed internal schema validation. You are either missing the 'concepts' array or provided malformed JSON. Please correct your output and provide ONLY the exact JSON shape requested.`
                        });
                        payload = null;
                    }
                }
            }

            if (!payload || !Array.isArray(payload.concepts)) {
                return [];
            }

            const validConcepts = canonicalizeTaggedConceptIds(payload.concepts.filter(c => typeof c === 'string' && c.includes(':')));
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
