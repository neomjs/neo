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
        {id: 'threading', name: 'Multi-Threading', tier: 1, description: 'Worker-based threading', uniqueToNeo: true, tags: ['architecture']},
        {id: 'vdom', name: 'JSON-First VDOM', tier: 1, description: 'VDOM protocol', uniqueToNeo: true, tags: ['vdom']},
        {id: 'reactivity', name: 'Reactivity', tier: 2, description: 'Config system', uniqueToNeo: true, tags: ['reactivity']}
    ];

    const edges = [
        {source: 'root', target: 'threading', type: 'PARENT_CONCEPT'},
        {source: 'root', target: 'vdom', type: 'PARENT_CONCEPT'},
        {source: 'threading', target: 'reactivity', type: 'PARENT_CONCEPT'},
        {source: 'threading', target: 'file:learn/guides/Threading.md', type: 'EXPLAINED_BY'},
        {source: 'threading', target: 'file:src/worker/Manager.mjs', type: 'IMPLEMENTED_BY'},
        {source: 'reactivity', target: 'file:learn/guides/Reactivity.md', type: 'EXPLAINED_BY'}
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
        ConceptService.loaded = false;
    });

    // ── loadGraph ──────────────────────────────────────────────

    test('loadGraph should parse JSONL files and return correct statistics', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;

        const stats = ConceptService.loadGraph();

        expect(stats.nodeCount).toBe(4);
        expect(stats.edgeCount).toBe(6);
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

    // ── getConceptTree ────────────────────────────────────────

    test('getConceptTree should build a nested tree from the anchor', () => {
        const tmpDir = createMinimalFixture();

        ConceptService.defaultConceptsDir = tmpDir;
        ConceptService.loadGraph();

        const tree = ConceptService.getConceptTree();

        expect(tree.id).toBe('root');
        expect(tree.tier).toBe(0);
        expect(tree.children.length).toBe(2);

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

        // Coverage markers present
        expect(tree).toContain('✅');
        expect(tree).toContain('❌');

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
});
