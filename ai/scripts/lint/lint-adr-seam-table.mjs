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
 * @summary Finds the composition ADR by its seam-table content marker.
 * @param {String} [dir=DECISIONS_DIR] Decisions directory.
 * @returns {{file: String, content: String}|null}
 */
export function findCompositionAdr(dir = DECISIONS_DIR) {
    for (const name of fs.readdirSync(dir).sort()) {
        if (!/\.md$/.test(name)) continue;

        const content = fs.readFileSync(path.join(dir, name), 'utf8');

        if (content.includes(TABLE_MARKER)) {
            return {file: name, content}
        }
    }

    return null
}

/**
 * @summary Extracts the ADR ids that hold seam-table rows.
 * @param {String} content Composition-ADR markdown.
 * @returns {String[]} Sorted unique row ids.
 */
export function listSeamTableRowIds(content) {
    const
        section = content.split(TABLE_MARKER)[1] || '',
        table   = section.split(/\n## /)[0] || '',
        ids     = [...table.matchAll(/^\|\s*(\d{4})\s*\|/gm)].map(match => match[1]);

    return [...new Set(ids)].sort()
}

/**
 * @summary Runs the seam-table check.
 * @param {String} [dir=DECISIONS_DIR] Decisions directory.
 * @returns {{ok: Boolean, missingRows: String[], ghostRows: String[], file: String|null}}
 */
export function checkSeamTable(dir = DECISIONS_DIR) {
    const composition = findCompositionAdr(dir);

    if (!composition) {
        return {ok: false, missingRows: [], ghostRows: [], file: null}
    }

    const
        present     = listPresentAdrIds(dir),
        rows        = listSeamTableRowIds(composition.content),
        rowSet      = new Set(rows),
        presentSet  = new Set(present),
        missingRows = present.filter(id => !rowSet.has(id)),
        ghostRows   = rows.filter(id => !presentSet.has(id));

    return {
        ok  : missingRows.length === 0 && ghostRows.length === 0,
        file: composition.file,
        missingRows,
        ghostRows
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
        process.exit(1)
    }

    console.log(`[lint-adr-seam-table] OK (${result.file})`)
}
