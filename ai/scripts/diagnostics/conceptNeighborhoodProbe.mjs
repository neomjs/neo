#!/usr/bin/env node

/**
 * @summary Runs the #14474 concept-neighborhood read probe against the live graph store (read-only; ticket-ref-ok: owning-leaf anchor).
 *
 * Usage:
 *   node ai/scripts/diagnostics/conceptNeighborhoodProbe.mjs [--out learn/agentos/measurements/concept-neighborhood-probe-YYYY-MM-DD.md]
 *
 * Opens the SQLite store READONLY (diagnostics idiom: analyzeNlTelemetry.mjs) and adapts the
 * handle to the seams `conceptNeighborhoodProbe.mjs` consumes. The probe itself performs zero
 * writes by contract; the readonly connection makes that mechanical. Sample = the locked plan
 * from the ticket: the Discussion's specimen concept + the two known alias clusters + N curated
 * (verifiedAt set) + N auto (verifiedAt null) drawn live.
 * @plane in-plane
 */

import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import Database        from 'better-sqlite3';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import aiConfig        from '../../mcp/server/memory-core/config.mjs';
import {
    buildConceptProbeReport,
    renderConceptProbeMarkdown
} from '../../services/graph/conceptNeighborhoodProbe.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    ROOT_DIR   = path.resolve(__dirname, '../../..'),
    DB_PATH    = aiConfig.storagePaths.graph,
    outArg     = process.argv.indexOf('--out'),
    OUT_PATH   = outArg > -1
        ? path.resolve(ROOT_DIR, process.argv[outArg + 1])
        : path.resolve(ROOT_DIR, `learn/agentos/measurements/concept-neighborhood-probe-${new Date().toISOString().slice(0, 10)}.md`);

const db = new Database(DB_PATH, {readonly: true, fileMustExist: true});

/**
 * @summary Parses a stored node row into the `{id, label, properties}` shape the probe reads.
 * @param {Object|undefined} row `SELECT id, data FROM Nodes` row.
 * @returns {Object|null}
 */
function parseNode(row) {
    if (!row) return null;

    try {
        const parsed = JSON.parse(row.data || '{}');

        return {id: row.id, label: parsed.label, properties: parsed.properties || {}}
    } catch {
        return null
    }
}

const graphServiceAdapter = {
    db: {
        storage: {db},
        nodes  : {
            get: id => parseNode(db.prepare('SELECT id, data FROM Nodes WHERE id = ?').get(id))
        }
    },
    listNodeRecordsByType({type, limit = 5000}) {
        const rows = db.prepare(`
            SELECT id, data FROM Nodes
            WHERE json_extract(data, '$.label') = ?
            ORDER BY id
            LIMIT ?
        `).all(type, limit);

        return {records: rows.map(parseNode).filter(Boolean)}
    }
};

/**
 * @summary Draws live curated/auto concept samples by verifiedAt presence.
 * @param {Boolean} verified true → verifiedAt set (curated tier), false → null (auto/reverification pool).
 * @param {Number} n Sample size.
 * @returns {String[]} Concept ids.
 */
function sampleConcepts(verified, n) {
    return db.prepare(`
        SELECT id FROM Nodes
        WHERE json_extract(data, '$.label') = 'CONCEPT'
          AND json_extract(data, '$.properties.verifiedAt') IS ${verified ? 'NOT NULL' : 'NULL'}
        ORDER BY id
        LIMIT ?
    `).all(n).map(r => r.id)
}

const sample = [...new Set([
    'delta-updates',
    'golden-path',
    'dream-pipeline',
    ...sampleConcepts(true, 4),
    ...sampleConcepts(false, 4)
])];

console.log(`[concept-probe] store: ${DB_PATH} (readonly)`);
console.log(`[concept-probe] sample (${sample.length}): ${sample.join(', ')}`);

const report = buildConceptProbeReport({graphService: graphServiceAdapter, sample, maxHops: 2});

fs.mkdirSync(path.dirname(OUT_PATH), {recursive: true});
fs.writeFileSync(OUT_PATH, renderConceptProbeMarkdown(report), 'utf8');

const members = report.concepts.reduce((n, c) => n + c.perMember.length, 0);

console.log(`[concept-probe] probed ${report.concepts.length} concepts / ${members} cluster members`);
console.log(`[concept-probe] artifact: ${path.relative(ROOT_DIR, OUT_PATH)}`);

db.close();
