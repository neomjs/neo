import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../src/Neo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRootDir = path.resolve(__dirname, '../../..');

/**
 * @module test/playwright/fixtures/knowledgeBaseConfigDefaults
 * @summary Deterministic Knowledge Base per-server config defaults for test assertions.
 *
 * Sub-2 of #11976 — per-server fixture establishing the Sub-1 (#11977/#11978)
 * pattern at the per-server (KB) tier. Tests asserting on canonical
 * KB-template-defined values (`sourcePaths`, `collectionName`, `path`, etc.)
 * should compare against {@link KB_DEFAULTS} rather than reading from the live
 * `ai/mcp/server/knowledge-base/config.mjs` overlay or the live overlay-merged
 * template singleton. The overlay is gitignored and operator-customized;
 * runtime-singleton reads are not deterministic across deployments.
 *
 * **Per-server vs Tier-1 boundary:**
 * - {@link KB_DEFAULTS} mirrors only KB-template-defined fields (those declared
 *   inline in `knowledge-base/config.template.mjs` `defaultConfig`).
 * - Tier-1 fields (`auth`, `engines.chroma.host/port`, `modelProvider`, etc.)
 *   that the KB template imports via `AiConfig.X` references are intentionally
 *   NOT mirrored here — assertions on those fields should use
 *   `TIER1_DEFAULTS` from `aiConfigDefaults.mjs` instead. Mixing them would
 *   create a second source of truth and reintroduce the drift this fixture
 *   exists to prevent.
 *
 * **Determinism contract:**
 * - Inlined from the KB template's canonical default values, not imported.
 *   Importing `ai/mcp/server/knowledge-base/config.template.mjs` would register
 *   `Neo.ai.mcp.server.knowledge-base.Config` at fixture-import time, which
 *   can collide with specs that override the singleton via per-test `delete`/
 *   restore patterns (e.g., `SourcePathsConfig.spec.mjs`). Plain-data inline
 *   sidesteps the class-registration ordering hazard, matching Sub-1's
 *   `aiConfigDefaults.mjs` pattern.
 * - Deep-cloned via `Neo.clone(obj, true, true)` (Neo's canonical deep-clone
 *   primitive) and recursively frozen via the local `deepFreeze` helper.
 *   Nested groups (`sourcePaths.ApiSource`, etc.) hold no shared references
 *   with any live config singleton.
 *
 * @see test/playwright/fixtures/aiConfigDefaults.mjs — Tier-1 sibling
 * @see ai/mcp/server/knowledge-base/config.template.mjs — KB-template source of truth
 */

/**
 * Recursively freezes every plain-object / array node in the given value.
 * Returns the same value for chaining. No-op on primitives + functions.
 *
 * Local to this fixture for the same reason as `aiConfigDefaults.mjs`: Neo
 * doesn't ship a recursive-freeze counterpart to `Neo.clone`. Retires when
 * (if) a `Neo.freeze` primitive lands.
 *
 * @param {*} value
 * @returns {*}
 */
function deepFreeze(value) {
    if (value === null || typeof value !== 'object') return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

/**
 * Deep-frozen snapshot of KB-template-defined default values. Use for
 * deterministic assertions in tests that would otherwise read the live
 * overlay-merged KB config singleton.
 *
 * Includes the KB-template-specific fields most commonly asserted on. For
 * Tier-1 fields the template imports via `AiConfig.X`, use `TIER1_DEFAULTS`
 * from `aiConfigDefaults.mjs` instead.
 *
 * @type {Readonly<Object>}
 */
export const KB_DEFAULTS = deepFreeze(Neo.clone({
    sourcePaths: {
        AdrSource         : 'learn/agentos/decisions',
        ConceptSource     : 'resources/content/concepts',
        ReleaseNotesSource: '.github/RELEASE_NOTES',
        SkillSource       : '.agents/skills',
        TestSource        : 'test/playwright',
        LearningSource    : 'learn/tree.json',
        DiscussionSource  : ['resources/content/discussions', 'resources/content/archive/discussions'],
        PullRequestSource : ['resources/content/pulls',       'resources/content/archive/pulls'],
        TicketSource      : ['resources/content/issues',      'resources/content/archive/issues'],
        ApiSource         : {
            'src'     : 'src',
            'apps'    : 'app',
            'examples': 'example',
            'docs/app': 'app',
            'ai'      : 'ai-infrastructure'
        },
        RawRepoSource     : {
            root             : '.',
            includeExtensions: [],
            excludeExtensions: [
                '.7z', '.avif', '.bin', '.bmp', '.bz2', '.class', '.dmg', '.eot',
                '.exe', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.lockb',
                '.mov', '.mp3', '.mp4', '.otf', '.pdf', '.png', '.sqlite', '.tar',
                '.tgz', '.ttf', '.wasm', '.webm', '.webp', '.woff', '.woff2', '.zip'
            ],
            excludePaths: [
                '.git',
                '.neo-ai-data',
                'coverage',
                'dist',
                'docs/output',
                'node_modules',
                'package-lock.json',
                'playwright-report',
                'resources/examples',
                'resources/fonts',
                'resources/images',
                'test-results',
                'yarn.lock'
            ]
        }
    },
    collectionName    : 'neo-knowledge-base',
    path              : path.resolve(neoRootDir, '.neo-ai-data/chroma/unified'),
    dataPath          : path.resolve(neoRootDir, 'dist/ai-knowledge-base.jsonl'),
    hierarchyPath     : path.resolve(neoRootDir, 'docs/output/class-hierarchy.json'),
    logPath           : path.resolve(neoRootDir, '.neo-ai-data/logs'),
    defaultTenantId   : 'neo-shared',
    defaultRepoSlug   : 'neo',
    defaultVisibility : 'team',
    spoofRejectionMode: 'overwrite',
    useDefaultSources : true,
    rawRepoSource     : false,
    useDefaultParsers : true,
    batchSize         : 50,
    batchDelay        : 10000,
    maxRetries        : 5,
    nResults          : 100,
    transport         : 'stdio',
    mcpHttpPort       : 3000
}, true, true));
