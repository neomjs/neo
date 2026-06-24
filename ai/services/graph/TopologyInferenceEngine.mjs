import fs                                              from 'fs';
import path                                            from 'path';
import { Memory_Config as aiConfig }                   from '../../services.mjs';
import Base                                            from '../../../src/core/Base.mjs';
import Json                                            from '../../../src/util/Json.mjs';
import logger                                          from '../../mcp/server/memory-core/logger.mjs';
import {emitConsumerFriction}                          from '../memory-core/helpers/consumerFrictionHelper.mjs';
import {buildGraphProvider, resolveGraphModelProvider} from './providerDispatch.mjs';

const
    conflictEntryRegex          = /^- \*\*\[(SUPERSEDES|OBSOLETES|DUPLICATE)\]\*\* `([^`]+)`: (.*?) \(Source Session: ([^)]+)\)$/gm,
    topologyConflictRenderLimit = 5;

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
     * Dedicated inference pass to scan episodic memory explicitly for topological conflicts
     * (e.g. tracking when an OPEN issue is superseded or rendered obsolete by recent session decisions).
     * @param {String} contextText The raw session episodic document.
     * @param {String} sessionId The ID of the session being processed.
     */
    async extractTopology(contextText, sessionId) {
        logger.info(`[TopologyInferenceEngine] Extracting Topological Conflicts for session ID: ${sessionId}`);

        const prompt = `
You are the Neo.mjs REM Sandman. Analyze the following session history for strict topological conflicts.
A topological conflict occurs primarily when the user and agent realize an OPEN GitHub ticket/issue has been rendered obsolete, superseded, or is a duplicate.

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

--- Session Episodic Memory ---
${contextText}
`;
        try {
            const graphProvider = resolveGraphModelProvider(aiConfig);
            const provider      = buildGraphProvider({
                modelProvider         : graphProvider,
                ollamaConfig          : aiConfig.ollama,
                openAiCompatibleConfig: aiConfig.openAiCompatible
            });

            const result = await provider.generate(prompt);

            // Silent context-overflow detection (parallel single-attempt path): empty
            // result.content with no thrown error is the LM Studio loaded-context-cap
            // signature (ttftMs===ttltMs, outputChars===0). Emit the deterministic
            // `'context-overflow'` symptom (auto-surfaces) and return early to avoid
            // downstream null-payload handling on empty input.
            if (!result?.content || result.content.trim() === '') {
                logger.warn(`[TopologyInferenceEngine] Empty response from provider for session ${sessionId}; classifying as context-overflow (silent: no thrown error, no body).`);

                emitConsumerFriction({
                    symptom                  : 'context-overflow',
                    consumer                 : 'TopologyInferenceEngine',
                    model                    : aiConfig[graphProvider].model,
                    assetRef                 : sessionId,
                    serviceDomain            : 'dream-pipeline',
                    emissionPoint            : 'post-invocation-failure',
                    inputBytes               : Buffer.byteLength(prompt),
                    contextLimitTokens       : aiConfig.localModels.chat.contextLimitTokens,
                    safeProcessingLimitTokens: aiConfig.localModels.chat.safeProcessingLimitTokens,
                    note                     : `Silent empty-response from provider (no thrown error, no body). Prompt chars: ${prompt.length}.`
                });

                return;
            }

            const payload = Json.extract(result.content);
            if (!payload || !Array.isArray(payload.conflicts) || payload.conflicts.length === 0) {
                return;
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

            const {content, changed} = this.mergeConflictAlerts(handoffContent, payload.conflicts, sessionId);

            if (changed) {
                await fs.promises.mkdir(path.dirname(handoffFile), {recursive: true});
                await fs.promises.writeFile(tmpFile, content, 'utf8');
                await fs.promises.rename(tmpFile, handoffFile);
                logger.info(`[TopologyInferenceEngine] Registered new topological conflicts to sandman_handoff.md for session ${sessionId}.`);
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
