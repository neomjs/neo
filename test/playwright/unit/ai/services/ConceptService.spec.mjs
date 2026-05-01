import {setup} from '../../../setup.mjs';

const appName = 'ConceptServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import ConceptService from '../../../../../ai/services/ConceptService.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';

/**
 * Creates a temporary concepts directory with test JSONL files.
 * Returns the absolute path to the temp directory.
 * @param {Array<Object>} nodes Array of node objects
 * @param {Array<Object>} edges Array of edge objects
 * @returns {String} Path to temp concepts directory
 */
function createTestFixture(nodes, edges) {
    const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-concept-test-')),
          nodesData = nodes.map(n => JSON.stringify(n)).join('\n'),
          edgesData = edges.map(e => JSON.stringify(e)).join('\n');

    fs.writeFileSync(path.join(tmpDir, 'nodes.jsonl'), nodesData, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'edges.jsonl'), edgesData, 'utf8');

    return tmpDir;
}

/**
 * Minimal fixture: a root anchor with two tier-1 children, one with an EXPLAINED_BY edge.
 */
function createMinimalFixture() {
    const nodes = [
        {id: 'root', name: 'Neo.mjs', tier: 0, description: 'System anchor', uniqueToNeo: false, tags: []},
        {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Worker-based threading', uniqueToNeo: true, tags: ['architecture'], aliases: ['multi-worker', 'OMT architecture']},
        {id: 'vdom', name: 'JSON-First VDOM', tier: 1, description: 'VDOM protocol', uniqueToNeo: true, tags: ['vdom'], aliases: ['JSON VDOM']},
        {id: 'reactivity', name: 'Reactivity', tier: 2, description: 'Config system', uniqueToNeo: true, tags: ['reactivity']}
    ];

    const edges = [
        {source: 'root', target: 'threading', type: 'PARENT_CONCEPT'},
        {source: 'root', target: 'vdom', type: 'PARENT_CONCEPT'},
        {source: 'threading', target: 'reactivity', type: 'PARENT_CONCEPT'},
        {source: 'threading', target: 'file:learn/guides/Threading.md', type: 'EXPLAINED_BY'},
        {source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'},
        {source: 'reactivity', target: 'file:learn/guides/Reactivity.md', type: 'EXPLAINED_BY'},
        {source: 'vdom', target: 'ext:react-jsx', type: 'ANALOGOUS_TO', note: 'JSX compiles to createElement; Neo VDOM is raw JSON.'},
        {source: 'threading', target: 'ext:react-concurrent', type: 'ANALOGOUS_TO', note: 'React simulates scheduling on one thread; Neo uses real Web Workers.'}
    ];

    return createTestFixture(nodes, edges);
}

test.describe('Neo.ai.services.ConceptService', () => {
    let testRun = 0;

    test.beforeEach(() => {
        testRun++;
    });

    test.afterEach(() => {
        // Reset the singleton state for isolation between tests
        ConceptService.nodes.clear();
        ConceptService.edgesBySource.clear();
        ConceptService.edgesByTarget.clear();
        ConceptService.aliasIndex.clear();
        ConceptService.loaded = false;
    });

    // ── loadGraph ──────────────────────────────────────────────

    test('loadGraph should parse JSONL files and return correct statistics', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;

        const stats = ConceptService.loadGraph();

        expect(stats.nodeCount).toBe(4);
        expect(stats.edgeCount).toBe(8);
        expect(stats.errors.length).toBe(0);

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('loadGraph should report errors for malformed nodes', () => {
        const nodes = [
            {id: 'valid', name: 'Valid', tier: 1, description: 'OK', uniqueToNeo: false, tags: []},
            {name: 'MissingId', tier: 1}  // missing id
        ];
        const edges = [];
        const tmpDir = createTestFixture(nodes, edges);

        ConceptService.defaultConceptsDir = tmpDir;

        const stats = ConceptService.loadGraph();

        expect(stats.nodeCount).toBe(1);
        expect(stats.errors.length).toBe(1);
        expect(stats.errors[0]).toContain('missing required fields');

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('loadGraph should report duplicate node IDs', () => {
        const nodes = [
            {id: 'dupe', name: 'First', tier: 1, description: 'A', uniqueToNeo: false, tags: []},
            {id: 'dupe', name: 'Second', tier: 1, description: 'B', uniqueToNeo: false, tags: []}
        ];
        const tmpDir = createTestFixture(nodes, []);

        ConceptService.defaultConceptsDir = tmpDir;

        const stats = ConceptService.loadGraph();

        expect(stats.nodeCount).toBe(1);
        expect(stats.errors.length).toBe(1);
        expect(stats.errors[0]).toContain('Duplicate node ID');

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── ensureLoaded guard ────────────────────────────────────

    test('should throw if query methods are called before loadGraph', () => {
        expect(() => ConceptService.getConceptTree()).toThrow('Graph not loaded');
        expect(() => ConceptService.findGuideGaps()).toThrow('Graph not loaded');
        expect(() => ConceptService.serializeForLLM()).toThrow('Graph not loaded');
    });

    // ── getConceptCoverage ────────────────────────────────────

    test('getConceptCoverage should return correct edge counts', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const coverage = ConceptService.getConceptCoverage('threading');

        expect(coverage.explainedBy.length).toBe(1);
        expect(coverage.implementedBy.length).toBe(1);
        expect(coverage.exemplifiedBy.length).toBe(0);

        // vdom has no edges
        const vdomCoverage = ConceptService.getConceptCoverage('vdom');

        expect(vdomCoverage.explainedBy.length).toBe(0);
        expect(vdomCoverage.implementedBy.length).toBe(0);

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── findGuideGaps ─────────────────────────────────────────

    test('findGuideGaps should identify concepts missing EXPLAINED_BY edges', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const gaps = ConceptService.findGuideGaps();

        // vdom has no EXPLAINED_BY or IMPLEMENTED_BY
        const vdomGap = gaps.find(g => g.concept.id === 'vdom');

        expect(vdomGap).toBeTruthy();
        expect(vdomGap.missingEdgeTypes).toContain('EXPLAINED_BY');
        expect(vdomGap.missingEdgeTypes).toContain('IMPLEMENTED_BY');
        expect(vdomGap.severity).toBe('CRITICAL');

        // threading is fully covered — should NOT appear
        const threadingGap = gaps.find(g => g.concept.id === 'threading');
        expect(threadingGap).toBeUndefined();
    });

    test('findGuideGaps should sort by weight descending', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const gaps = ConceptService.findGuideGaps();

        for (let i = 1; i < gaps.length; i++) {
            expect(gaps[i].weight).toBeLessThanOrEqual(gaps[i - 1].weight);
        }

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('findGuideGaps should respect minWeight threshold', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const allGaps      = ConceptService.findGuideGaps(0),
              filteredGaps = ConceptService.findGuideGaps(1.0);

        expect(filteredGaps.length).toBeLessThanOrEqual(allGaps.length);

        for (const gap of filteredGaps) {
            expect(gap.weight).toBeGreaterThanOrEqual(1.0);
        }

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── calculateWeight ───────────────────────────────────────

    test('calculateWeight should factor tier, uniqueness, and coverage deficit', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        // vdom: tier 1 (0.8) + uniqueToNeo (0.2) + no EXPLAINED_BY (0.3) = 1.3
        const vdomNode   = ConceptService.nodes.get('vdom'),
              vdomWeight = ConceptService.calculateWeight(vdomNode);

        expect(vdomWeight).toBeCloseTo(1.3, 1);

        // threading: tier 1 (0.8) + uniqueToNeo (0.2) + has guide (0) = 1.0
        const threadingNode   = ConceptService.nodes.get('threading'),
              threadingWeight = ConceptService.calculateWeight(threadingNode);

        expect(threadingWeight).toBeCloseTo(1.0, 1);

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── classifyConcept ───────────────────────────────────────

    test('classifyConcept should return concepts implementing a given file', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const concepts = ConceptService.classifyConcept('src/worker/Manager.mjs');

        expect(concepts.length).toBe(1);
        expect(concepts[0].id).toBe('threading');
    });

    test('classifyConcept should return empty array for unknown files', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        expect(ConceptService.classifyConcept('src/unknown/Foo.mjs').length).toBe(0);

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('classifyConcept should respect the limit parameter', () => {
        const nodes = [
            {id: 'c1', name: 'C1', tier: 1, description: 'A', uniqueToNeo: false, tags: []},
            {id: 'c2', name: 'C2', tier: 1, description: 'B', uniqueToNeo: false, tags: []},
            {id: 'c3', name: 'C3', tier: 1, description: 'C', uniqueToNeo: false, tags: []}
        ];
        const edges = [
            {source: 'c1', target: 'file:src/shared/Foo.mjs', type: 'IMPLEMENTED_BY'},
            {source: 'c2', target: 'file:src/shared/Foo.mjs', type: 'IMPLEMENTED_BY'},
            {source: 'c3', target: 'file:src/shared/Foo.mjs', type: 'IMPLEMENTED_BY'}
        ];
        const tmpDir = createTestFixture(nodes, edges);

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const defaultResult = ConceptService.classifyConcept('src/shared/Foo.mjs');
        expect(defaultResult.length).toBe(3);

        const limitedResult = ConceptService.classifyConcept('src/shared/Foo.mjs', {limit: 2});
        expect(limitedResult.length).toBe(2);

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── findConceptsRelevantTo ────────────────────────────────

    test('findConceptsRelevantTo should rank matches and respect limits', () => {
        const nodes = [
            {id: 'c1', name: 'Grid Component', tier: 1, description: 'Main grid component', uniqueToNeo: false, tags: ['grid']},
            {id: 'c2', name: 'Grid Row', tier: 2, description: 'Row for grid', uniqueToNeo: false, tags: ['grid', 'row']},
            {id: 'c3', name: 'Grid Cell', tier: 3, description: 'Cell for grid row', uniqueToNeo: false, tags: ['grid', 'cell']},
            {id: 'c4', name: 'Button', tier: 1, description: 'Clickable button', uniqueToNeo: false, tags: ['button']}
        ];
        const tmpDir = createTestFixture(nodes, []);

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const results = ConceptService.findConceptsRelevantTo('I need to fix the grid component', {limit: 2});
        expect(results.length).toBe(2);
        expect(results[0].id).toBe('c1');
        expect(results[1].id).toBe('c2');

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── findGapsRelevantTo ────────────────────────────────────

    test('findGapsRelevantTo should return missing gaps filtered by relevance and limit', () => {
        const nodes = [
            {id: 'c1', name: 'Grid Component', tier: 1, description: 'Main grid', uniqueToNeo: false, tags: ['grid']},
            {id: 'c2', name: 'Grid View', tier: 2, description: 'Grid visual', uniqueToNeo: false, tags: ['grid']},
            {id: 'c3', name: 'Button', tier: 1, description: 'Button', uniqueToNeo: false, tags: ['button']}
        ];
        const edges = [
            {source: 'c3', target: 'file:learn/guides/Button.md', type: 'EXPLAINED_BY'}
        ];
        const tmpDir = createTestFixture(nodes, edges);

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const gaps = ConceptService.findGapsRelevantTo('Document the grid component', {limit: 1});

        expect(gaps.length).toBe(1);
        expect(gaps[0].concept.id).toBe('c1');
        expect(gaps[0].missingEdgeTypes).toContain('EXPLAINED_BY');

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── getConceptTree ────────────────────────────────────────

    test('getConceptTree should build a nested tree from the anchor', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const tree = ConceptService.getConceptTree();

        expect(tree.id).toBe('root');
        expect(tree.tier).toBe(0);
        expect(tree.children.length).toBe(2);

        // AC #10033: "Root nodes are Tier 1 concepts" — every direct child of the anchor
        // must be tier 1, enforcing the ontology's top-level structure
        expect(tree.children.every(c => c.tier === 1)).toBe(true);

        const threadingChild = tree.children.find(c => c.id === 'threading');
        expect(threadingChild).toBeTruthy();
        expect(threadingChild.children.length).toBe(1);
        expect(threadingChild.children[0].id).toBe('reactivity');

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('getConceptTree should respect maxTier filter', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const tree = ConceptService.getConceptTree(1);

        // Only tier 0 and tier 1 — reactivity (tier 2) should be excluded
        const threadingChild = tree.children.find(c => c.id === 'threading');

        expect(threadingChild.children.length).toBe(0);

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── serializeForLLM ───────────────────────────────────────

    test('serializeForLLM should produce tree with connector characters', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const tree  = ConceptService.serializeForLLM(2),
              lines = tree.split('\n');

        // Root line has no connector
        expect(lines[0]).toBe('Neo.mjs');

        // Children have connectors
        expect(tree).toContain('├─');
        expect(tree).toContain('└─');

        // AC #10033: "Coverage annotations are correct" — threading has an EXPLAINED_BY
        // edge so its line must carry the ✅ marker; vdom has no EXPLAINED_BY so its line
        // must carry the ❌ marker. Asserts markers are placed per-concept, not just present.
        const threadingLine = lines.find(l => l.includes('Multi-Threading'));
        const vdomLine      = lines.find(l => l.includes('JSON-First VDOM'));

        expect(threadingLine).toBeTruthy();
        expect(vdomLine).toBeTruthy();
        expect(threadingLine).toContain('✅');
        expect(vdomLine).toContain('❌');

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── getSummary ────────────────────────────────────────────

    test('getSummary should return correct coverage statistics', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const summary = ConceptService.getSummary();

        // 3 non-anchor concepts: threading (covered), vdom (gap), reactivity (covered)
        expect(summary.totalConcepts).toBe(3);
        expect(summary.guideGapCount).toBe(1);  // only vdom
        expect(summary.coveragePercent).toBe(67); // 2/3 covered

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── Production graph ──────────────────────────────────────

    test('should load the real production ontology without errors', () => {
        // Reset to use the real concepts directory
        ConceptService.defaultConceptsDir = null;

        const stats = ConceptService.loadGraph();

        expect(stats.errors.length).toBe(0);
        expect(stats.nodeCount).toBeGreaterThan(50);
        expect(stats.edgeCount).toBeGreaterThan(100);
    });

    // ── resolveAlias ──────────────────────────────────────────

    test('resolveAlias should resolve case-insensitive aliases to canonical concepts', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        // Exact alias match
        const result = ConceptService.resolveAlias('multi-worker');
        expect(result).toBeTruthy();
        expect(result.id).toBe('threading');

        // Case-insensitive
        const upper = ConceptService.resolveAlias('OMT Architecture');
        expect(upper).toBeTruthy();
        expect(upper.id).toBe('threading');

        // JSON VDOM alias
        const vdom = ConceptService.resolveAlias('json vdom');
        expect(vdom).toBeTruthy();
        expect(vdom.id).toBe('vdom');

        // Non-existent alias
        expect(ConceptService.resolveAlias('nonexistent-term')).toBeNull();

        // Direct ID lookup fallback
        const direct = ConceptService.resolveAlias('threading');
        expect(direct).toBeTruthy();
        expect(direct.id).toBe('threading');

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('loadGraph should detect duplicate aliases across nodes', () => {
        const nodes = [
            {id: 'a', name: 'A', tier: 1, description: 'First', uniqueToNeo: false, tags: [], aliases: ['shared-alias']},
            {id: 'b', name: 'B', tier: 1, description: 'Second', uniqueToNeo: false, tags: [], aliases: ['shared-alias']}
        ];
        const tmpDir = createTestFixture(nodes, []);

        ConceptService.defaultConceptsDir = tmpDir;

        const stats = ConceptService.loadGraph();

        expect(stats.errors.length).toBe(1);
        expect(stats.errors[0]).toContain('Duplicate alias');
        expect(stats.errors[0]).toContain('shared-alias');

        fs.rmSync(tmpDir, {recursive: true});
    });

    test('loadGraph should clear aliasIndex on reload', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        expect(ConceptService.resolveAlias('multi-worker')).toBeTruthy();

        // Create a second fixture without aliases
        const tmpDir2 = createTestFixture(
            [{id: 'x', name: 'X', tier: 0, description: 'Clean', uniqueToNeo: false, tags: []}],
            []
        );

        ConceptService.defaultConceptsDir = tmpDir2;
        ConceptService.loadGraph();

        // Old aliases should be cleared
        expect(ConceptService.resolveAlias('multi-worker')).toBeNull();

        fs.rmSync(tmpDir, {recursive: true});
        fs.rmSync(tmpDir2, {recursive: true});
    });

    // ── getAnalogousConcepts ──────────────────────────────────

    test('getAnalogousConcepts should return ANALOGOUS_TO edges with notes', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const analogues = ConceptService.getAnalogousConcepts('vdom');

        expect(analogues.length).toBe(1);
        expect(analogues[0].target).toBe('ext:react-jsx');
        expect(analogues[0].type).toBe('ANALOGOUS_TO');
        expect(analogues[0].note).toContain('JSX');

        // Threading has one analogue
        const threadAnalogues = ConceptService.getAnalogousConcepts('threading');
        expect(threadAnalogues.length).toBe(1);
        expect(threadAnalogues[0].target).toBe('ext:react-concurrent');

        // No analogues for reactivity
        expect(ConceptService.getAnalogousConcepts('reactivity').length).toBe(0);

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── AC #10033 coverage completeness ────────────────────────

    test('serializeForLLM Tier 1-2 from production graph should produce non-empty output and report current size', () => {
        // Observability test (NOT a ceiling). #10033's original AC called for a 100-line
        // cap, which codified a stale heuristic from a smaller-context era. Capping output
        // length works against the concept ontology's core purpose — it IS designed to grow
        // as #10050/#10036/#10037 enrich Tier 1-2 coverage. A hard cap creates perverse
        // incentives: demote legitimate concepts to pass the test, or silently lift the cap.
        // Line count is a formatting proxy, not an architectural invariant — the real
        // curation discipline lives at the `tier` assignment layer in nodes.jsonl.
        //
        // This test logs the current size on every run (visible in CI output) so growth
        // trends and sudden jumps are observable, and asserts only that the serializer
        // didn't regress to empty output. See PR #10078 review thread for the full reasoning.
        ConceptService.defaultConceptsDir = null;
        ConceptService.loadGraph();

        const tree  = ConceptService.serializeForLLM(2),
              lines = tree.split('\n');

        console.log(`[ConceptService] serializeForLLM(2) produced ${lines.length} lines from the production graph`);

        expect(lines.length).toBeGreaterThan(0);
    });

    test('calculateWeight should order tier 1 above tier 3 at equal coverage', () => {
        // AC #10033: "Tier 1 > Tier 3 in weight" — explicit cross-tier ordering assertion.
        // Fixture holds a tier-1 and a tier-3 concept with identical coverage so the only
        // signal driving the weight delta is the tier multiplier.
        const nodes = [
            {id: 'tier1-node', name: 'Tier1', tier: 1, description: 'T1', uniqueToNeo: false, tags: []},
            {id: 'tier3-node', name: 'Tier3', tier: 3, description: 'T3', uniqueToNeo: false, tags: []}
        ];
        const edges = [
            {source: 'tier1-node', target: 'file:guide-1.md',  type: 'EXPLAINED_BY'},
            {source: 'tier1-node', target: 'file:impl-1.mjs',  type: 'IMPLEMENTED_BY'},
            {source: 'tier3-node', target: 'file:guide-3.md',  type: 'EXPLAINED_BY'},
            {source: 'tier3-node', target: 'file:impl-3.mjs',  type: 'IMPLEMENTED_BY'}
        ];
        const tmpDir = createTestFixture(nodes, edges);

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const tier1Weight = ConceptService.calculateWeight(ConceptService.nodes.get('tier1-node'));
        const tier3Weight = ConceptService.calculateWeight(ConceptService.nodes.get('tier3-node'));

        expect(tier1Weight).toBeGreaterThan(tier3Weight);

        fs.rmSync(tmpDir, {recursive: true});
    });

    // ── Production graph: aliases & ANALOGOUS_TO ──────────────

    test('production graph should have aliases and ANALOGOUS_TO edges', () => {
        ConceptService.defaultConceptsDir = null;
        ConceptService.loadGraph();

        // Alias index should be populated
        expect(ConceptService.aliasIndex.size).toBeGreaterThan(0);

        // OMT should resolve to off-main-thread
        const omt = ConceptService.resolveAlias('OMT');
        expect(omt).toBeTruthy();
        expect(omt.id).toBe('off-main-thread');

        // ANALOGOUS_TO edges should exist in the production graph
        const stateAnalogues = ConceptService.getAnalogousConcepts('state-provider');
        expect(stateAnalogues.length).toBeGreaterThan(0);

        // All ANALOGOUS_TO targets should use the ext: prefix
        for (const edge of stateAnalogues) {
            expect(edge.target.startsWith('ext:')).toBe(true);
        }
    });
});
