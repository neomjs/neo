import fs from 'fs';
import { Memory_Config as aiConfig } from '../../services.mjs';
import Base from '../../../src/core/Base.mjs';
import Json from '../../../src/util/Json.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import OpenAiCompatible from '../../provider/OpenAiCompatible.mjs';

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
            const provider = Neo.create(OpenAiCompatible, {
                modelName: aiConfig.openAiCompatible.model,
                host: aiConfig.openAiCompatible.host
            });

            const result = await provider.generate(prompt);

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

            let newAlerts = false;
            for (const conflict of payload.conflicts) {
                const entry = `- **[${conflict.type}]** \`${conflict.issueId}\`: ${conflict.description} (Source Session: ${sessionId})\n`;
                const anyConflictIdentifier = `\`${conflict.issueId}\`:`;
                if (!handoffContent.includes(anyConflictIdentifier)) {
                    let insertIndex = handoffContent.indexOf('## Computed Golden Path');
                    if (insertIndex !== -1) {
                        handoffContent = handoffContent.substring(0, insertIndex) + entry + '\n\n' + handoffContent.substring(insertIndex);
                    } else {
                        handoffContent += entry;
                    }
                    newAlerts = true;
                }
            }

            if (newAlerts) {
                await fs.promises.writeFile(tmpFile, handoffContent, 'utf8');
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
}

export default Neo.setupClass(TopologyInferenceEngine);
