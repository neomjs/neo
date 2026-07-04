import {resolveRenderTarget} from './convergenceSnapshotSchema.mjs';
import {CONTRACT_AXES}       from './conceptNeighborhoodProbe.mjs';

/**
 * @module ai/services/graph/convergenceRenderLedger
 * @summary Convergence-weighted Golden Path — human-facing render-ledger (ticket-ref-ok: #14636 owning-leaf anchor; Leaf 3 of #14581).
 *
 * The human-facing terminus of the convergence firewall chain: schema (Leaf 1) mints canonical-id snapshot
 * nodes, compute (Leaf 2) weights them over N imagined futures, and this leaf projects that output into a
 * PROVISIONAL, `notAuthority` ledger a maintainer reads — the terrain of which sub-goals are cross-future
 * invariant ("structure not events"). Long-run home: a terrain panel in the FM cockpit; interim home: the
 * standalone text artifact `renderConvergenceLedgerText` emits.
 *
 * Firewall preserved end-to-end, not just at compute (OQ8):
 *   - The ledger's `notAuthority` / `agentBootConsumable` flags are sourced verbatim from the schema's
 *     `resolveRenderTarget()` — single source, never re-invented — so the render declares itself
 *     non-consumable by any agent boot-path.
 *   - It is a PURE PROJECTION: canonical ids, convergence weights, and the independence budget are read
 *     straight off the compute output — NO re-compute, NO id re-derivation (the OQ1 anchor stays put).
 *   - The run-level OQ7 independence budget + OQ8 firewall attestation ride along as decision-support
 *     context so the human can discount correlated-future inflation and see upstream integrity.
 *   - The four contract axes (authority / fidelity / extractionProvenance / lifecycle) render SEPARATELY —
 *     never flattened to a composite score, matching the schema contract.
 *
 * ADR disposition (ticket-ref-ok: governance anchor, render-only / no-new-authority): aligned-with ADR-0023, depends-on ADR-0024 (the Leaf 1 `CONVERGENCE_SNAPSHOT` node class it renders).
 * Introduces NO new decision authority — render-only, additive, fail-open: a malformed input degrades to an
 * empty ledger, never an exception into a caller.
 */

/**
 * @summary The provisional / non-authority banner every ledger carries. Convergence is a HYPOTHESIS about
 * cross-future invariance surfaced for human judgement — never a mandate, never ground truth an agent boots
 * from. Frozen so no consumer can silently soften it.
 */
export const CONVERGENCE_LEDGER_DISCLAIMER = Object.freeze({
    provisional : 'Provisional decision-support — convergence is a hypothesis about cross-future invariance, not a mandate.',
    notAuthority: 'Not authority: no agent boot-path consumes this ledger. Reading it as ground truth would re-enter generation and make convergence self-fulfilling (OQ8).',
    discount    : 'Weight is inflated when the imagined futures are correlated — read it against the independence budget below.'
});

/**
 * @summary Projects a single convergence-snapshot node into a ledger row. Pure read: `canonicalId`,
 * `convergenceWeight`, and `independenceBudget` are taken verbatim (no re-compute, no re-canonicalization);
 * the four contract axes are surfaced in canonical order, each slot present (missing → `null`) and SEPARATE.
 * @param {Object} snapshot A `CONVERGENCE_SNAPSHOT` node (see `buildConvergenceSnapshotNode`).
 * @returns {Object|null} the frozen row, or `null` when the snapshot has no canonical id.
 */
function toLedgerRow(snapshot) {
    const properties = snapshot?.properties;

    if (!properties || !properties.canonicalId) return null;

    const axes    = properties.axes || {},
          axisRow = {};

    // Every contract axis gets a slot in canonical order — separate, never a composite. Missing → null.
    for (const axis of Object.keys(CONTRACT_AXES)) {
        axisRow[axis] = axes[axis] !== undefined ? axes[axis] : null;
    }

    return Object.freeze({
        canonicalId       : properties.canonicalId,
        convergenceWeight : typeof properties.convergenceWeight  === 'number' ? properties.convergenceWeight  : null,
        independenceBudget: typeof properties.independenceBudget === 'number' ? properties.independenceBudget : null,
        riskNode          : properties.riskNode === true,
        axes              : Object.freeze(axisRow),
        provenance        : properties.provenance || null,
        remeasureAt       : properties.remeasureAt || null
    });
}

/**
 * @summary Orders ledger rows into terrain: highest cross-future invariance first. Convergence weight
 * descending (unweighted `null` rows sink to the bottom), ties broken by independence budget descending
 * (a more independent future set makes the same weight more trustworthy), then canonical id ascending for
 * deterministic output.
 * @param {Object} a first row.
 * @param {Object} b second row.
 * @returns {Number} comparator result.
 */
function byTerrain(a, b) {
    const aw = a.convergenceWeight ?? -Infinity,
          bw = b.convergenceWeight ?? -Infinity;

    if (aw !== bw) return bw - aw;

    const ai = a.independenceBudget ?? -Infinity,
          bi = b.independenceBudget ?? -Infinity;

    if (ai !== bi) return bi - ai;

    return a.canonicalId < b.canonicalId ? -1 : a.canonicalId > b.canonicalId ? 1 : 0;
}

/**
 * @summary Builds the human-facing convergence render-ledger from a Leaf 2 compute result. The ledger is a
 * PROVISIONAL, `notAuthority` projection — its firewall flags come verbatim from the schema's
 * `resolveRenderTarget()`, and the run-level OQ7 independence budget + OQ8 firewall manifest ride along so a
 * maintainer can judge upstream integrity. Additive + fail-open: a malformed input yields an empty-rows
 * ledger, never an exception.
 *
 * @param {Object} [computeResult] Leaf 2 output `{snapshots, independenceBudget, manifest}`; a bare
 *   snapshot array is also accepted (no run-level context then).
 * @param {Object} [options]
 * @param {String} [options.now] ISO clock injection for deterministic `generatedAt`.
 * @returns {Object} frozen ledger `{kind, provisional, notAuthority, agentBootConsumable, home, generatedAt,
 *   disclaimer, firewall, independenceBudget, rows, rowCount}`.
 */
export function buildConvergenceRenderLedger(computeResult, {now} = {}) {
    const target = resolveRenderTarget();

    // Fail-open scaffold: the firewall-flag frame is always well-formed, even for a garbage input.
    const base = {
        kind               : target.target,
        provisional        : true,
        notAuthority       : target.notAuthority,        // verbatim from schema — the render never re-invents it
        agentBootConsumable: target.agentBootConsumable, // false — declares itself non-consumable
        home               : target.home,
        generatedAt        : now || null,
        disclaimer         : CONVERGENCE_LEDGER_DISCLAIMER
    };

    try {
        const result    = Array.isArray(computeResult) ? {snapshots: computeResult} : (computeResult || {}),
              snapshots = Array.isArray(result.snapshots) ? result.snapshots : [],
              manifest  = result.manifest || null;

        const rows = snapshots.map(toLedgerRow).filter(Boolean).sort(byTerrain);

        return Object.freeze({
            ...base,
            firewall: Object.freeze({
                // Surfaced for the human: was the upstream compute run isolated (OQ8)? A non-clean run's
                // weights may be self-fulfilling — the ledger shows it rather than silently trusting it.
                clean       : manifest ? manifest.firewallClean === true : null,
                futureSource: manifest ? manifest.futureSource : null
            }),
            independenceBudget: Object.freeze({
                value         : typeof result.independenceBudget === 'number' ? result.independenceBudget : null,
                interpretation: '0 = correlated futures (convergence inflated); 1 = independent futures (convergence trustworthy).'
            }),
            rows    : Object.freeze(rows),
            rowCount: rows.length
        });
    } catch (error) {
        // Fail-open: render-only, never an exception into a caller.
        return Object.freeze({
            ...base,
            firewall          : Object.freeze({clean: null, futureSource: null}),
            independenceBudget: Object.freeze({value: null, interpretation: CONVERGENCE_LEDGER_DISCLAIMER.discount}),
            rows              : Object.freeze([]),
            rowCount          : 0
        });
    }
}

/**
 * @summary Renders one contract-axis payload into a legible markdown-table cell. Axis values are small
 * objects (e.g. `{trustTier: 'system'}`), so a naive `String(obj)` emits `[object Object]`; this folds them
 * to compact `key=value` pairs (JSON-encoding any nested value) and escapes `|` so the table survives.
 * @param {*} value the axis payload — object, primitive, or null.
 * @returns {String} a table-safe cell; `—` when the axis is absent.
 */
function formatAxisCell(value) {
    if (value === null || value === undefined) return '—';

    const cell = typeof value === 'object'
        ? (Object.entries(value).map(([key, val]) => `${key}=${typeof val === 'object' ? JSON.stringify(val) : val}`).join(', ') || '{}')
        : String(value);

    // escape the escape char first, then the pipe — else a pre-existing backslash mis-escapes the pipe
    return cell.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');   // an axis payload must never break the markdown table
}

/**
 * @summary Renders a ledger (from `buildConvergenceRenderLedger`) as the interim standalone artifact: a
 * human-readable markdown terrain report, provisional banner first, then the OQ7/OQ8 context, then the
 * weighted rows. Pure string projection — reads the ledger, computes nothing.
 * @param {Object} ledger a ledger object from `buildConvergenceRenderLedger`.
 * @returns {String} markdown text for the standalone ledger artifact.
 */
export function renderConvergenceLedgerText(ledger) {
    if (!ledger || !Array.isArray(ledger.rows)) return '';

    const budget   = ledger.independenceBudget?.value,
          firewall = ledger.firewall || {},
          axisKeys = Object.keys(CONTRACT_AXES),
          // Provenance traceability (OQ1): a confident weight with no traceable producing run is
          // authority-by-typography, even under the notAuthority banner. Surface it as a shared-run header
          // when every row agrees, else as a per-row column.
          provenances = [...new Set(ledger.rows.map(row => row.provenance).filter(Boolean))],
          oneProvenance    = provenances.length === 1 ? provenances[0] : null,
          columnProvenance = provenances.length > 1;

    const lines = [
        '# Convergence Terrain Ledger',
        '',
        `> **PROVISIONAL — notAuthority.** ${ledger.disclaimer?.provisional || ''}`,
        `> ${ledger.disclaimer?.notAuthority || ''}`,
        '',
        `- **Firewall (OQ8):** ${firewall.clean === true ? 'clean — compute read neither peer futures nor prior convergence' : firewall.clean === false ? '⚠ COMPROMISED — output may be self-fulfilling; discount heavily' : 'unknown (no manifest)'}${firewall.futureSource ? ` · futures: \`${firewall.futureSource}\`` : ''}`,
        `- **Independence budget (OQ7):** ${budget === null || budget === undefined ? 'n/a' : budget.toFixed(3)} — ${ledger.independenceBudget?.interpretation || ''}`,
        `- **Provenance (OQ1):** ${provenances.length === 0 ? 'none recorded' : oneProvenance ? `\`${oneProvenance}\` (all rows)` : 'per-row — see column'}`,
        `- **Generated at:** ${ledger.generatedAt || '— (unstamped; inject now at render for staleness-legibility)'}`,
        `- **Home surface:** \`${ledger.home}\` (interim: this standalone artifact) · agent-boot-consumable: ${ledger.agentBootConsumable}`,
        `- **Rows:** ${ledger.rowCount}`,
        ''
    ];

    if (ledger.rowCount === 0) {
        lines.push('_No convergence snapshots to render._');
        return lines.join('\n');
    }

    const header = ['Rank', 'Convergence', 'Independence', 'Risk', 'Canonical Id', ...axisKeys, 'Remeasure At'];

    // Only widen the table when rows disagree on provenance; the uniform case rode the header line above.
    if (columnProvenance) header.push('Provenance');

    lines.push(
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`
    );

    ledger.rows.forEach((row, index) => {
        const cells = [
            String(index + 1),
            row.convergenceWeight === null ? '—' : String(row.convergenceWeight),
            row.independenceBudget === null ? '—' : row.independenceBudget.toFixed(3),
            row.riskNode ? '⚠' : '',
            `\`${row.canonicalId}\``,
            ...axisKeys.map(axis => formatAxisCell(row.axes[axis])),
            row.remeasureAt || '—'
        ];

        if (columnProvenance) cells.push(row.provenance ? `\`${row.provenance}\`` : '—');

        lines.push(`| ${cells.join(' | ')} |`);
    });

    return lines.join('\n');
}
