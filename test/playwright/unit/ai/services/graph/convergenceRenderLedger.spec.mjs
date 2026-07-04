import {test, expect}                        from '@playwright/test';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath}                       from 'node:url';

import {computeConvergenceSnapshots}  from '../../../../../../ai/services/graph/convergenceCompute.mjs';
import {buildConvergenceSnapshotNode} from '../../../../../../ai/services/graph/convergenceSnapshotSchema.mjs';
import {
    CONVERGENCE_LEDGER_DISCLAIMER,
    buildConvergenceRenderLedger,
    renderConvergenceLedgerText
} from '../../../../../../ai/services/graph/convergenceRenderLedger.mjs';

/**
 * Recursively collects `.mjs` files under a dir (absolute path), excluding specs.
 */
function collectMjs(absDir) {
    const out = [];

    let entries;
    try { entries = readdirSync(absDir); } catch (error) { return out; }

    for (const entry of entries) {
        const abs = `${absDir}/${entry}`;

        if (statSync(abs).isDirectory()) {
            out.push(...collectMjs(abs));
        } else if (entry.endsWith('.mjs') && !entry.endsWith('.spec.mjs')) {
            out.push(abs);
        }
    }

    return out;
}

test.describe('convergenceRenderLedger', () => {
    const now = '2026-07-04T00:00:00.000Z',
          // Leaf 2 real compute output: 'golden-path' lies on all 3 futures (weight 3); the others on one each.
          compute  = computeConvergenceSnapshots({
              latticeNodeIds: ['CONCEPT:GoldenPath', 'CONCEPT:FirstRevenue', 'CONCEPT:Foo'],
              futurePaths   : [['golden-path', 'first-revenue'], ['golden-path'], ['golden-path', 'foo']],
              provenance    : 'lattice-import:test',
              manifest      : {futureSource: 'test-futures'},
              now
          });

    test('renders a PROVISIONAL, notAuthority ledger — the firewall flags come verbatim from the schema (preserved end-to-end)', () => {
        const ledger = buildConvergenceRenderLedger(compute, {now});

        expect(ledger.kind).toBe('convergence-terrain-ledger');
        expect(ledger.provisional).toBe(true);
        // These are the OQ8 firewall flags minted by the schema's resolveRenderTarget — the render must not soften them.
        expect(ledger.notAuthority).toBe(true);
        expect(ledger.agentBootConsumable).toBe(false);
        expect(ledger.home).toBe('fm-cockpit-terrain-panel');
        expect(ledger.disclaimer).toBe(CONVERGENCE_LEDGER_DISCLAIMER);
        expect(ledger.disclaimer.notAuthority).toContain('self-fulfilling');
    });

    test('FIREWALL: no agent boot-path module imports the render-ledger (OQ8 preserved structurally, not just by flag)', () => {
        // "Agent boot-path" = the Brain runtime an agent boots into + synthesizes its next action from.
        const rootUrl  = new URL('../../../../../../', import.meta.url),
              root     = fileURLToPath(rootUrl),
              bootPath = [
                  ...collectMjs(`${root}ai/daemons`),
                  `${root}ai/services/graph/GoldenPathSynthesizer.mjs`,
                  `${root}ai/services/graph/computedGoldenPathRouting.mjs`,
                  `${root}ai/services/graph/goldenPathPickupBridge.mjs`
              ];

        const importers = bootPath.filter(file => {
            let src;
            try { src = readFileSync(file, 'utf8'); } catch (error) { return false; }
            return /convergenceRenderLedger/.test(src);
        });

        // Currently zero consumers anywhere; the sanctioned future consumer is the human-facing FM-cockpit
        // terrain panel (NOT a boot-path surface). If this ever fails, an agent runtime started consuming the
        // ledger — that re-enters generation and makes convergence self-fulfilling. Do not allowlist a boot-path file.
        expect(importers, `agent boot-path modules importing the ledger: ${importers.join(', ')}`).toEqual([]);
    });

    test('renders Leaf 2 compute output over Leaf 1 canonical ids — verbatim, no re-compute / no id re-derivation', () => {
        const ledger = buildConvergenceRenderLedger(compute, {now});

        // Terrain order: highest cross-future invariance first. 'golden-path' (weight 3) tops it.
        expect(ledger.rowCount).toBe(3);
        expect(ledger.rows[0].canonicalId).toBe('golden-path');
        expect(ledger.rows[0].convergenceWeight).toBe(3);
        // Canonical id is taken straight off the snapshot — identical to what the schema minted, no re-derivation.
        expect(ledger.rows[0].canonicalId).toBe(compute.snapshots.find(s => s.properties.convergenceWeight === 3).properties.canonicalId);
        // Ties (weight 1) break by independence then canonical id asc → 'first-revenue' before 'foo'.
        expect(ledger.rows.map(r => r.canonicalId)).toEqual(['golden-path', 'first-revenue', 'foo']);
    });

    test('surfaces the OQ7 independence budget + OQ8 firewall manifest as human decision-support context', () => {
        const ledger = buildConvergenceRenderLedger(compute, {now});

        expect(ledger.firewall.clean).toBe(true);               // compute read neither peer futures nor prior convergence
        expect(ledger.firewall.futureSource).toBe('test-futures');
        expect(ledger.independenceBudget.value).toBeGreaterThan(0);
        expect(ledger.independenceBudget.value).toBe(compute.independenceBudget); // surfaced verbatim, not recomputed
        expect(ledger.independenceBudget.interpretation).toContain('inflated');
    });

    test('flags a firewall-COMPROMISED upstream run rather than silently trusting it', () => {
        const dirty = computeConvergenceSnapshots({
            latticeNodeIds: ['CONCEPT:GoldenPath'],
            futurePaths   : [['golden-path']],
            manifest      : {readPriorConvergence: true},   // NOT firewall-clean
            now
        });
        const ledger = buildConvergenceRenderLedger(dirty, {now});

        expect(ledger.firewall.clean).toBe(false);
        expect(renderConvergenceLedgerText(ledger)).toContain('COMPROMISED');
    });

    test('keeps the four contract axes SEPARATE — every slot present, never a composite score', () => {
        const snapshot = buildConvergenceSnapshotNode({
            latticeNodeId: 'first-revenue',
            axes         : {authority: {trustTier: 'system'}, lifecycle: {state: 'candidate'}, composite: 0.9}
        });
        snapshot.properties.convergenceWeight  = 2;
        snapshot.properties.independenceBudget = 0.5;

        const row = buildConvergenceRenderLedger({snapshots: [snapshot]}, {now}).rows[0];

        expect(Object.keys(row.axes)).toEqual(['authority', 'fidelity', 'extractionProvenance', 'lifecycle']);
        expect(row.axes.authority).toEqual({trustTier: 'system'});
        expect(row.axes.fidelity).toBeNull();               // absent axis is an explicit null slot, not omitted
        expect(row.axes).not.toHaveProperty('composite');   // a flattened score must never survive
    });

    test('escapes backslashes before pipes in axis cells — a backslash-bearing value never breaks the table', () => {
        // An axis value carrying BOTH a backslash and a pipe: escaping the pipe alone leaves the
        // pre-existing backslash mis-paired and splits the markdown row into a stray column (the
        // reported incomplete-sanitization defect). The fix escapes `\` -> `\\` FIRST, then `|` -> `\|`.
        const snapshot = buildConvergenceSnapshotNode({
            latticeNodeId: 'esc-regression',
            axes         : {authority: {trustTier: 'a\\b|c'}}
        });
        snapshot.properties.convergenceWeight = 1;

        const text = renderConvergenceLedgerText(buildConvergenceRenderLedger({snapshots: [snapshot]}, {now}));

        // backslash doubled AND pipe escaped → the value stays inside one table column: `trustTier=a\\b\|c`
        expect(text).toContain('trustTier=a\\\\b\\|c');
    });

    test('is additive + fail-open — malformed input degrades to an empty ledger, never throws', () => {
        for (const bad of [null, undefined, {}, {snapshots: 'nope'}, [null, {properties: null}], 42]) {
            const ledger = buildConvergenceRenderLedger(bad, {now});
            expect(ledger.notAuthority).toBe(true);         // firewall frame holds even for garbage
            expect(ledger.rowCount).toBe(0);
            expect(Array.isArray(ledger.rows)).toBe(true);
        }
    });

    test('renderConvergenceLedgerText emits the interim standalone artifact — provisional banner, OQ7/OQ8 context, weighted table', () => {
        const text = renderConvergenceLedgerText(buildConvergenceRenderLedger(compute, {now}));

        expect(text).toContain('# Convergence Terrain Ledger');
        expect(text).toContain('PROVISIONAL — notAuthority');
        expect(text).toMatch(/Firewall \(OQ8\).*clean — compute read neither/);
        expect(text).toContain('Independence budget (OQ7)');
        expect(text).toContain('fm-cockpit-terrain-panel');
        expect(text).toContain('agent-boot-consumable: false');
        // Provenance (OQ1) traceable — a shared-run header, not a per-row column, when every row agrees.
        expect(text).toContain('Provenance (OQ1)');
        expect(text).toContain('`lattice-import:test` (all rows)');
        expect(text).not.toContain('| Provenance |');
        // Staleness-legible: the capture timestamp renders so the terrain can be judged against remeasureAt.
        expect(text).toContain('Generated at:');
        expect(text).toContain(now);
        // The terrain table ranks golden-path first.
        expect(text).toMatch(/\|\s*1\s*\|\s*3\s*\|.*golden-path/);
        expect(renderConvergenceLedgerText(null)).toBe('');   // fail-open on a null ledger
    });

    test('renders a per-row Provenance column when rows disagree on provenance — traceable without a false shared-run claim (#14636)', () => {
        const a = buildConvergenceSnapshotNode({latticeNodeId: 'alpha', provenance: 'run-A'}),
              b = buildConvergenceSnapshotNode({latticeNodeId: 'beta',  provenance: 'run-B'});
        a.properties.convergenceWeight = 2;
        b.properties.convergenceWeight = 1;

        const text = renderConvergenceLedgerText(buildConvergenceRenderLedger({snapshots: [a, b]}, {now}));

        expect(text).toContain('per-row — see column');   // header defers to the column, no false "all rows"
        expect(text).toContain('| Provenance |');         // column widened in
        expect(text).toContain('`run-A`');
        expect(text).toContain('`run-B`');
    });

    test('renders object-valued contract-axis payloads legibly — never [object Object] (GPT RC on #14725)', () => {
        const snap = buildConvergenceSnapshotNode({
            latticeNodeId: 'alpha',
            axes         : {authority: {trustTier: 'system'}, lifecycle: {state: 'candidate', verifiedAt: '2026-07-04'}}
        });
        snap.properties.convergenceWeight = 2;

        const text = renderConvergenceLedgerText(buildConvergenceRenderLedger({snapshots: [snap]}, {now}));

        expect(text).not.toContain('[object Object]');    // the exact defect GPT reproduced
        expect(text).toContain('trustTier=system');        // authority axis folded to key=value
        expect(text).toContain('state=candidate');         // lifecycle axis — multi-field, comma-joined
        expect(text).toContain('verifiedAt=2026-07-04');
    });

    test('an empty compute result renders a valid empty ledger, not a crash', () => {
        const ledger = buildConvergenceRenderLedger({snapshots: [], independenceBudget: 0, manifest: null}, {now});

        expect(ledger.rowCount).toBe(0);
        expect(ledger.firewall.clean).toBeNull();             // no manifest → unknown, not a false "clean"
        expect(renderConvergenceLedgerText(ledger)).toContain('No convergence snapshots to render');
    });
});
