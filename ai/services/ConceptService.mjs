import fs   from 'fs';
import path from 'path';
import Base from '../../src/core/Base.mjs';

/**
 * @class Neo.ai.services.ConceptService
 * @extends Neo.core.Base
 * @singleton
 *
 * @summary
 * The ConceptService is the runtime interface for the Concept Ontology — a version-controlled
 * JSONL graph that provides the semantic stratum between source code and learning content.
 *
 * It loads concept nodes and typed edges from `.neo-ai-data/concepts/`, builds an in-memory
 * graph, and exposes deterministic query APIs for gap detection, coverage analysis, and
 * LLM context priming.
 *
 * The service replaces the fragile regex-based token matching previously used by the
 * GapInferenceEngine with graph-traversal-based gap detection:
 * - A concept with zero `EXPLAINED_BY` edges → `GUIDE_GAP`
 * - A concept with zero `IMPLEMENTED_BY` edges → `DEAD_CONCEPT` (prune candidate)
 *
 * **Integration point:** Registered in `ai/services.mjs` and consumed by the DreamService
 * pipeline (GapInferenceEngine Phase 4).
 *
 * @see {@link learn/agentos/ConceptOntology.md} for schema documentation and the Teaching Test.
 */
class ConceptService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.ConceptService'
         * @protected
         */
        className: 'Neo.ai.services.ConceptService',

        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,

        /**
         * @member {String} defaultConceptsDir_=null
         * @summary
         * Absolute path to the concepts directory, injected by the composing entrypoint from its
         * resolved plane root. Tests inject an isolated directory through the same seam.
         */
        defaultConceptsDir_: null
    }

    /**
     * In-memory concept nodes indexed by ID.
     * @member {Map<String, Object>} nodes
     * @private
     */
    nodes = new Map()

    /**
     * In-memory edges grouped by source node ID.
     * @member {Map<String, Array<Object>>} edgesBySource
     * @private
     */
    edgesBySource = new Map()

    /**
     * In-memory edges grouped by target.
     * @member {Map<String, Array<Object>>} edgesByTarget
     * @private
     */
    edgesByTarget = new Map()

    /**
     * Reverse lookup index mapping lowercase aliases to their canonical concept IDs.
     * Built during `loadGraph()` from the optional `aliases` array on each node.
     * @member {Map<String, String>} aliasIndex
     * @private
     */
    aliasIndex = new Map()

    /**
     * Whether the graph has been loaded.
     * @member {Boolean} loaded
     * @private
     */
    loaded = false

    /**
     * Tier-to-weight score mapping for gap severity calculation.
     * Tier 0 (system anchor) has no weight — it's not a documentation target.
     * @member {Object} tierWeights
     * @static
     */
    static tierWeights = {
        0: 0,
        1: 0.8,
        2: 0.5,
        3: 0.3
    }

    /**
     * @summary Returns the composing entrypoint's resolved concepts directory.
     *
     * There is deliberately no checkout-relative fallback. A singleton imported from two seat clones
     * must not silently select two different ontology roots, and a configured plane must not fall back
     * to its canonical default. The entrypoint owns resolution; this service only consumes the result.
     * @returns {String} Absolute path to concepts directory.
     * @private
     */
    getConceptsDir() {
        if (!this.defaultConceptsDir) {
            throw new Error('[ConceptService] concepts directory must be injected by the composing entrypoint')
        }

        return this.defaultConceptsDir
    }

    /**
     * @summary Parses a JSONL file into an array of objects.
     * Each line must be a valid JSON object. Empty lines and lines that fail
     * to parse are silently skipped with a warning.
     * @param {String} filePath Absolute path to the JSONL file.
     * @returns {Array<Object>} Parsed objects.
     * @private
     */
    parseJsonl(filePath) {
        const content = fs.readFileSync(filePath, 'utf8'),
              lines   = content.split('\n'),
              results = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
                continue;
            }

            try {
                results.push(JSON.parse(trimmed));
            } catch {
                console.warn(`[ConceptService] Skipping malformed JSONL line in ${path.basename(filePath)}: ${trimmed.substring(0, 80)}`);
            }
        }

        return results;
    }

    /**
     * @summary Loads the concept graph from JSONL files into memory.
     * Parses `nodes.jsonl` and `edges.jsonl`, validates structural integrity,
     * and builds indexed lookup maps for efficient traversal.
     *
     * Safe to call multiple times — subsequent calls clear and reload.
     *
     * @param {String} [nodesPath] Path to nodes.jsonl. Defaults to concepts dir.
     * @param {String} [edgesPath] Path to edges.jsonl. Defaults to concepts dir.
     * @returns {Object} Load statistics: `{nodeCount, edgeCount, errors}`.
     */
    loadGraph(nodesPath, edgesPath) {
        const conceptsDir = this.getConceptsDir();

        nodesPath = nodesPath || path.join(conceptsDir, 'nodes.jsonl');
        edgesPath = edgesPath || path.join(conceptsDir, 'edges.jsonl');

        // Clear existing state
        this.nodes.clear();
        this.edgesBySource.clear();
        this.edgesByTarget.clear();
        this.aliasIndex.clear();
        this.loaded = false;

        const errors   = [],
              rawNodes = this.parseJsonl(nodesPath),
              rawEdges = this.parseJsonl(edgesPath);

        // Index nodes
        for (const node of rawNodes) {
            if (!node.id || !node.name || node.tier === undefined) {
                errors.push(`Invalid node (missing required fields): ${JSON.stringify(node).substring(0, 100)}`);
                continue;
            }

            if (this.nodes.has(node.id)) {
                errors.push(`Duplicate node ID: ${node.id}`);
                continue;
            }

            this.nodes.set(node.id, node);

            // Index aliases for O(1) reverse lookup
            if (Array.isArray(node.aliases)) {
                for (const alias of node.aliases) {
                    const key = alias.toLowerCase().trim();

                    if (this.aliasIndex.has(key)) {
                        errors.push(`Duplicate alias '${alias}' on node '${node.id}' — already mapped to '${this.aliasIndex.get(key)}'`);
                        continue;
                    }

                    this.aliasIndex.set(key, node.id);
                }
            }
        }

        // Index edges with bidirectional lookup
        for (const edge of rawEdges) {
            if (!edge.source || !edge.target || !edge.type) {
                errors.push(`Invalid edge (missing required fields): ${JSON.stringify(edge).substring(0, 100)}`);
                continue;
            }

            // Source index
            if (!this.edgesBySource.has(edge.source)) {
                this.edgesBySource.set(edge.source, []);
            }
            this.edgesBySource.get(edge.source).push(edge);

            // Target index
            if (!this.edgesByTarget.has(edge.target)) {
                this.edgesByTarget.set(edge.target, []);
            }
            this.edgesByTarget.get(edge.target).push(edge);
        }

        this.loaded = true;

        return {
            nodeCount: this.nodes.size,
            edgeCount: rawEdges.length - errors.filter(e => e.startsWith('Invalid edge')).length,
            errors
        };
    }

    /**
     * @summary Retrieves all outbound edges from a concept, optionally filtered by type.
     * @param {String} conceptId The source concept ID.
     * @param {String} [edgeType] Optional filter (e.g., `'EXPLAINED_BY'`, `'IMPLEMENTED_BY'`).
     * @returns {Array<Object>} Matching edges.
     */
    getEdges(conceptId, edgeType) {
        const edges = this.edgesBySource.get(conceptId) || [];

        return edgeType
            ? edges.filter(e => e.type === edgeType)
            : edges;
    }

    /**
     * @summary Retrieves all inbound edges targeting a concept or file reference.
     * @param {String} targetId The target ID (concept ID or `file:` reference).
     * @param {String} [edgeType] Optional filter.
     * @returns {Array<Object>} Matching edges.
     */
    getInboundEdges(targetId, edgeType) {
        const edges = this.edgesByTarget.get(targetId) || [];

        return edgeType
            ? edges.filter(e => e.type === edgeType)
            : edges;
    }

    /**
     * @summary Returns the direct children of a concept in the hierarchy.
     * Children are concepts connected via a `PARENT_CONCEPT` edge
     * where the parent is the source.
     * @param {String} conceptId The parent concept ID.
     * @returns {Array<Object>} Child concept nodes.
     */
    getChildren(conceptId) {
        return this.getEdges(conceptId, 'PARENT_CONCEPT')
            .map(e => this.nodes.get(e.target))
            .filter(Boolean);
    }

    /**
     * @summary Builds a hierarchical tree of concepts rooted at the system anchor.
     * Each node in the tree includes its metadata and a `children` array.
     *
     * Documents the boundary for internal orchestration and visualization apps. LLM query surfaces should use bounded variants.
     * @param {Number} [maxTier=3] Maximum tier to include.
     * @returns {Object} Tree root with nested children.
     * @protected
     */
    getConceptTree(maxTier = 3) {
        this.ensureLoaded();

        const buildSubtree = (conceptId) => {
            const node     = this.nodes.get(conceptId),
                  children = this.getChildren(conceptId)
                      .filter(c => c.tier <= maxTier)
                      .map(c => buildSubtree(c.id));

            return {
                ...node,
                children
            };
        };

        // Find the system anchor (tier 0)
        const anchor = [...this.nodes.values()].find(n => n.tier === 0);

        return anchor
            ? buildSubtree(anchor.id)
            : {id: 'neo-mjs', name: 'Neo.mjs', tier: 0, children: []};
    }

    /**
     * @summary Returns the documentation and implementation coverage for a concept.
     * This is the primary API consumed by the GapInferenceEngine for deterministic
     * gap detection — a concept has a `GUIDE_GAP` if `explainedBy` is empty.
     *
     * @param {String} conceptId The concept ID to analyze.
     * @returns {Object} Coverage report with `{explainedBy, implementedBy, exemplifiedBy, requirements}`.
     */
    getConceptCoverage(conceptId) {
        this.ensureLoaded();

        return {
            explainedBy  : this.getEdges(conceptId, 'EXPLAINED_BY'),
            implementedBy: this.getEdges(conceptId, 'IMPLEMENTED_BY'),
            exemplifiedBy: this.getEdges(conceptId, 'EXEMPLIFIED_BY'),
            requirements : this.getEdges(conceptId, 'REQUIRES')
        };
    }

    /**
     * @summary Calculates the gap weight for a concept.
     * Weight determines the priority of filling a documentation gap.
     *
     * Formula: `weight = tier_score + uniqueness_score + coverage_deficit`
     * - Tier score: 0.8 (tier 1), 0.5 (tier 2), 0.3 (tier 3)
     * - Uniqueness: +0.2 if the concept is architecturally unique to Neo.mjs
     * - Coverage deficit: +0.3 if no EXPLAINED_BY edges exist
     *
     * @param {Object} concept The concept node object.
     * @returns {Number} Calculated weight (0.0 to 1.3).
     */
    calculateWeight(concept) {
        const tierScore       = ConceptService.tierWeights[concept.tier] || 0,
              uniquenessScore = concept.uniqueToNeo ? 0.2 : 0,
              coverage        = this.getConceptCoverage(concept.id),
              coverageDeficit = coverage.explainedBy.length === 0 ? 0.3 : 0;

        return tierScore + uniquenessScore + coverageDeficit;
    }

    /**
     * @summary Finds all concepts missing EXPLAINED_BY edges (guide gaps), sorted by weight.
     * This is the deterministic replacement for the GapInferenceEngine's regex-based
     * token matching. No LLM verification needed — missing edge = gap.
     *
     * Documents the boundary for internal orchestration. LLM query surfaces should use findGapsRelevantTo.
     * @param {Number} [minWeight=0] Minimum weight threshold for inclusion.
     * @returns {Array<Object>} Gap entries sorted by weight descending:
     *   `{concept, weight, tier, severity, missingEdgeTypes}`.
     * @protected
     */
    findGuideGaps(minWeight = 0) {
        this.ensureLoaded();

        const gaps = [];

        for (const concept of this.nodes.values()) {
            // Skip system anchor
            if (concept.tier === 0) {
                continue;
            }

            const coverage = this.getConceptCoverage(concept.id),
                  weight   = this.calculateWeight(concept),
                  missing  = [];

            if (coverage.explainedBy.length === 0) {
                missing.push('EXPLAINED_BY');
            }

            if (coverage.implementedBy.length === 0) {
                missing.push('IMPLEMENTED_BY');
            }

            // Only report if there's at least one gap and meets weight threshold
            if (missing.length > 0 && weight >= minWeight) {
                gaps.push({
                    concept,
                    weight,
                    tier            : concept.tier,
                    severity        : concept.tier === 1 ? 'CRITICAL' : concept.tier === 2 ? 'HIGH' : 'MEDIUM',
                    missingEdgeTypes: missing
                });
            }
        }

        // Sort by weight descending (highest priority first)
        gaps.sort((a, b) => b.weight - a.weight);

        return gaps;
    }

    /**
     * @summary Given a source file path, returns the concepts it implements.
     * Performs reverse lookup on `IMPLEMENTED_BY` edges.
     *
     * @param {String} classPath Repository-relative path (e.g., `'src/data/Store.mjs'`).
     * @param {Object} [options]
     * @param {Number} [options.limit=5] Max concepts to return. Default 5 prevents context bloat. Pass 0 for unbounded.
     * @returns {Array<Object>} Concept nodes that reference this file.
     */
    classifyConcept(classPath, {limit = 5} = {}) {
        this.ensureLoaded();

        const fileRef = classPath.startsWith('file:') ? classPath : `file:${classPath}`,
              edges   = this.getInboundEdges(fileRef, 'IMPLEMENTED_BY');

        let concepts = edges
            .map(e => this.nodes.get(e.source))
            .filter(Boolean);

        if (limit > 0) {
            concepts = concepts.slice(0, limit);
        }

        return concepts;
    }

    /**
     * @summary Returns the top concepts most relevant to a task description.
     * Bounded by a default limit to prevent LLM context flooding.
     * Phase 1: Keyword/Tier-based heuristic matching.
     * A future semantic pass may add ChromaDB cosine similarity.
     *
     * @param {String} taskDescription Natural language task description.
     * @param {Object} [options]
     * @param {Number} [options.limit=5] Max concepts to return. Default 5 prevents context bloat.
     * @returns {Array<Object>} Most relevant concepts.
     */
    findConceptsRelevantTo(taskDescription, {limit = 5} = {}) {
        this.ensureLoaded();

        if (!taskDescription) {
            return [];
        }

        const keywords = taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        // Phase 1: simple heuristic score
        const scored = [...this.nodes.values()]
            .filter(n => n.tier > 0) // Skip anchor
            .map(concept => {
                let   score = 0;
                const terms = [
                    concept.id.toLowerCase(),
                    concept.name.toLowerCase(),
                    ...(concept.aliases || []).map(a => a.toLowerCase())
                ];

                for (const kw of keywords) {
                    if (terms.some(t => t.includes(kw))) {
                        score += 10;
                    }
                }

                // Slight boost for higher tier (lower number)
                score += (4 - concept.tier);

                return {concept, score};
            })
            .filter(item => item.score > (4 - item.concept.tier)) // Must have at least one keyword match
            .sort((a, b) => b.score - a.score)
            .map(item => item.concept);

        return scored.slice(0, limit);
    }

    /**
     * @summary Task-scoped version of findGuideGaps that returns gaps semantically related to the task.
     * Bounded by a default limit to prevent LLM context flooding.
     * Phase 1: Keyword/Tier-based heuristic matching.
     * A future semantic pass may add ChromaDB cosine similarity.
     *
     * @param {String} taskDescription Natural language task description.
     * @param {Object} [options]
     * @param {Number} [options.limit=5] Max gaps to return. Default 5 prevents context bloat.
     * @param {Number} [options.minWeight=0] Minimum gap weight threshold.
     * @returns {Array<Object>} Relevant guide gaps.
     */
    findGapsRelevantTo(taskDescription, {limit = 5, minWeight = 0} = {}) {
        this.ensureLoaded();

        const allGaps = this.findGuideGaps(minWeight);

        if (!taskDescription) {
            return allGaps.slice(0, limit);
        }

        const keywords = taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        const scoredGaps = allGaps
            .map(gap => {
                let   score   = gap.weight; // start with existing weight
                const concept = gap.concept;
                const terms   = [
                    concept.id.toLowerCase(),
                    concept.name.toLowerCase(),
                    ...(concept.aliases || []).map(a => a.toLowerCase())
                ];

                let matched = false;
                for (const kw of keywords) {
                    if (terms.some(t => t.includes(kw))) {
                        score += 10;
                        matched = true;
                    }
                }

                return {gap, score, matched};
            })
            .filter(item => item.matched)
            .sort((a, b) => b.score - a.score)
            .map(item => item.gap);

        return scoredGaps.slice(0, limit);
    }

    /**
     * @summary Resolves an alias or alternative term to its canonical concept ID.
     * Performs case-insensitive O(1) lookup against the alias index built during `loadGraph()`.
     *
     * A term qualifies as an alias only if it refers to the exact same architectural concept
     * within Neo.mjs. Cross-framework terms (ViewModel, JSX) belong in `ANALOGOUS_TO` edges.
     *
     * @param {String} term The alias or alternative name to resolve.
     * @returns {Object|null} The concept node, or `null` if no alias match.
     */
    resolveAlias(term) {
        this.ensureLoaded();

        const key       = term.toLowerCase().trim(),
              conceptId = this.aliasIndex.get(key);

        // Also check direct ID match
        if (!conceptId) {
            return this.nodes.get(key) || null;
        }

        return this.nodes.get(conceptId) || null;
    }

    /**
     * @summary Returns all `ANALOGOUS_TO` edges for a concept — cross-framework mappings
     * that relate Neo.mjs concepts to their nearest equivalents in other frameworks.
     *
     * External concept targets use the `ext:` prefix (e.g., `ext:react-context`) to prevent
     * collision with internal concept IDs.
     *
     * Each edge includes an optional `note` field explaining the architectural distinction.
     *
     * Documents the boundary for internal orchestration.
     * @param {String} conceptId The concept ID to look up analogues for.
     * @returns {Array<Object>} ANALOGOUS_TO edges with `{source, target, type, note}`.
     * @protected
     */
    getAnalogousConcepts(conceptId) {
        this.ensureLoaded();

        return this.getEdges(conceptId, 'ANALOGOUS_TO');
    }

    /**
     * @summary Serializes the concept tree into a compact text format suitable for
     * LLM context priming. Produces a hierarchical, indented tree under 100 lines.
     *
     * Format example:
     * ```
     * Neo.mjs
     * ├─ Multi-Threading [T1] ✅
     * │  ├─ Off-Main-Thread [T1] ✅
     * │  └─ Worker Isolation [T1] ✅
     * ```
     *
     * @param {Number} [maxTier=2] Maximum tier to include. Tier 3 excluded by default
     *   to stay under the 100-line target.
     * @returns {String} Compact tree string.
     */
    serializeForLLM(maxTier = 2) {
        this.ensureLoaded();

        const lines = [],

              renderNode = (conceptId, prefix = '', isLast = true, isRoot = false) => {
                  const node     = this.nodes.get(conceptId),
                        coverage = this.getConceptCoverage(conceptId),
                        hasGuide = coverage.explainedBy.length > 0,
                        marker   = hasGuide ? '✅' : '❌';

                  let line;

                  if (isRoot) {
                      line = node.name;
                  } else {
                      const connector = isLast ? '└─' : '├─';
                      line = `${prefix}${connector} ${node.name} [T${node.tier}] ${marker}`;
                  }

                  lines.push(line);

                  const children = this.getChildren(conceptId)
                            .filter(c => c.tier <= maxTier),
                        childPrefix = isRoot
                            ? ''
                            : `${prefix}${isLast ? '   ' : '│  '}`;

                  children.forEach((child, i) => {
                      renderNode(child.id, childPrefix, i === children.length - 1);
                  });
              };

        // Find anchor
        const anchor = [...this.nodes.values()].find(n => n.tier === 0);

        if (anchor) {
            renderNode(anchor.id, '', true, true);
        }

        return lines.join('\n');
    }

    /**
     * @summary Returns a summary report of the ontology state.
     * Useful for diagnostics and agent context priming.
     * @returns {Object} Summary with counts, gap statistics, and coverage percentages.
     */
    getSummary() {
        this.ensureLoaded();

        const allConcepts  = [...this.nodes.values()].filter(n => n.tier > 0),
              gaps         = this.findGuideGaps(),
              guideGaps    = gaps.filter(g => g.missingEdgeTypes.includes('EXPLAINED_BY')),
              deadConcepts = gaps.filter(g => g.missingEdgeTypes.includes('IMPLEMENTED_BY')
                  && !g.missingEdgeTypes.includes('EXPLAINED_BY'));

        return {
            totalConcepts   : allConcepts.length,
            totalEdges      : [...this.edgesBySource.values()].reduce((sum, edges) => sum + edges.length, 0),
            guideGapCount   : guideGaps.length,
            deadConceptCount: deadConcepts.length,
            coveragePercent : allConcepts.length > 0
                ? Math.round(((allConcepts.length - guideGaps.length) / allConcepts.length) * 100)
                : 100,
            criticalGaps: guideGaps.filter(g => g.severity === 'CRITICAL'),
            highGaps    : guideGaps.filter(g => g.severity === 'HIGH')
        };
    }

    /**
     * @summary Guard that throws if the graph has not been loaded.
     * @private
     */
    ensureLoaded() {
        if (!this.loaded) {
            throw new Error('[ConceptService] Graph not loaded. Call loadGraph() first.');
        }
    }
}

export default Neo.setupClass(ConceptService);
