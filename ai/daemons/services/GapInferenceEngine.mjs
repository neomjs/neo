import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import { Memory_Config as aiConfig } from '../../services.mjs';
import Base from '../../../src/core/Base.mjs';
import { Memory_GraphService as GraphService } from '../../services.mjs';
import Json from '../../../src/util/Json.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import OpenAiCompatible from '../../provider/OpenAiCompatible.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @class Neo.ai.daemons.services.GapInferenceEngine
 * @extends Neo.core.Base
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
     * Executes Capability Gap Inference natively via dynamic filesystem evaluation mathematically (bypassing LLM hallucinations).
     * @param {Object} session The wrapped session object
     * @param {Object} payload The parsed Tri-Vector schema
     */
    async executeCapabilityGapInference(session, payload) {
        if (!payload || !payload.session_artifact || !payload.session_artifact.graph || !payload.session_artifact.graph.nodes) return;

        // Issue #9807: Type-Aware Gap Targeting (Skip Abstract Concepts/Epics/Guides)
        const structuralNodes = payload.session_artifact.graph.nodes.filter(n =>
            (n.type === 'CLASS' || n.type === 'METHOD' || n.type === 'COMPONENT') &&
            (typeof n.confidence === 'number' ? n.confidence : 1.0) >= 0.6
        );

        if (structuralNodes.length === 0) return;

        logger.info(`[GapInferenceEngine] Launching Deterministic Capability Gap Inference for ${structuralNodes.length} actual codebase nodes...`);

        const neoRootDir = path.resolve(__dirname, '../../../');
        
        // INTERNAL MAPPING NOTE: The native SQLite items iterate over `Neo.ai.graph.NodeModel`
        // instances. To align with formal Graph Database taxonomy, the DTO `.type` property 
        // is mapped to `.label` on Nodes (while Edges retain `.type`).

        // Gather test framework paths directly
        const testFilePaths = GraphService.db.nodes.items.filter(n =>
            n.label === 'FILE' && n.properties?.path?.startsWith('test/')
        ).map(n => n.properties?.path || '').map(p => p.toLowerCase());

        // Gather architectural guide paths natively
        const guideFilePaths = GraphService.db.nodes.items.filter(n =>
            n.label === 'FILE' && n.properties?.path?.startsWith('learn/guides/')
        ).map(n => n.properties?.path || '');

        for (const node of structuralNodes) {
            let testGap = null;
            
            // Ignore Neo.mjs internal config system lifecycle hooks
            const isInternalConfigHook = node.type === 'METHOD' && /^(beforeGet|beforeSet|afterSet)[A-Z]/.test(node.name);

            if (!isInternalConfigHook) {
                // Deterministic Validation Alignments 
                const nodeTokens = node.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
                if (nodeTokens.length === 0) nodeTokens.push(node.name.toLowerCase());
                
                // Loose path scan matching node tokens inside the test namespace
                const hasTest = testFilePaths.some(p => nodeTokens.some(term => {
                    const regex = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
                    return regex.test(p);
                }));
                if (!hasTest) {
                    testGap = `[TEST_GAP] The ${node.type} '${node.name}' lacks corresponding automated validation suites (Playwright) covering its tokens within the test/ directory.`;
                }
            }

            let combinedGaps = [testGap].filter(Boolean);
            
            // --- GUIDE GAP INFERENCE (Native File-System & Boolean LLM Verification) ---
            let guideGap = null;
            if (node.type === 'CLASS' || node.type === 'CONCEPT' || node.type === 'COMPONENT') {
                try {
                    const nodeTokensGuide = node.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
                    if (nodeTokensGuide.length === 0) nodeTokensGuide.push(node.name.toLowerCase());

                    // Loose path scan matching node tokens inside the learn/guides namespace
                    const matchingGuide = guideFilePaths.find(p => {
                        return nodeTokensGuide.some(term => {
                            const regex = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
                            return regex.test(p);
                        });
                    });

                    if (!matchingGuide) {
                        guideGap = `[GUIDE_GAP] The ${node.type} '${node.name}' lacks a corresponding architectural learning Guide in the knowledge base.`;
                    } else {
                        // Core Match Passed: Now do Boolean LLM verification natively via file content
                        const provider = Neo.create(OpenAiCompatible, {
                            modelName: aiConfig.openAiCompatible.model,
                            host: aiConfig.openAiCompatible.host
                        });
                        
                        let topContent = '';
                        const guideAbsolutePath = path.resolve(neoRootDir, matchingGuide);
                        try {
                            topContent = await fs.promises.readFile(guideAbsolutePath, 'utf8');
                        } catch (e) {}
                        
                        // Truncate to save inference time on large guides
                        topContent = topContent.substring(0, 3000); 

                        const verifyPrompt = `
You are the Neo.mjs QA Engine. 
Does the following guide text ACTUALLY describe and explain the structural concept/class '${node.name}'?
Respond strictly with a JSON object: {"verified": true} or {"verified": false}

--- Guide Text (Truncated) ---
${topContent}
`;
                        const res = await provider.generate(verifyPrompt);
                        const vPayload = Json.extract(res.content);
                        if (vPayload && vPayload.verified === false) {
                            guideGap = `[GUIDE_GAP] The ${node.type} '${node.name}' lacks a dedicated architectural Guide (Existing file match failed LLM semantic verification).`;
                        } else if (!vPayload) {
                            logger.warn(`[GapInferenceEngine] Failed to extract boolean JSON for Guide verification of ${node.name}.`);
                        }
                    }
                } catch (e) {
                    logger.warn(`[GapInferenceEngine] Native Knowledge Base Inference failed for ${node.name}:`, e.message);
                }
            }

            combinedGaps.push(guideGap);
            combinedGaps = combinedGaps.filter(Boolean);

            let dbNode = GraphService.db.nodes.get(node.id) || GraphService.db.nodes.get(node._resolvedId);
            
            if (!dbNode) continue;

            if (combinedGaps.length > 0) {
                logger.debug(`[GapInferenceEngine] Deterministic Gaps structurally bound to ${node.name}.`);
                dbNode.properties = dbNode.properties || {};
                dbNode.properties.capabilityGap = JSON.stringify(combinedGaps);
                dbNode.properties.lastGapCheck = Date.now();
                GraphService.upsertNode(dbNode);
            } else if (dbNode.properties?.capabilityGap) {
                // Garbage Collection: The target codebase node has been successfully covered! Erase the Gap Alert natively!
                delete dbNode.properties.capabilityGap;
                dbNode.properties.lastGapCheck = Date.now();
                GraphService.upsertNode(dbNode);
                logger.debug(`[GapInferenceEngine] Gap Eradicated for node ${node.name}. Codebase coverage complete.`);
            }
        }
    }
}

export default Neo.setupClass(GapInferenceEngine);
