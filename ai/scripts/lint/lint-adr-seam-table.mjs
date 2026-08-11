#!/usr/bin/env node

/**
 * @summary Lints the target-architecture composition ADR's seam table against the present ADR corpus.
 *
 * The target-architecture composition record stays trustworthy BY CONSTRUCTION: this guard derives
 * the present ADR ids from `learn/agentos/decisions/[0-9][0-9][0-9][0-9]-*.md` and fails unless the
 * seam table contains exactly one row per present id — both directions (no missing rows, no ghost
 * rows). Id-based, never count-based (the #13846 graduation constraint; ticket-ref-ok: graduation-record authority): a new ADR merges WITH its
 * seam-table row in the same diff, or CI fails.
 *
 * The composition ADR is located by CONTENT (the seam-table marker), not by filename/number, so
 * renumbering or renaming never silently disables the guard.
 * @plane in-plane
 */

import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename    = fileURLToPath(import.meta.url),
    __dirname     = path.dirname(__filename),
    ROOT_DIR      = path.resolve(__dirname, '../../..'),
    DECISIONS_DIR = path.join(ROOT_DIR, 'learn/agentos/decisions'),
    TABLE_MARKER  = '## §2 The Seam Table';

/**
 * @summary Lists the 4-digit ids of all present ADR files.
 * @param {String} [dir=DECISIONS_DIR] Decisions directory.
 * @returns {String[]} Sorted unique ids, e.g. `['0001', …]`.
 */
export function listPresentAdrIds(dir = DECISIONS_DIR) {
    return [...new Set(
        fs.readdirSync(dir)
            .map(name => /^(\d{4})-.*\.md$/.exec(name)?.[1])
            .filter(Boolean)
    )].sort()
}

/**
 * @summary Finds the composition ADR by its seam-table content marker, enforcing marker uniqueness.
 * @param {String} [dir=DECISIONS_DIR] Decisions directory.
 * @returns {{file: String, content: String, ambiguousFiles: String[]}|null} null when no marker file
 *          exists; `ambiguousFiles` lists every match when more than one file carries the marker.
 */
export function findCompositionAdr(dir = DECISIONS_DIR) {
    const matches = [];

    for (const name of fs.readdirSync(dir).sort()) {
        if (!/\.md$/.test(name)) continue;

        const content = fs.readFileSync(path.join(dir, name), 'utf8');

        if (content.includes(TABLE_MARKER)) {
            matches.push({file: name, content})
        }
    }

    if (matches.length === 0) return null;

    return {
        ...matches[0],
        ambiguousFiles: matches.length > 1 ? matches.map(match => match.file) : []
    }
}

/**
 * @summary Extracts the ADR ids holding seam-table rows — ALL occurrences, duplicates preserved.
 *
 * Cardinality is part of the contract ("exactly one row per present id"), so this deliberately
 * does NOT dedupe: duplicate detection happens in `checkSeamTable`.
 *
 * @param {String} content Composition-ADR markdown.
 * @returns {String[]} Row ids in table order, duplicates included.
 */
export function listSeamTableRowIds(content) {
    const
        section = content.split(TABLE_MARKER)[1] || '',
        table   = section.split(/\n## /)[0] || '';

    return [...table.matchAll(/^\|\s*(\d{4})\s*\|/gm)].map(match => match[1])
}

/**
 * @summary Runs the seam-table check: missing rows, ghost rows, duplicate rows, marker ambiguity.
 * @param {String} [dir=DECISIONS_DIR] Decisions directory.
 * @returns {{ok: Boolean, missingRows: String[], ghostRows: String[], duplicateRows: String[],
 *            ambiguousFiles: String[], file: String|null}}
 */
export function checkSeamTable(dir = DECISIONS_DIR) {
    const composition = findCompositionAdr(dir);

    if (!composition) {
        return {ok: false, missingRows: [], ghostRows: [], duplicateRows: [], ambiguousFiles: [], file: null}
    }

    const
        present       = listPresentAdrIds(dir),
        rows          = listSeamTableRowIds(composition.content),
        rowSet        = new Set(rows),
        presentSet    = new Set(present),
        counts        = rows.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map()),
        missingRows   = present.filter(id => !rowSet.has(id)),
        ghostRows     = [...rowSet].filter(id => !presentSet.has(id)).sort(),
        duplicateRows = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();

    return {
        ok: missingRows.length === 0 && ghostRows.length === 0 && duplicateRows.length === 0
            && composition.ambiguousFiles.length === 0,
        file          : composition.file,
        ambiguousFiles: composition.ambiguousFiles,
        missingRows,
        ghostRows,
        duplicateRows
    }
}

if (process.argv[1] === __filename) {
    const result = checkSeamTable();

    if (!result.file) {
        console.error('[lint-adr-seam-table] FAILED: no composition ADR found (missing seam-table marker)');
        process.exit(1)
    }

    if (!result.ok) {
        console.error('[lint-adr-seam-table] FAILED');
        result.missingRows.length && console.error(`- present ADR ids WITHOUT a seam-table row: ${result.missingRows.join(', ')} (a new ADR merges WITH its row in the same diff)`);
        result.ghostRows.length && console.error(`- seam-table rows WITHOUT a present ADR file: ${result.ghostRows.join(', ')}`);
        result.duplicateRows.length && console.error(`- DUPLICATE seam-table rows for: ${result.duplicateRows.join(', ')} (exactly one row per id — resolve the conflict, keep one)`);
        result.ambiguousFiles.length && console.error(`- MULTIPLE files carry the seam-table marker: ${result.ambiguousFiles.join(', ')} (exactly one composition record may exist)`);
        process.exit(1)
    }

    console.log(`[lint-adr-seam-table] OK (${result.file})`)
}
