/**
 * @plane in-plane
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { KB_QueryService } from '../../services.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const EDGES_PATH = path.join(ROOT_DIR, '.neo-ai-data/concepts/edges.jsonl');
const NODES_PATH = path.join(ROOT_DIR, '.neo-ai-data/concepts/nodes.jsonl');

async function run() {
    console.log('[validateConceptEdges] Loading concept ontology...');
    const nodesRaw = await fs.readFile(NODES_PATH, 'utf-8');
    const conceptMap = new Map();
    for (const line of nodesRaw.split('\n')) {
        if (!line.trim()) continue;
        const node = JSON.parse(line);
        conceptMap.set(node.id, node);
    }

    const edgesRaw = await fs.readFile(EDGES_PATH, 'utf-8');
    const explainedByEdges = [];
    for (const line of edgesRaw.split('\n')) {
        if (!line.trim()) continue;
        const edge = JSON.parse(line);
        if (edge.type === 'EXPLAINED_BY') {
            explainedByEdges.push(edge);
        }
    }

    console.log(`[validateConceptEdges] Found ${explainedByEdges.length} EXPLAINED_BY edges.`);

    let anomaliesCount = 0;

    for (const edge of explainedByEdges) {
        const conceptId = edge.source;
        const targetStr = edge.target;

        const concept = conceptMap.get(conceptId);
        if (!concept) {
            console.warn(`[validateConceptEdges] Concept ${conceptId} not found.`);
            continue;
        }

        if (!targetStr.startsWith('file:')) {
            console.log(`[validateConceptEdges] Skipping non-file target: ${targetStr}`);
            continue;
        }

        // Expected source path in ChromaDB (relative to neoRootDir)
        const expectedSource = targetStr.substring('file:'.length);
        const conceptText = `${concept.name}: ${concept.description}`;

        try {
            const queryRes = await KB_QueryService.queryDocuments({
                query: conceptText,
                type: 'guide',
                limit: 10
            });

            const results = queryRes.results || [];
            const foundIndex = results.findIndex(r => r.source === expectedSource);

            console.log(`Evaluating: [${conceptId}] -> [${expectedSource}]`);

            if (foundIndex === -1) {
                console.warn(`  --> ⚠️  SEMANTIC ANOMALY: Guide '${expectedSource}' not in top 10 results for concept '${concept.name}'`);
                anomaliesCount++;
            } else {
                console.log(`  --> ✅  Valid edge (Ranked #${foundIndex + 1})`);
            }
        } catch (err) {
            console.error(`[validateConceptEdges] Error querying ChromaDB for edge ${conceptId} -> ${targetStr}:`, err);
        }

        // Minor delay to avoid rate limiting if hitting external APIs
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[validateConceptEdges] Validation complete. Found ${anomaliesCount} potential anomalies.`);
    process.exit(0);
}

run().catch(err => {
    console.error('[validateConceptEdges] Fatal:', err);
    process.exit(1);
});
