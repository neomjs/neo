import fs                            from 'fs';
import path                          from 'path';
import { Memory_Config as aiConfig } from '../../services.mjs';
import Base                          from '../../../src/core/Base.mjs';
import Json                          from '../../../src/util/Json.mjs';
import logger                        from '../../mcp/server/memory-core/logger.mjs';
import {
    bytesToTokens,
    emitConsumerFriction,
    invokeWithGuardrail
}                                                       from '../memory-core/helpers/consumerFrictionHelper.mjs';
import {buildGraphProvider, resolveGraphModelProvider} from './providerDispatch.mjs';
import {chunkSession}                                  from './sessionChunker.mjs';

const
    conflictEntryRegex          = /^- \*\*\[(SUPERSEDES|OBSOLETES|DUPLICATE)\]\*\* `([^`]+)`: (.*?) \(Source Session: ([^)]+)\)$/gm,
    topologyConflictRenderLimit = 5,
    topologyConflictSchema      = {
        type      : 'object',
        properties: {
            conflicts: {
                type    : 'array',
                maxItems: topologyConflictRenderLimit,
                items   : {
                    type      : 'object',
                    properties: {
                        issueId    : {type: 'string', maxLength: 64},
                        type       : {type: 'string', enum: ['SUPERSEDES', 'OBSOLETES', 'DUPLICATE']},
                        description: {type: 'string', maxLength: 240}
                    },
                    required            : ['issueId', 'type', 'description'],
                    additionalProperties: false
                }
            }
        },
        required            : ['conflicts'],
        additionalProperties: false
    };

function estimateTopologyTokens(text) {
    return bytesToTokens(Buffer.byteLength(text === undefined || text === null ? '' : String(text), 'utf8'));
}

function assertRequiredChatNumber(value, configPath) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`[TopologyInferenceEngine] Required AiConfig leaf "${configPath}" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.`);
    }

    return value;
}

function assertRequiredChatString(value, configPath) {
    if (typeof value !== 'string') {
        throw new Error(`[TopologyInferenceEngine] Required AiConfig leaf "${configPath}" is missing or invalid. Update ai/mcp/server/memory-core/config.mjs from config.template.mjs.`);
    }

    return value;
}

function getCompletionFinishReason(result) {
    return result?.finish_reason ||
        result?.finishReason ||
        result?.raw?.finish_reason ||
        result?.raw?.finishReason ||
        result?.raw?.choices?.[0]?.finish_reason ||
        result?.raw?.choices?.[0]?.finishReason ||
        result?.raw?.done_reason ||
        result?.raw?.doneReason ||
        '';
}

function isLengthTruncatedCompletion(finishReason) {
    return ['length', 'max_tokens', 'max_completion_tokens', 'num_predict', 'token_limit']
        .includes(String(finishReason || '').toLowerCase());
}

/**
 * @class Neo.ai.daemons.services.TopologyInferenceEngine
 * @extends Neo.core.Base
 * @singleton
 */
class TopologyInferenceEngine extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.TopologyInferenceEngine'
         * @protected
         */
        className: 'Neo.ai.daemons.services.TopologyInferenceEngine',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Parses existing topological conflict handoff entries.
     * @param {String} content Current handoff markdown.
     * @returns {Object[]} Parsed conflict entries.
     */
    parseConflictEntries(content) {
        return [...content.matchAll(conflictEntryRegex)].map(match => ({
            type       : match[1],
            issueId    : match[2],
            description: match[3],
            sessionId  : match[4]
        }))
    }

    /**
     * @summary Renders one canonical topological conflict handoff entry.
     * @param {Object} conflict Conflict entry.
     * @returns {String}
     */
    renderConflictEntry(conflict) {
        return `- **[${conflict.type}]** \`${conflict.issueId}\`: ${conflict.description} (Source Session: ${conflict.sessionId})`
    }

    /**
     * @summary Merges new conflicts into the handoff while keeping the alert list bounded.
     *
     * New conflicts win ordering, then still-relevant existing alerts are retained up to the
     * compact handoff cap. Existing lines are rewritten as one bounded block so prior unbounded
     * REM cycles are pruned the next time a conflict pass writes the file.
     *
     * @param {String} handoffContent Current handoff markdown.
     * @param {Object[]} conflicts New provider conflicts.
     * @param {String} sessionId Source session id for new conflicts.
     * @returns {{content: String, changed: Boolean}}
     */
    mergeConflictAlerts(handoffContent, conflicts, sessionId) {
        const existing = this.parseConflictEntries(handoffContent),
              merged   = [],
              seen     = new Set();

        for (const conflict of conflicts) {
            if (seen.has(conflict.issueId)) continue;
            merged.push({...conflict, sessionId});
            seen.add(conflict.issueId);
        }

        for (const conflict of existing) {
            if (seen.has(conflict.issueId)) continue;
            merged.push(conflict);
            seen.add(conflict.issueId);
        }

        const bounded  = merged.slice(0, topologyConflictRenderLimit),
              stripped = handoffContent.replace(conflictEntryRegex, '').replace(/\n{3,}/g, '\n\n').trimEnd(),
              block    = bounded.map(conflict => this.renderConflictEntry(conflict)).join('\n');

        if (!block) {
            return {content: stripped + '\n', changed: existing.length > 0}
        }

        const insertIndex = stripped.indexOf('## Computed Golden Path');
        let content;

        if (insertIndex !== -1) {
            content = `${stripped.substring(0, insertIndex).trimEnd()}\n\n${block}\n\n${stripped.substring(insertIndex)}`;
        } else {
            content = `${stripped}\n\n${block}`;
        }

        return {
            content: `${content.trimEnd()}\n`,
            changed: true
        }
    }

    /**
     * @summary Builds the bounded topology-conflict prompt for one turn-aligned chunk.
     * @param {String} contextText Turn-aligned chunk text.
     * @param {Object} chunkInfo Chunk provenance.
     * @returns {String}
     */
    buildTopologyPrompt(contextText, chunkInfo = {}) {
        const chunkLine = chunkInfo.chunked
            ? `Chunk ${chunkInfo.index + 1}/${chunkInfo.chunkCount}; source turn indices: ${chunkInfo.turnIndices.join(', ')}.`
            : 'Single-pass session payload.';

        return `
You are the Neo.mjs REM Sandman. Analyze the following session history chunk for strict topological conflicts.
A topological conflict occurs only when the session explicitly establishes that an OPEN GitHub ticket/issue has been rendered obsolete, superseded, or is a duplicate.

Return at most ${topologyConflictRenderLimit} highest-confidence conflicts for this chunk. Keep descriptions concise.
Do not infer conflicts from missing earlier or later chunks.

Enforce this STRICT JSON schema:
{
  "conflicts": [
    {
      "issueId": "String (e.g. issue-1234)",
      "type": "String (SUPERSEDES, OBSOLETES, DUPLICATE)",
      "description": "String (Why is there a conflict?)"
    }
  ]
}

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object. If there are no conflicts, output {"conflicts": []}.

--- Session Episodic Memory (${chunkLine}) ---
${contextText}
`;
    }

    /**
     * @summary Creates deterministic turn chunks after reserving topology output and prompt overhead.
     * @param {String[]} turnDocuments Complete raw memory turn documents.
     * @param {String} sessionId Source session id.
     * @returns {{chunked: Boolean, totalEstimatedTokens: Number, chunks: Object[]}}
     */
    createTopologyChunks(turnDocuments, sessionId) {
        const envelopeTokens = estimateTopologyTokens(this.buildTopologyPrompt('', {
                  chunked    : true,
                  index      : 0,
                  chunkCount : 1,
                  turnIndices: []
              })),
              {
                  contextLimitTokens,
                  safeProcessingLimitTokens,
                  graphChunkLimitTokens,
                  graphOutputLimitTokens
              } = aiConfig.localModels.chat,
              promptBudget   = Math.min(
                  assertRequiredChatNumber(graphChunkLimitTokens, 'localModels.chat.graphChunkLimitTokens'),
                  assertRequiredChatNumber(safeProcessingLimitTokens, 'localModels.chat.safeProcessingLimitTokens'),
                  assertRequiredChatNumber(contextLimitTokens, 'localModels.chat.contextLimitTokens') -
                      assertRequiredChatNumber(graphOutputLimitTokens, 'localModels.chat.graphOutputLimitTokens')
              ),
              chunkBudget    = Math.max(1, promptBudget - envelopeTokens);

        return chunkSession(turnDocuments, {
            sessionId,
            safeProcessingLimitTokens: chunkBudget,
            estimate                 : estimateTopologyTokens
        });
    }

    /**
     * @summary Returns provider options that bound topology output across graph providers.
     * @returns {Object} Provider generation options.
     */
    getTopologyProviderOptions() {
        return {
            reasoning_effort    : assertRequiredChatString(aiConfig.localModels.chat.graphReasoningEffort, 'localModels.chat.graphReasoningEffort'),
            responseSchema      : topologyConflictSchema,
            responseSchemaName  : 'topologyConflicts',
            responseSchemaStrict: true,
            maxCompletionTokens : assertRequiredChatNumber(aiConfig.localModels.chat.graphOutputLimitTokens, 'localModels.chat.graphOutputLimitTokens')
        }
    }

    /**
     * Dedicated inference pass to scan episodic memory explicitly for topological conflicts
     * (e.g. tracking when an OPEN issue is superseded or rendered obsolete by recent session decisions).
     * @param {String} contextText The raw session episodic document.
     * @param {String} sessionId The ID of the session being processed.
     * @param {Object} [options]
     * @param {String[]} [options.turnDocuments] Complete raw memory turn documents, preserving turn boundaries.
     * @returns {Promise<Object|undefined>} Topology extraction summary.
     */
    async extractTopology(contextText, sessionId, options = {}) {
        logger.info(`[TopologyInferenceEngine] Extracting Topological Conflicts for session ID: ${sessionId}`);

        try {
            const turnDocuments = Array.isArray(options.turnDocuments) && options.turnDocuments.length > 0
                ? options.turnDocuments
                : [contextText];
            const chunkPlan = this.createTopologyChunks(turnDocuments, sessionId);

            const graphProvider = resolveGraphModelProvider(aiConfig),
                  provider      = buildGraphProvider({
                modelProvider         : graphProvider,
                ollamaConfig          : aiConfig.ollama,
                openAiCompatibleConfig: aiConfig.openAiCompatible
            }),
                  consumerModel         = aiConfig[graphProvider].model,
                  consumerContextTokens = assertRequiredChatNumber(aiConfig.localModels.chat.contextLimitTokens, 'localModels.chat.contextLimitTokens'),
                  consumerSafeTokens    = assertRequiredChatNumber(aiConfig.localModels.chat.safeProcessingLimitTokens, 'localModels.chat.safeProcessingLimitTokens'),
                  outputLimitTokens     = assertRequiredChatNumber(aiConfig.localModels.chat.graphOutputLimitTokens, 'localModels.chat.graphOutputLimitTokens'),
                  providerOptions       = this.getTopologyProviderOptions(),
                  conflicts             = [];

            let parseFailedChunks = 0,
                skippedChunks     = 0;

            for (let index = 0; index < chunkPlan.chunks.length; index++) {
                const chunk  = chunkPlan.chunks[index],
                      prompt = this.buildTopologyPrompt(chunk.text, {
                          chunked    : chunkPlan.chunked,
                          index,
                          chunkCount : chunkPlan.chunks.length,
                          turnIndices: chunk.turnIndices
                      }),
                      promptBytes          = Buffer.byteLength(prompt, 'utf8'),
                      promptTokensEstimate = estimateTopologyTokens(prompt),
                      promptPlusOutput     = promptTokensEstimate + outputLimitTokens,
                      chunkLabel           = `${index + 1}/${chunkPlan.chunks.length}`;

                if (promptPlusOutput > consumerContextTokens) {
                    logger.warn(
                        `[TopologyInferenceEngine] Chunk ${chunkLabel} for session ${sessionId} exceeds context cap before dispatch: ` +
                        `promptTokens=${promptTokensEstimate} outputLimitTokens=${outputLimitTokens} contextLimitTokens=${consumerContextTokens}.`
                    );

                    emitConsumerFriction({
                        symptom                  : 'context-overflow',
                        consumer                 : 'TopologyInferenceEngine',
                        model                    : consumerModel,
                        assetRef                 : chunk.chunkId,
                        serviceDomain            : 'dream-pipeline',
                        emissionPoint            : 'pre-invocation',
                        inputBytes               : promptBytes,
                        inputTokensEstimate      : promptPlusOutput,
                        contextLimitTokens       : consumerContextTokens,
                        safeProcessingLimitTokens: consumerSafeTokens,
                        note                     : `Topology prompt estimate ${promptTokensEstimate} plus output reserve ${outputLimitTokens} exceeds context cap ${consumerContextTokens}. Chunk ${chunkLabel}.`
                    });

                    skippedChunks++;
                    continue;
                }

                const guardrailed = await invokeWithGuardrail({
                    invocationFn             : () => provider.generate(prompt, {
                        ...providerOptions,
                        operationLabel: `REM topology ${sessionId} chunk ${chunkLabel}`
                    }),
                    inputPayload             : prompt,
                    model                    : consumerModel,
                    assetRef                 : chunk.chunkId,
                    consumer                 : 'TopologyInferenceEngine',
                    contextLimitTokens       : consumerContextTokens,
                    safeProcessingLimitTokens: consumerSafeTokens,
                    serviceDomain            : 'dream-pipeline',
                    note                     : `Topological conflict chunk ${index + 1}/${chunkPlan.chunks.length}`
                });

                if (!guardrailed.result) {
                    skippedChunks++;
                    logger.warn(`[TopologyInferenceEngine] Chunk ${chunkLabel} for session ${sessionId} skipped by ${guardrailed.friction?.symptom || 'guardrail'}.`);
                    continue;
                }

                const result       = guardrailed.result;
                const finishReason = getCompletionFinishReason(result),
                      responseChars = String(result.content || '').length;

                if (isLengthTruncatedCompletion(finishReason)) {
                    logger.warn(`[TopologyInferenceEngine] Provider reported finish_reason='${finishReason}' for session ${sessionId} chunk ${chunkLabel}; classifying as context-overflow before parsing.`);

                    emitConsumerFriction({
                        symptom                  : 'context-overflow',
                        consumer                 : 'TopologyInferenceEngine',
                        model                    : consumerModel,
                        assetRef                 : chunk.chunkId,
                        serviceDomain            : 'dream-pipeline',
                        emissionPoint            : 'post-invocation-failure',
                        inputBytes               : promptBytes,
                        inputTokensEstimate      : promptTokensEstimate,
                        contextLimitTokens       : consumerContextTokens,
                        safeProcessingLimitTokens: consumerSafeTokens,
                        note                     : `Topology provider finish_reason='${finishReason}' before schema validation. Chunk ${chunkLabel}; responseChars=${responseChars}; outputLimitTokens=${outputLimitTokens}.`
                    });

                    skippedChunks++;
                    continue;
                }

                // Silent context-overflow detection (parallel single-attempt path): empty
                // result.content with no thrown error is the LM Studio loaded-context-cap
                // signature (ttftMs===ttltMs, outputChars===0). Emit the deterministic
                // `'context-overflow'` symptom (auto-surfaces) and continue with the next
                // turn-aligned chunk instead of retry-amplifying the same prompt.
                if (!result?.content || result.content.trim() === '') {
                    logger.warn(`[TopologyInferenceEngine] Empty response from provider for session ${sessionId} chunk ${chunkLabel}; classifying as context-overflow (silent: no thrown error, no body).`);

                    emitConsumerFriction({
                        symptom                  : 'context-overflow',
                        consumer                 : 'TopologyInferenceEngine',
                        model                    : consumerModel,
                        assetRef                 : chunk.chunkId,
                        serviceDomain            : 'dream-pipeline',
                        emissionPoint            : 'post-invocation-failure',
                        inputBytes               : promptBytes,
                        inputTokensEstimate      : promptTokensEstimate,
                        contextLimitTokens       : consumerContextTokens,
                        safeProcessingLimitTokens: consumerSafeTokens,
                        note                     : `Silent empty-response from provider (no thrown error, no body). Chunk ${chunkLabel}; prompt chars: ${prompt.length}; outputLimitTokens=${outputLimitTokens}.`
                    });

                    skippedChunks++;
                    continue;
                }

                const payload = Json.extract(result.content);
                if (!payload || !Array.isArray(payload.conflicts)) {
                    parseFailedChunks++;
                    logger.warn(`[TopologyInferenceEngine] Failed to parse topology-conflict payload for session ${sessionId} chunk ${chunkLabel}; responseChars=${responseChars}; finishReason=${finishReason || 'unknown'}.`);

                    emitConsumerFriction({
                        symptom                  : 'parse-failure',
                        consumer                 : 'TopologyInferenceEngine',
                        model                    : consumerModel,
                        assetRef                 : chunk.chunkId,
                        serviceDomain            : 'dream-pipeline',
                        emissionPoint            : 'post-invocation-failure',
                        suggestionKind           : 'schema-repair',
                        inputBytes               : promptBytes,
                        inputTokensEstimate      : promptTokensEstimate,
                        contextLimitTokens       : consumerContextTokens,
                        safeProcessingLimitTokens: consumerSafeTokens,
                        note                     : `Topology response did not match {conflicts:Array}. Chunk ${chunkLabel}; responseChars=${responseChars}; finishReason=${finishReason || 'unknown'}; outputLimitTokens=${outputLimitTokens}.`
                    });

                    continue;
                }

                logger.info(
                    `[TopologyInferenceEngine] Topology chunk ${chunkLabel} for session ${sessionId} completed: ` +
                    `conflicts=${payload.conflicts.length} responseChars=${responseChars} ` +
                    `finishReason=${finishReason || 'unknown'} outputLimitTokens=${outputLimitTokens}.`
                );

                if (payload.conflicts.length > 0) {
                    conflicts.push(...payload.conflicts.slice(0, topologyConflictRenderLimit));
                }
            }

            if (conflicts.length === 0) {
                logger.info(
                    `[TopologyInferenceEngine] Topology extraction completed for session ${sessionId}: ` +
                    `conflicts=0 processed=${chunkPlan.chunks.length - skippedChunks - parseFailedChunks}/${chunkPlan.chunks.length} ` +
                    `skipped=${skippedChunks} parseFailed=${parseFailedChunks} outputLimitTokens=${outputLimitTokens}.`
                );

                return {
                    chunked: chunkPlan.chunked,
                    chunks : {
                        total      : chunkPlan.chunks.length,
                        skipped    : skippedChunks,
                        parseFailed: parseFailedChunks,
                        processed  : chunkPlan.chunks.length - skippedChunks - parseFailedChunks
                    },
                    conflictCount: 0
                }
            }

            // Write to sandman_handoff.md
            const handoffFile = aiConfig.handoffFilePath;
            const tmpFile = `${handoffFile}.tmp`;

            let handoffContent = '';
            try {
                handoffContent = await fs.promises.readFile(handoffFile, 'utf8');
            } catch (e) {
                handoffContent = '# Sandman Handoff Alerts\n\nThis file tracks topological conflict alerts generated during overnight REM sleep cycles. Agents MUST reconcile these conflicts structurally upon startup.\n\n## Active Conflicts\n\n';
            }

            const {content, changed} = this.mergeConflictAlerts(handoffContent, conflicts, sessionId);

            if (changed) {
                await fs.promises.mkdir(path.dirname(handoffFile), {recursive: true});
                await fs.promises.writeFile(tmpFile, content, 'utf8');
                await fs.promises.rename(tmpFile, handoffFile);
                logger.info(`[TopologyInferenceEngine] Registered new topological conflicts to sandman_handoff.md for session ${sessionId}.`);
            }

            return {
                chunked: chunkPlan.chunked,
                chunks : {
                    total      : chunkPlan.chunks.length,
                    skipped    : skippedChunks,
                    parseFailed: parseFailedChunks,
                    processed  : chunkPlan.chunks.length - skippedChunks - parseFailedChunks
                },
                conflictCount: conflicts.length
            }

        } catch (error) {
            if (error.message && error.message.includes('fetch failed')) {
                logger.debug('[TopologyInferenceEngine] Skipping topology extraction (API provider offline).');
            } else {
                logger.error('[TopologyInferenceEngine] Error during topology extraction:', error);
            }
        }
    }

    /**
     * @summary Count topological-conflict entries emitted to `sandman_handoff.md`.
     * This is **Axis D** of the 5-axis REM observability model: the count of
     * conflicts the engine has actually written to the handoff file, which is
     * the durable substrate consumers (next-session agents) read at boot.
     *
     * Counts lines matching the canonical conflict-entry suffix `(Source Session:`
     * — each conflict entry in `sandman_handoff.md` follows the shape
     * `- **[<TYPE>]** \`<issueId>\`: <description> (Source Session: <sessionId>)`
     * (see {@link #extractTopology} line 83 for the writer). The suffix is
     * distinctive enough to avoid false positives from Golden Path or other
     * handoff sections.
     *
     * **Important divergence semantic:** `extractTopology()` returns `undefined`
     * (void) on both no-conflicts AND provider-error paths — meaning a zero
     * count here does NOT distinguish "no conflicts detected" from "topology
     * extraction silently failed for every session." The unified REM cycle
     * state model closes this distinction by tracking per-cycle topology outcome
     * explicitly.
     *
     * Returns 0 on file-not-found, empty file, or read error — consistent with
     * sibling axis-count helpers' graceful-degradation contract.
     *
     * @returns {Promise<Number>} Count of conflict entries in `sandman_handoff.md`;
     *     0 if file absent / empty / unreadable
     */
    async getTopologyConflictCount() {
        const handoffFile = aiConfig.handoffFilePath;
        if (!handoffFile) return 0;

        try {
            const content = await fs.promises.readFile(handoffFile, 'utf8');
            const matches = content.match(/\(Source Session:/g);
            return matches ? matches.length : 0;
        } catch (e) {
            if (e.code === 'ENOENT') return 0;
            logger.warn('[TopologyInferenceEngine] getTopologyConflictCount failed:', e?.message ?? e);
            return 0;
        }
    }
}

export default Neo.setupClass(TopologyInferenceEngine);
