import fs                          from 'fs';
import path                        from 'path';
import yaml                        from 'js-yaml';
import {fileURLToPath}             from 'url';
import Base                        from '../../../src/core/Base.mjs';
import ConceptService              from '../../services/ConceptService.mjs';
import {Memory_Config as aiConfig} from '../../services.mjs';
import Json                        from '../../../src/util/Json.mjs';
import logger                      from '../../mcp/server/memory-core/logger.mjs';
import OpenAiCompatible            from '../../provider/OpenAiCompatible.mjs';
import {assertTestWriteIsolated}   from '../shared/storeWriteGuard.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * System prompt establishing the Teaching Test + anti-patterns for the concept extraction
 * LLM. Emphasizes semantic judgment (what qualifies as an ontology concept) over pattern
 * matching (what LOOKS capitalized). Instructs strict JSON output so `Json.extract` can
 * parse reliably.
 * @type {String}
 * @private
 */
const CONCEPT_EXTRACTION_SYSTEM_PROMPT = `You are the Neo.mjs Concept Discovery engine. You analyze prose (GitHub epic bodies or pull-request bodies + review comments) and identify ARCHITECTURAL CONCEPTS that qualify for the Neo.mjs concept ontology under the **Teaching Test**:

A concept exists if:
- A developer needs to understand it to USE Neo.mjs productively, AND
- It cannot be learned from a single API doc page alone, AND
- It describes a pattern / architecture / mental model, not a specific class, file, or method.

**Where the gold is:**
- Epic bodies: core architectural problem statements and phased solutions.
- PR review comments: \`[ARCH_ALIGNMENT]\`, \`[RETROSPECTIVE]\`, \`[KB_GAP]\`, \`[TOOLING_GAP]\` sections; "Inputs Read Before Patch" / "Expected Solution Shape" / "Patch Verdict" premise-snapshot fields; "Gold Standards Leveraged / Traps Avoided" lists; rationale prose explaining WHY a pattern was chosen.
- Discussion about mid-term architecture direction, service boundaries, substrate choices.

**DO NOT include:**
- Class names (e.g. Button, Container, DreamService) — those are API surface, not concepts.
- File paths / directory names.
- Proper nouns without architectural weight (issue IDs, PR numbers, person names).
- Routine ticket vocabulary ("Pull Request", "Origin Session ID", "Fat Ticket" is borderline — include only if genuinely architectural).
- External framework names (React, Vue, Angular) unless the text is specifically contrasting them with a Neo.mjs equivalent that itself is the concept.
- Terms already well-documented in a single class's JSDoc.

**Output STRICT JSON** (no markdown, no preamble, no \`\`\`json fences — just the object):
{
  "candidates": [
    {
      "id": "kebab-case-slug-under-40-chars",
      "name": "Title-Case Concept Name",
      "description": "One-sentence grounded explanation drawn from the source material.",
      "reasoning": "Why this passes the Teaching Test — cite the semantic dimension it teaches.",
      "aliases": ["alternative phrasing 1", "alternative phrasing 2"]
    }
  ],
  "extraction_metadata": {
    "missing_fields": ["candidate field you could not populate confidently, e.g. 'reasoning'"],
    "ambiguous_references": ["a source phrase with more than one referent, e.g. 'the module' when three modules exist"],
    "confidence_score": 0.0
  }
}

**\`extraction_metadata\`** reports OBJECTIVE markers about THIS extraction pass — not subjective difficulty (which you cannot self-report reliably): \`missing_fields\` are candidate fields the source did not let you populate confidently; \`ambiguous_references\` are specific source-text phrases pointing to more than one referent (a verifiable linguistic fact); \`confidence_score\` is your calibrated 0.0–1.0 confidence in this candidate set. Always emit \`extraction_metadata\`.

If nothing qualifies, return \`{"candidates": [], "extraction_metadata": {"missing_fields": [], "ambiguous_references": [], "confidence_score": 0.0}}\`. Err on the side of quality over quantity — 0 high-confidence candidates beats 10 noisy ones. The ontology has ~60 concepts today; proposing 3-5 genuinely architectural ones per source is the sweet spot.`;

/**
 * Default tier / validation state for a newly-discovered candidate concept. Tier 3 + the
 * per-ingest weight calculated by `ConceptService.calculateWeight` keeps candidates below
 * the `guideGapWeightThreshold = 0.8` default, so they're silenced in `sandman_handoff.md`
 * until a curator promotes them. `validated: false` is the explicit override in
 * `GapInferenceEngine` — even if the weight gate is lowered later, unvalidated candidates
 * stay silent until review. `verifiedAt: null` marks that the concept has not yet received
 * explicit source-grounded verification under the Concept Ontology freshness contract.
 * @type {Object}
 * @private
 */
const CANDIDATE_DEFAULTS = {
    tier       : 3,
    uniqueToNeo: false,
    validated  : false,
    verifiedAt : null,
    tags       : ['mined-candidate']
};

/**
 * @summary Service for LLM-driven discovery of "unknown unknowns" in the concept ontology.
 *
 * Scans two high-signal corpora via `OpenAiCompatible.generate` (gemma4 or configured
 * provider — same substrate used by `SemanticGraphExtractor` and `GoldenPathSynthesizer`):
 *
 * 1. **Epics** — issue markdown files labeled `epic` in `resources/content/issues/`. Epic
 *    bodies are curated distilled architecture — high signal-to-noise, stable reference
 *    material for concept vocabulary.
 * 2. **Pull requests** — `resources/content/pulls/*.md`, including their `## Comments`
 *    section. PR review comments routinely contain \`[ARCH_ALIGNMENT]\` / \`[RETROSPECTIVE]\`
 *    / \`[KB_GAP]\` / "Gold Standards" / "Traps Avoided" prose — the exact architectural
 *    discourse where new vocabulary emerges. Sort-descending by filename so the most-recent
 *    PRs (freshest discourse) get processed first; `DEFAULT_PR_SCAN_LIMIT = 20` caps per-cycle
 *    LLM cost.
 *
 * **Why LLM, not regex?** The task is semantic: *does this term pass the Teaching Test?*
 * No regex / stop-phrase list / frequency threshold can distinguish "Pull Request Review"
 * (noise) from "Concept Ontology Layer" (signal) at the surface-pattern level. The
 * judgment is about meaning, which is the LLM's job. Previous regex approach (early draft)
 * failed exactly this architecture-literacy check. See `feedback_llm_substrate_for_semantic_tasks.md`.
 *
 * **Why a separate service?** `ConceptIngestor` is strictly *additive one-way sync* from
 * curated JSONL → graph. `ConceptDiscoveryService` is the *reverse-flow proposal channel* —
 * it writes candidate rows INTO the JSONL that `ConceptIngestor` picks up next cycle. Split
 * by direction of data flow and trust level: curator-asserted rows vs LLM-proposed rows.
 *
 * **Why single JSONL (no staging file)?** A separate candidate file would duplicate
 * the curator's review surface. The weight gate
 * (`guideGapWeightThreshold`) plus the `validated: false` flag silence unvalidated rows in
 * `sandman_handoff.md`; git diff on `nodes.jsonl` is the review UI.
 *
 * **Why deferred from REM-cycle loop?** LLM invocations cost real tokens. Running discovery
 * every REM cycle would flood the JSONL and burn budget. `DreamService.runConceptDiscovery`
 * is a manual-invocation facade; curator / operator decides cadence.
 *
 * @class Neo.ai.daemons.services.ConceptDiscoveryService
 * @extends Neo.core.Base
 * @see Neo.ai.daemons.services.ConceptIngestor
 * @see Neo.ai.daemons.services.SemanticGraphExtractor
 * @see Neo.ai.services.ConceptService
 * @singleton
 */
class ConceptDiscoveryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.ConceptDiscoveryService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.ConceptDiscoveryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Instance-level override for the per-cycle PR cap. Tests mutate this directly for
     * deterministic cap behavior; production falls back to `aiConfig.conceptDiscovery
     * .prScanLimit` so config is read at call time instead of module load.
     * @member {Number|null} prScanLimit=null
     */
    prScanLimit = null

    /**
     * Normalizes the envelope-level `extraction_metadata` block the LLM emits alongside
     * `candidates` — objective self-report markers: `missing_fields` (candidate fields
     * the source did not support), `ambiguous_references` (source phrases with more than one
     * referent), `confidence_score` (0-1). Returns `null` when the block is absent or not a
     * plain object, so candidate rows stay additive (legacy `{candidates}`-only responses
     * produce rows without the field).
     *
     * @summary Anchor & Echo: validates + defaults the extraction-pass self-report block;
     * non-array / out-of-range fields coerce to safe defaults rather than propagating malformed shapes.
     * @param {Object} [meta] Raw `extraction_metadata` from the LLM envelope
     * @returns {Object|null} `{missing_fields, ambiguous_references, confidence_score}` or `null`
     * @protected
     */
    normalizeExtractionMetadata(meta) {
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;

        const
            missingFields       = Array.isArray(meta.missing_fields)       ? meta.missing_fields.filter(f => typeof f === 'string')       : [],
            ambiguousReferences = Array.isArray(meta.ambiguous_references) ? meta.ambiguous_references.filter(r => typeof r === 'string') : [],
            rawScore            = meta.confidence_score,
            confidenceScore     = typeof rawScore === 'number' && rawScore >= 0 && rawScore <= 1 ? rawScore : null;

        return {
            missing_fields      : missingFields,
            ambiguous_references: ambiguousReferences,
            confidence_score    : confidenceScore
        };
    }

    /**
     * Invokes the configured LLM provider on a single source and parses the response as the
     * candidate schema. Returns `[]` on any failure (provider offline, malformed JSON, no
     * candidates) — failure to extract is never fatal to `runDiscoveryCycle`, just a skip.
     *
     * Uses `Json.extract` to tolerate the common `\`\`\`json ... \`\`\`` markdown fencing some
     * models emit despite explicit anti-fence instructions. Dedupe against `ConceptService`
     * (alias index + node-id map, case-insensitive) happens at the candidate level so we
     * never propose a concept that already exists.
     * @param {String} sourceRef Human-readable identifier for the source (e.g., `'epic-10030'`, `'pull-10084'`)
     * @param {String} text      The raw markdown body + comments for that source
     * @returns {Promise<Object[]>} Candidate records ready for `appendCandidates`
     * @protected
     */
    async extractConceptsFromSource(sourceRef, text) {
        const minSourceLength = aiConfig.conceptDiscovery.minSourceLength;
        if (!text || text.trim().length < minSourceLength) return [];

        let provider;
        try {
            provider = Neo.create(OpenAiCompatible, {
                modelName: aiConfig.openAiCompatible.model,
                host     : aiConfig.openAiCompatible.host,
                keepAlive: aiConfig.openAiCompatible.keep_alive
            });
        } catch (e) {
            logger.warn(`[ConceptDiscoveryService] OpenAiCompatible provider could not be constructed; skipping ${sourceRef}:`, e.message);
            return [];
        }

        const prompt = `${CONCEPT_EXTRACTION_SYSTEM_PROMPT}\n\n---\nSOURCE: ${sourceRef}\n\n${text}`;

        let result;
        try {
            result = await provider.generate(prompt);
        } catch (e) {
            logger.warn(`[ConceptDiscoveryService] LLM call failed for ${sourceRef}; skipping:`, e.message);
            return [];
        }

        const payload = Json.extract(result?.content || '');
        if (!payload || !Array.isArray(payload.candidates)) {
            logger.debug(`[ConceptDiscoveryService] No usable candidates parsed from ${sourceRef}.`);
            return [];
        }

        // Envelope-level extraction_metadata describes THIS extraction pass; it is denormalized
        // onto each candidate row below so nodes.jsonl stays the single store, and is null for
        // legacy candidates-only responses so the candidate-row schema stays additive.
        const extractionMetadata = this.normalizeExtractionMetadata(payload.extraction_metadata);

        const accepted = [];
        for (const raw of payload.candidates) {
            if (!raw || typeof raw !== 'object' || !raw.id || !raw.name) continue;

            // Dedupe against existing concepts (alias index is case-insensitive; also check node id)
            if (ConceptService.resolveAlias(raw.name)) continue;
            if (ConceptService.nodes.has(raw.id)) continue;

            accepted.push({
                id  : raw.id,
                name: raw.name,
                description: raw.description || `Mined candidate from ${sourceRef}. Awaiting curator review — promote by flipping \`validated: true\` and adjusting tier/weight in nodes.jsonl.`,
                aliases  : Array.isArray(raw.aliases) ? raw.aliases : [],
                source   : sourceRef,
                reasoning: raw.reasoning || '',
                ...CANDIDATE_DEFAULTS,
                ...(extractionMetadata ? {extraction_metadata: extractionMetadata} : {})
            });
        }

        return accepted;
    }

    /**
     * Loads and filters issue markdown files to the `epic`-labeled subset. Epics are the
     * curated distilled architectural documents — denser-per-char signal than session
     * summaries or architecture-labeled issues.
     * @returns {Promise<Object[]>} `[{sourceRef, text}]`
     * @protected
     */
    async loadEpicSources() {
        const issuesDir = this.issuesDir || path.resolve(__dirname, '../../../resources/content/issues');

        try {
            await fs.promises.access(issuesDir);
        } catch (e) {
            logger.warn(`[ConceptDiscoveryService] Issues directory not found at ${issuesDir}; skipping epic mining.`);
            return [];
        }

        const filesRaw = await fs.promises.readdir(issuesDir);
        const files    = filesRaw.filter(f => f.endsWith('.md'));
        const sources  = [];

        for (const file of files) {
            let content;
            try {
                content = await fs.promises.readFile(path.join(issuesDir, file), 'utf8');
            } catch (e) {
                continue;
            }

            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!fmMatch) continue;

            let meta;
            try {
                meta = yaml.load(fmMatch[1]);
            } catch (e) {
                continue;
            }

            const labels = Array.isArray(meta?.labels) ? meta.labels : [];
            if (!labels.includes('epic')) continue;

            sources.push({
                sourceRef: `epic-${meta.id || file.replace(/\.md$/, '')}`,
                text     : content
            });
        }

        return sources;
    }

    /**
     * Loads pull-request markdown files, sorted by numerical ID descending so the most
     * recent PRs process first. Capped at `this.prScanLimit` to bound LLM cost per cycle —
     * recent-PR-bias is deliberate since fresh architectural discourse lands in recent
     * review comments (`[ARCH_ALIGNMENT]`, `[RETROSPECTIVE]`, etc.).
     * @returns {Promise<Object[]>} `[{sourceRef, text}]`
     * @protected
     */
    async loadPullRequestSources() {
        const pullsDir = this.pullsDir || path.resolve(__dirname, '../../../resources/content/pulls');

        try {
            await fs.promises.access(pullsDir);
        } catch (e) {
            logger.warn(`[ConceptDiscoveryService] Pulls directory not found at ${pullsDir}; skipping PR mining.`);
            return [];
        }

        const filesRaw = await fs.promises.readdir(pullsDir);
        const files    = filesRaw.filter(f => /^pr-\d+\.md$/.test(f));

        // Sort descending by numeric PR id — freshest discourse first
        files.sort((a, b) => {
            const na = parseInt(a.match(/(\d+)/)[1], 10);
            const nb = parseInt(b.match(/(\d+)/)[1], 10);
            return nb - na;
        });

        const scanLimit   = this.prScanLimit ?? aiConfig.conceptDiscovery.prScanLimit;
        const cappedFiles = files.slice(0, scanLimit);
        const sources     = [];

        for (const file of cappedFiles) {
            let content;
            try {
                content = await fs.promises.readFile(path.join(pullsDir, file), 'utf8');
            } catch (e) {
                continue;
            }

            sources.push({
                sourceRef: `pull-${file.replace(/\.md$/, '')}`,
                text     : content
            });
        }

        return sources;
    }

    /**
     * Mines architectural concepts from `epic`-labeled GitHub issues via LLM extraction.
     * Each epic body → one LLM invocation → JSON candidates → dedupe against ConceptService.
     *
     * Returns `[]` gracefully when no epics exist or the LLM provider is unavailable.
     * @returns {Promise<Object[]>} Candidate concept records
     */
    async mineFromEpics() {
        const sources = await this.loadEpicSources();
        if (sources.length === 0) return [];

        logger.info(`[ConceptDiscoveryService] Epic mining: scanning ${sources.length} epic-labeled issue(s).`);

        const all = [];
        for (const {sourceRef, text} of sources) {
            const candidates = await this.extractConceptsFromSource(sourceRef, text);
            all.push(...candidates);
        }

        logger.info(`[ConceptDiscoveryService] Epic mining produced ${all.length} candidate(s).`);
        return all;
    }

    /**
     * Mines architectural concepts from recent pull-request markdown (body + comments).
     * PR review comments are a dense source of Gold Standards / Traps Avoided / Retrospective
     * vocabulary — exactly the prose where architectural discourse consolidates.
     *
     * Caps at `this.prScanLimit` most-recent PRs per cycle to bound LLM cost. Returns `[]`
     * gracefully when no PRs exist or the provider is unavailable.
     * @returns {Promise<Object[]>} Candidate concept records
     */
    async mineFromPullRequests() {
        const sources = await this.loadPullRequestSources();
        if (sources.length === 0) return [];

        logger.info(`[ConceptDiscoveryService] PR mining: scanning ${sources.length} recent PR file(s).`);

        const all = [];
        for (const {sourceRef, text} of sources) {
            const candidates = await this.extractConceptsFromSource(sourceRef, text);
            all.push(...candidates);
        }

        logger.info(`[ConceptDiscoveryService] PR mining produced ${all.length} candidate(s).`);
        return all;
    }

    /**
     * Runs both mining strategies sequentially (PRs typically produce more candidates; running
     * in parallel would hit the LLM provider with too many concurrent requests), merges and
     * dedupes by candidate ID, and appends new rows to `nodes.jsonl`. Idempotent across runs:
     * candidates already present in ConceptService (curated or previously-mined) are filtered
     * out in `extractConceptsFromSource` before append.
     *
     * Safe to call standalone (manual invocation via `DreamService.runConceptDiscovery`).
     * Does NOT touch the Native Edge Graph — `ConceptIngestor.syncConceptsToGraph` picks up
     * the new rows on its next run and materializes them as CONCEPT nodes with `validated:
     * false` flowing through to the graph property (so `GapInferenceEngine` silences them).
     * @returns {Promise<Object>} `{candidatesAdded, candidates}`
     */
    async runDiscoveryCycle() {
        if (!ConceptService.loaded) {
            try {
                ConceptService.loadGraph();
            } catch (e) {
                logger.warn('[ConceptDiscoveryService] ConceptService.loadGraph() failed — dedupe will be loose.', e.message);
            }
        }

        const epicCandidates = await this.mineFromEpics();
        const prCandidates   = await this.mineFromPullRequests();

        // Merge by id; epic-source wins on collision (tie-break is arbitrary but stable)
        const byId = new Map();
        for (const c of [...epicCandidates, ...prCandidates]) {
            if (!byId.has(c.id)) byId.set(c.id, c);
        }

        const unique = [...byId.values()];

        if (unique.length === 0) {
            logger.info('[ConceptDiscoveryService] No new candidates discovered this cycle.');
            return {candidatesAdded: 0, candidates: []};
        }

        await this.appendCandidates(unique);

        logger.info(`[ConceptDiscoveryService] Appended ${unique.length} candidate concept(s) to nodes.jsonl. Awaiting curator review (validated: false, tier: 3).`);

        return {candidatesAdded: unique.length, candidates: unique};
    }

    /**
     * Appends candidate nodes as new JSONL rows. Pure filesystem operation — does not touch
     * the graph. The next `ConceptIngestor.syncConceptsToGraph` picks them up.
     *
     * Each candidate serializes one per line matching the established schema
     * (`{id, name, tier, description, uniqueToNeo, tags, aliases, validated, verifiedAt, source, reasoning}`),
     * plus the optional `extraction_metadata` block when the LLM envelope carried one.
     * File is flush-written via `fs.promises.appendFile` which is atomic at the per-line level
     * on POSIX filesystems — safe for the single-writer REM pipeline pattern.
     * @param {Object[]} candidates
     * @throws {Error} `STORE_WRITE_GUARD` when invoked from a test-runner context against the
     *   production concepts dir (defense-in-depth via `assertTestWriteIsolated`) — never in production runtime.
     * @protected
     */
    async appendCandidates(candidates) {
        const
            conceptsDir = ConceptService.defaultConceptsDir || path.resolve(__dirname, '../../../.neo-ai-data/concepts'),
            nodesPath   = path.join(conceptsDir, 'nodes.jsonl');

        // Defense-in-depth: refuse a concept-ontology write to the production concepts dir from a
        // test-runner context (the orphan-bleed / backlog-corruption class). No-op in production
        // runtime (no test signal) and for disposable/tmp dirs — the file-store parallel to the
        // graph write-guard in SQLite.mjs.
        assertTestWriteIsolated({storePath: conceptsDir, subsystem: 'concept-ontology'});

        let existing = '';
        try {
            existing = await fs.promises.readFile(nodesPath, 'utf8');
        } catch (e) {
            logger.warn(`[ConceptDiscoveryService] nodes.jsonl not readable at ${nodesPath}; creating new file.`);
        }

        const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
        const serialized          = candidates.map(c => JSON.stringify(c)).join('\n');
        const toAppend            = (needsLeadingNewline ? '\n' : '') + serialized + '\n';

        await fs.promises.appendFile(nodesPath, toAppend, 'utf8');
    }
}

export default Neo.setupClass(ConceptDiscoveryService);
