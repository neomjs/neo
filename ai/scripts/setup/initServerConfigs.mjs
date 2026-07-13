import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * @module ai/scripts/setup/initServerConfigs
 * @summary Bootstrap script for the top-level Tier-1 `ai/config.mjs` AND each
 * per-server `config.mjs` under `ai/mcp/server/`. Runs at `npm prepare`.
 *
 * Two responsibilities for every (`config.template.mjs`, `config.mjs`) pair:
 *
 * 1. **First-time clone:** when the gitignored `config.mjs` is missing, copy
 *    `config.template.mjs` over it. Server configs materialize their Tier-1
 *    import from template to operator overlay during that copy.
 * 2. **Drift detection:** when `config.mjs` already exists, compare its
 *    structural shape (top-level imports + named exports) against the template.
 *    Mismatched items emit a stderr warning listing what's new in the template.
 *    Operator can refresh the gitignored file by re-running with
 *    `npm run prepare -- --migrate-config`. Pure Tier-1 import materialization
 *    drift is patched in place; broader structural drift still overwrites from
 *    the active template shape.
 *
 * The Tier-1 pair is the canonical operator overlay for deployment-wide defaults
 * (cookbook §7). Runtime code MUST import from `ai/config.mjs`, never from
 * `ai/config.template.mjs` directly — otherwise the operator overlay is bypassed.
 *
 * The drift detector is regex-based by design. AST parsing was rejected as
 * dependency weight inappropriate for a small bootstrap script; re-evaluate only
 * if structural drift starts hiding inside conditional / dynamic imports.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const cwd        = path.resolve(__dirname, '../../../');
const serversDir = path.join(cwd, 'ai', 'mcp', 'server');
const aiDir      = path.join(cwd, 'ai');

const MIGRATE_FLAG                = '--migrate-config';
const MATERIALIZED_SERVER_IMPORTS = new Set([
    '../../../config.mjs',
    '../../../config.mjs:default'
]);

/**
 * @summary True when an `ai/mcp/server/<name>/` directory ships a `config.template.mjs`.
 *
 * The single definition of "this server has a bootstrappable config" — shared by
 * {@link initConfigs} (which reports templateless dirs as `skip-no-template`) and
 * {@link listServersWithTemplates}, so the predicate cannot drift across the config-bootstrap
 * call-sites that consume it.
 *
 * @param {String} serverPath Absolute path to a single `ai/mcp/server/<name>/` directory.
 * @returns {Boolean}
 */
export function hasConfigTemplate(serverPath) {
    return fs.existsSync(path.join(serverPath, 'config.template.mjs'));
}

/**
 * @summary Lists the `ai/mcp/server/*` directory names that ship a `config.template.mjs`, sorted.
 *
 * Synchronous so it can seed a module-load-time const — `bootstrapWorktree`'s `BOOTSTRAP_CONFIGS`
 * consumes it to hydrate fresh-worktree overlays. Built on the same {@link hasConfigTemplate}
 * predicate `initConfigs` applies, so "which servers are bootstrappable" has one answer across
 * both paths.
 *
 * @param {String} [serversRoot=serversDir] Override for tests.
 * @returns {String[]} Sorted server directory names containing a `config.template.mjs`.
 */
export function listServersWithTemplates(serversRoot = serversDir) {
    if (!fs.existsSync(serversRoot)) return [];

    return fs.readdirSync(serversRoot)
        .filter(name => fs.statSync(path.join(serversRoot, name)).isDirectory())
        .filter(name => hasConfigTemplate(path.join(serversRoot, name)))
        .sort();
}

/**
 * Finds the closing parenthesis for a source-text call while ignoring quoted content.
 *
 * @param {String} src       Source text.
 * @param {Number} openIndex Index of the opening `(`.
 * @returns {Number}
 */
function findClosingParen(src, openIndex) {
    let quote  = null;
    let depth  = 0;
    let escape = false;

    for (let i = openIndex; i < src.length; i++) {
        const char = src[i];

        if (quote) {
            if (escape) {
                escape = false;
            } else if (char === '\\') {
                escape = true;
            } else if (char === quote) {
                quote = null;
            }
            continue
        }

        if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            continue
        }

        if (char === '(') {
            depth++;
        } else if (char === ')') {
            depth--;
            if (depth === 0) {
                return i
            }
        }
    }

    return -1
}

/**
 * Splits a function-call argument list on top-level commas only.
 *
 * @param {String} src Function-call argument text without the enclosing parentheses.
 * @returns {String[]}
 */
function splitTopLevelArgs(src) {
    const args   = [];
    let   quote  = null;
    let   depth  = 0;
    let   start  = 0;
    let   escape = false;

    for (let i = 0; i < src.length; i++) {
        const char = src[i];

        if (quote) {
            if (escape) {
                escape = false;
            } else if (char === '\\') {
                escape = true;
            } else if (char === quote) {
                quote = null;
            }
            continue
        }

        if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            continue
        }

        if (char === '(' || char === '[' || char === '{') {
            depth++;
            continue
        }

        if (char === ')' || char === ']' || char === '}') {
            depth--;
            continue
        }

        if (char === ',' && depth === 0) {
            args.push(src.slice(start, i).trim());
            start = i + 1;
        }
    }

    args.push(src.slice(start).trim());

    return args
}

/**
 * Extracts a plain single- or double-quoted string literal value.
 *
 * @param {String} src Candidate source expression.
 * @returns {String|null}
 */
function stringLiteralValue(src) {
    const value = src.trim();
    const quote = value[0];

    if ((quote === '\'' || quote === '"') && value[value.length - 1] === quote) {
        return value.slice(1, -1)
    }

    return null
}

/**
 * Normalizes an AiConfig `leaf()` default expression for stable source-shape comparison.
 *
 * @param {String} src Default-expression source.
 * @returns {String}
 */
function normalizeLeafDefault(src) {
    return src.trim().replace(/\s+/g, ' ')
}

/**
 * Builds the same-env/type/key identity used to compare leaf defaults across files.
 *
 * @param {{key: String, env: String, type: String}} leaf Leaf-default descriptor.
 * @returns {String}
 */
function leafDefaultIdentity(leaf) {
    return `${leaf.key}:${leaf.env}:${leaf.type}`
}

/**
 * Builds the stable identity for requiredness metadata attached to an env-bound leaf.
 *
 * @param {{key: String, env: String, type: String, metadata: String}} leaf Leaf-requiredness descriptor.
 * @returns {String}
 */
function leafRequirednessIdentity(leaf) {
    return `${leaf.key} (${leaf.env}, ${leaf.type}): ${leaf.metadata}`
}

/**
 * Builds a stable sort key for projected leaf-default descriptors.
 *
 * @param {{key: String, env: String, type: String, default: String}} leaf Leaf-default descriptor.
 * @returns {String}
 */
function leafDefaultSortKey(leaf) {
    return `${leafDefaultIdentity(leaf)}:${leaf.default}`
}

/**
 * Projects env-bound `key: leaf(default, 'ENV', 'type')` calls from config source text.
 *
 * @param {String} src Source text.
 * @returns {Array<{key: String, env: String, type: String, default: String}>}
 */
function projectLeafDefaults(src) {
    const leafDefaults = [];
    const leafPattern  = /([A-Za-z_$][\w$]*)\s*:\s*leaf\s*\(/g;

    for (const match of src.matchAll(leafPattern)) {
        const openIndex  = match.index + match[0].lastIndexOf('(');
        const closeIndex = findClosingParen(src, openIndex);

        if (closeIndex === -1) continue;

        const args = splitTopLevelArgs(src.slice(openIndex + 1, closeIndex));
        if (args.length < 3) continue;

        const env  = stringLiteralValue(args[1]);
        const type = stringLiteralValue(args[2]);

        if (!env || !type || !/^[A-Z][A-Z0-9_]+$/.test(env)) continue;

        leafDefaults.push({
            key    : match[1],
            env,
            type,
            default: normalizeLeafDefault(args[0])
        });
    }

    return leafDefaults.sort((a, b) => leafDefaultSortKey(a).localeCompare(leafDefaultSortKey(b)))
}

/**
 * Projects `requiredFor` metadata on env-bound `leaf(...)` calls.
 *
 * A metadata-only addition to an existing leaf changes runtime readiness semantics while leaving
 * imports and env-var literals unchanged. This projection makes stale gitignored overlays visible
 * when a template adds the fourth-argument requiredness contract to an existing leaf.
 *
 * @param {String} src Source text.
 * @returns {String[]} Stable requiredness descriptors.
 */
function projectRequiredLeaves(src) {
    const requiredLeaves = [];
    const leafPattern    = /([A-Za-z_$][\w$]*)\s*:\s*leaf\s*\(/g;

    for (const match of src.matchAll(leafPattern)) {
        const openIndex  = match.index + match[0].lastIndexOf('(');
        const closeIndex = findClosingParen(src, openIndex);

        if (closeIndex === -1) continue;

        const args = splitTopLevelArgs(src.slice(openIndex + 1, closeIndex));
        if (args.length < 4 || !/\brequiredFor\s*:/.test(args[3])) continue;

        const env  = stringLiteralValue(args[1]);
        const type = stringLiteralValue(args[2]);

        if (!env || !type || !/^[A-Z][A-Z0-9_]+$/.test(env)) continue;

        requiredLeaves.push(leafRequirednessIdentity({
            key     : match[1],
            env,
            type,
            metadata: normalizeLeafDefault(args[3])
        }))
    }

    return requiredLeaves.sort()
}

/**
 * Formats a changed leaf default for operator-facing drift warnings.
 *
 * @param {{key: String, env: String, type: String, configDefault: String, templateDefault: String}} leaf Drift item.
 * @returns {String}
 */
export function formatChangedLeafDefault(leaf) {
    return `${leaf.key} (${leaf.env}, ${leaf.type}): ${leaf.configDefault} -> ${leaf.templateDefault}`
}

/**
 * Formats template-vs-overlay drift into stable operator-facing rows.
 *
 * @param {{missingImports: String[], missingExports: String[], missingEnvVars: String[], missingRequiredLeaves: String[], changedLeafDefaults: Object[]}} drift Drift shape.
 * @returns {String[]}
 */
export function formatStaleOverlayDriftItems(drift) {
    return [
        ...drift.missingImports.map(item => `import: ${item}`),
        ...drift.missingExports.map(item => `export: ${item}`),
        ...drift.missingEnvVars.map(item => `env: ${item}`),
        ...drift.missingRequiredLeaves.map(item => `required-leaf: ${item}`),
        ...drift.changedLeafDefaults.map(item => `leaf-default: ${formatChangedLeafDefault(item)}`)
    ]
}

/**
 * Projects a `.mjs` file's structural shape — the surface that `initServerConfigs`
 * watches for drift between template and gitignored config.
 *
 * The `imports` projection is two-tiered to cover both whole-import drift AND
 * same-source named-specifier drift. The latter is the dominant evolution mode
 * for the canonical config templates — adding `parseUrl` to the existing
 * `import {parsePort, parseBool} from '../../../../src/util/Env.mjs'` block
 * is structural drift even though the source path is unchanged.
 *
 * - **Whole-import entries** (source-path strings, e.g. `'../../../../src/util/Env.mjs'`):
 *   detect missing imports — the gitignored config doesn't import from a path
 *   the template imports from at all.
 * - **Named-specifier entries** (`<source>:<specifier>` strings, e.g.
 *   `'../../../../src/util/Env.mjs:parseUrl'`): detect missing named
 *   specifiers within a shared source path. Both default imports
 *   (`import x from '...'` → `<source>:default`) and namespace imports
 *   (`import * as x from '...'` → `<source>:*`) are projected. `as`-aliases
 *   are normalized to the imported (left-side) name; the local alias doesn't
 *   participate in shape comparison.
 *
 * Multi-line `import {\n  a,\n  b\n} from '...'` blocks are matched via
 * lazy-cross-newline `[\s\S]*?` because `.*?` would not span newlines under
 * the `gm` flag.
 *
 * - **Named exports**: identifiers inside `export { a, b }` blocks. Currently
 *   unused by the canonical config templates (which use `export default ...`),
 *   but kept as forward-compat surface — if templates evolve to add named-export
 *   blocks, the detector picks them up without code change.
 *
 * - **Env-var literals**: UPPER_SNAKE string literals (the `env` arg of each `leaf(...)`). New
 *   entries flag a template that added a config leaf — `data`-tree drift the import/export
 *   projection cannot see. See the inline note in {@link projectSourceShape}.
 * - **Env-bound leaf defaults**: stable descriptors for `key: leaf(default, 'NEO_FOO', 'type')`
 *   calls. Same-env default flips are semantic AiConfig drift; env-var projection alone treats
 *   `leaf('gemini', 'NEO_MODEL_PROVIDER', 'string')` and
 *   `leaf('openAiCompatible', 'NEO_MODEL_PROVIDER', 'string')` as equal.
 * - **Required leaves**: stable descriptors for fourth-argument `requiredFor` metadata. This catches
 *   a readiness-contract addition to an existing leaf, where imports/env vars/defaults are unchanged.
 *
 * @param {String} src Source text to project.
 * @returns {{imports: String[], exports: String[], envVars: String[], leafDefaults: Object[], requiredLeaves: String[]}}
 */
export function projectSourceShape(src) {
    const imports = [];

    for (const match of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
        const body   = match[1];
        const source = match[2];

        imports.push(source);

        const namedBlock = body.match(/\{([^}]+)\}/);
        if (namedBlock) {
            for (const raw of namedBlock[1].split(',')) {
                const cleaned = raw.trim();
                if (!cleaned) continue;
                const imported = cleaned.split(/\s+as\s+/)[0].trim();
                if (imported) {
                    imports.push(`${source}:${imported}`);
                }
            }
        }

        const defaultMatch = body.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/);
        if (defaultMatch) {
            imports.push(`${source}:default`);
        }

        const namespaceMatch = body.match(/\*\s+as\s+[A-Za-z_$][\w$]*/);
        if (namespaceMatch) {
            imports.push(`${source}:*`);
        }
    }

    // Bare side-effect imports (`import '<source>';` — no `from` clause): e.g. the Tier-1 realm-root load
    // that makes a server config participate in the hierarchy. Track them so a template that ADDS a
    // participation import registers as drift a config.mjs must materialize — the detection gap that let
    // non-participating server overlays boot with getParent() unable to resolve the realm root.
    for (const bare of src.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) {
        imports.push(bare[1]);
    }

    imports.sort();

    const exports = [...src.matchAll(/^export\s+\{([^}]+)\}/gm)]
        .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean))
        .sort();

    // Env-var leaf projection. Every env-bound `leaf(default, 'NEO_FOO', type)` names its env var
    // as an UPPER_SNAKE string literal. Projecting those literals lets the detector catch a template
    // that added a NEW config leaf — a `data`-tree change the import/export projection is otherwise
    // blind to (the dominant drift mode for non-import config evolution, e.g. a new auth mode flag) —
    // without AST-parsing the nested data object. Dedup + sort for a stable shape. The UPPER_SNAKE
    // shape excludes lowercase type tokens (`'string'`) and default values (`'oidc'`), so the
    // projection isolates env names.
    const envVars = [...new Set(
        [...src.matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map(m => m[1])
    )].sort();

    const
        leafDefaults   = projectLeafDefaults(src),
        requiredLeaves = projectRequiredLeaves(src);

    return {imports, exports, envVars, leafDefaults, requiredLeaves}
}

export async function projectShape(filePath) {
    const src = await fs.readFile(filePath, 'utf-8');

    return projectSourceShape(src)
}

/**
 * Converts tracked server templates into runtime operator overlays.
 *
 * Source templates import the tracked Tier-1 template so unit tests never consume
 * gitignored local overlays. Generated server `config.mjs` files still need the
 * operator overlay, so the bootstrap copy step rewrites that one source import.
 *
 * @param {String} src Template source.
 * @returns {String}
 */
export function materializeServerConfigTemplate(src) {
    return src
        .replaceAll("from '../../../config.template.mjs'", "from '../../../config.mjs'")
        .replaceAll('from "../../../config.template.mjs"', 'from "../../../config.mjs"')
        // Side-effect imports of the Tier-1 template (a server config that loads it only to register
        // the realm root) must also point at the operator overlay in the generated runtime config.
        .replaceAll("import '../../../config.template.mjs'", "import '../../../config.mjs'")
        .replaceAll('import "../../../config.template.mjs"', 'import "../../../config.mjs"')
}

/**
 * Detects the narrow drift shape where an existing per-server `config.mjs`
 * only needs its Tier-1 import materialized, not a full template overwrite.
 *
 * @param {{missingImports: String[], missingExports: String[], missingEnvVars: String[], missingRequiredLeaves: String[], changedLeafDefaults: Object[], hasDrift: Boolean}} drift Drift shape (`missingEnvVars` / `missingRequiredLeaves` / `changedLeafDefaults` optional on hand-built fixtures).
 * @returns {Boolean}
 */
export function isOnlyServerMaterializationDrift(drift) {
    return Boolean(
        drift.hasDrift &&
        drift.missingExports.length === 0 &&
        // A new env-bound leaf (data-tree drift) needs the full template refresh, not an
        // import-only patch — so env-var drift disqualifies the materialize-only fast path.
        (drift.missingEnvVars?.length ?? 0) === 0 &&
        (drift.missingRequiredLeaves?.length ?? 0) === 0 &&
        (drift.changedLeafDefaults?.length ?? 0) === 0 &&
        drift.missingImports.length > 0 &&
        drift.missingImports.every(i => MATERIALIZED_SERVER_IMPORTS.has(i))
    )
}

/**
 * Compares two projected shapes and returns the drift items present in
 * `templateShape` but missing from `configShape`. Symmetric drift (items in
 * config but not in template — operator-removed paths) is intentionally NOT
 * reported, since this is a one-way "template advanced, config stale" detector.
 *
 * @param {{imports: String[], exports: String[], envVars: String[], leafDefaults: Object[], requiredLeaves: String[]}} templateShape Projected template shape (`envVars` / `leafDefaults` / `requiredLeaves` optional on hand-built fixtures).
 * @param {{imports: String[], exports: String[], envVars: String[], leafDefaults: Object[], requiredLeaves: String[]}} configShape Projected config shape (same optionality).
 * @returns {{missingImports: String[], missingExports: String[], missingEnvVars: String[], missingRequiredLeaves: String[], changedLeafDefaults: Object[], hasDrift: Boolean}}
 */
export function detectDrift(templateShape, configShape) {
    const missingImports = templateShape.imports.filter(i => !configShape.imports.includes(i));
    const missingExports = templateShape.exports.filter(e => !configShape.exports.includes(e));
    // `envVars` is optional on hand-built shapes (e.g. unit fixtures) → default to empty.
    const missingEnvVars        = (templateShape.envVars || []).filter(e => !(configShape.envVars || []).includes(e));
    const missingRequiredLeaves = (templateShape.requiredLeaves || []).filter(e => !(configShape.requiredLeaves || []).includes(e));
    const configLeafDefaults    = new Map((configShape.leafDefaults || []).map(leaf => [leafDefaultIdentity(leaf), leaf]));
    const changedLeafDefaults   = (templateShape.leafDefaults || [])
        .map(templateLeaf => {
            const configLeaf = configLeafDefaults.get(leafDefaultIdentity(templateLeaf));

            if (!configLeaf || configLeaf.default === templateLeaf.default) {
                return null
            }

            return {
                key            : templateLeaf.key,
                env            : templateLeaf.env,
                type           : templateLeaf.type,
                templateDefault: templateLeaf.default,
                configDefault  : configLeaf.default
            }
        })
        .filter(Boolean);

    return {
        missingImports,
        missingExports,
        missingEnvVars,
        missingRequiredLeaves,
        changedLeafDefaults,
        hasDrift: missingImports.length + missingExports.length + missingEnvVars.length + missingRequiredLeaves.length + changedLeafDefaults.length > 0
    }
}

/**
 * @summary True for the class-subclass overlay shape introduced by the inheritance root fix.
 *
 * Snapshot overlays must receive full missing-leaf diffing. Subclass overlays inherit absent leaves
 * by construction, so local preflight should only flag same-leaf conflicts that the subclass explicitly
 * overrides.
 *
 * @param {String} src Active overlay source.
 * @returns {Boolean}
 */
function isSubclassOverlaySource(src) {
    return /\bextends\s+[A-Za-z_$][\w$]*\b/.test(src)
}

/**
 * @summary Detects only residual conflicts in subclass-style overlays.
 *
 * A subclass overlay may omit most template leaves because inheritance supplies them. The residual stale
 * class is an explicit leaf in the subclass that still targets a template-owned env/type identity but no
 * longer matches the template default. New operator-only leaves stay local and are not template drift.
 *
 * @param {{leafDefaults: Object[]}} templateShape Projected template shape.
 * @param {{leafDefaults: Object[]}} configShape Projected active overlay shape.
 * @returns {{missingImports: String[], missingExports: String[], missingEnvVars: String[], missingRequiredLeaves: String[], changedLeafDefaults: Object[], hasDrift: Boolean}}
 */
function detectSubclassOverlayResidualDrift(templateShape, configShape) {
    const templateLeafDefaults = new Map((templateShape.leafDefaults || []).map(leaf => [leafDefaultIdentity(leaf), leaf]));
    const changedLeafDefaults  = (configShape.leafDefaults || [])
        .map(configLeaf => {
            const templateLeaf = templateLeafDefaults.get(leafDefaultIdentity(configLeaf));

            if (!templateLeaf || configLeaf.default === templateLeaf.default) {
                return null
            }

            return {
                key            : configLeaf.key,
                env            : configLeaf.env,
                type           : configLeaf.type,
                templateDefault: templateLeaf.default,
                configDefault  : configLeaf.default
            }
        })
        .filter(Boolean);

    return {
        missingImports       : [],
        missingExports       : [],
        missingEnvVars       : [],
        missingRequiredLeaves: [],
        changedLeafDefaults,
        hasDrift             : changedLeafDefaults.length > 0
    }
}

/**
 * @summary Collects stale local config overlays for advisory local-dev preflight reporting.
 *
 * This is the read-only sibling of {@link initTier1Config} / {@link initConfigs}: it never clones,
 * migrates, or throws. It exists for `agent-preflight`, where stale gitignored overlays should be
 * visible before PR/review churn but must not turn an unrelated source preflight into a hard fail.
 *
 * @param {Object} [options]
 * @param {String} [options.aiRoot=aiDir] Tier-1 root containing `config.template.mjs` / `config.mjs`.
 * @param {String} [options.serversRoot=serversDir] Server root containing per-server config templates.
 * @returns {Array<{label: String, drift: Object, items: String[]}>}
 */
export function collectStaleOverlayFindings({aiRoot = aiDir, serversRoot = serversDir} = {}) {
    const findings = [];

    const collectPair = ({activePath, label, materializeTemplate = source => source, templatePath}) => {
        if (!fs.existsSync(templatePath) || !fs.existsSync(activePath)) {
            return
        }

        const
            templateSrc   = materializeTemplate(fs.readFileSync(templatePath, 'utf-8')),
            activeSrc     = fs.readFileSync(activePath, 'utf-8'),
            templateShape = projectSourceShape(templateSrc),
            activeShape   = projectSourceShape(activeSrc),
            drift         = isSubclassOverlaySource(activeSrc)
                ? detectSubclassOverlayResidualDrift(templateShape, activeShape)
                : detectDrift(templateShape, activeShape);

        if (drift.hasDrift) {
            findings.push({
                label,
                drift,
                items: formatStaleOverlayDriftItems(drift)
            })
        }
    };

    collectPair({
        activePath  : path.join(aiRoot, 'config.mjs'),
        label       : 'Tier-1 ai/config.mjs',
        templatePath: path.join(aiRoot, 'config.template.mjs')
    });

    if (!fs.existsSync(serversRoot)) {
        return findings
    }

    for (const serverName of fs.readdirSync(serversRoot).sort()) {
        const serverPath = path.join(serversRoot, serverName);

        if (!fs.statSync(serverPath).isDirectory()) {
            continue
        }

        collectPair({
            activePath         : path.join(serverPath, 'config.mjs'),
            label              : `${serverName}/config.mjs`,
            materializeTemplate: materializeServerConfigTemplate,
            templatePath       : path.join(serverPath, 'config.template.mjs')
        })
    }

    return findings
}

/**
 * Iterates over each MCP server under `ai/mcp/server/*` and ensures its
 * `config.mjs` exists. Three branches per server:
 *
 *   1. Template absent — skip (log warning).
 *   2. Config missing — clone materialized template (preserves legacy first-run behavior).
 *   3. Config present + drift detected — warn-only (default) OR migrate when
 *      invoked with `--migrate-config`. Pure Tier-1 import materialization
 *      patches the existing file in place; broader drift overwrites from the
 *      materialized template.
 *
 * @param {Object}   [options]
 * @param {String[]} [options.argv=process.argv]   Argv source; injectable for tests.
 * @param {Object}   [options.logger=console]      Log sink; injectable for tests.
 * @param {String}   [options.serversRoot=serversDir]  Override for tests.
 * @returns {Promise<{processed: Array<{serverName: String, action: String, drift: Object, migration: String}>}>} Per-server results; `action` is one of `clone` / `silent` / `warn` / `migrate` / `skip-no-template`; `drift` / `migration` present per action.
 */
export async function initConfigs({argv = process.argv, logger = console, serversRoot = serversDir} = {}) {
    logger.log('[Neo AI] Checking MCP Server configurations...');

    if (!fs.existsSync(serversRoot)) {
        logger.warn('[Neo AI] MCP Server directory not found, skipping config initialization.');
        return {processed: []}
    }

    const migrate   = argv.includes(MIGRATE_FLAG);
    const servers   = await fs.readdir(serversRoot);
    const processed = [];

    for (const serverName of servers) {
        const serverPath = path.join(serversRoot, serverName);
        const stat       = await fs.stat(serverPath);
        if (!stat.isDirectory()) continue;

        const templatePath = path.join(serverPath, 'config.template.mjs');
        const activePath   = path.join(serverPath, 'config.mjs');

        if (!hasConfigTemplate(serverPath)) {
            processed.push({serverName, action: 'skip-no-template'});
            continue;
        }

        const activeTemplateSrc = materializeServerConfigTemplate(await fs.readFile(templatePath, 'utf-8'));

        if (!fs.existsSync(activePath)) {
            logger.log(`[Neo AI] Config missing for MCP server '${serverName}'. Cloning from template...`);
            await fs.writeFile(activePath, activeTemplateSrc, 'utf-8');
            processed.push({serverName, action: 'clone'});
            continue;
        }

        const activeSrc = await fs.readFile(activePath, 'utf-8');
        const drift     = detectDrift(
            projectSourceShape(activeTemplateSrc),
            projectSourceShape(activeSrc)
        );

        if (!drift.hasDrift) {
            processed.push({serverName, action: 'silent'});
            continue;
        }

        if (migrate) {
            const materializedActiveSrc = materializeServerConfigTemplate(activeSrc);

            if (isOnlyServerMaterializationDrift(drift) && materializedActiveSrc !== activeSrc) {
                logger.log(`[Neo AI] Materializing stale Tier-1 import for '${serverName}' (${MIGRATE_FLAG} set, preserving operator edits)...`);
                await fs.writeFile(activePath, materializedActiveSrc, 'utf-8');
                processed.push({serverName, action: 'migrate', migration: 'materialize-import-only', drift});
                continue;
            }

            logger.log(`[Neo AI] Migrating stale config for '${serverName}' (drift detected, ${MIGRATE_FLAG} set)...`);
            await fs.writeFile(activePath, activeTemplateSrc, 'utf-8');
            processed.push({serverName, action: 'migrate', drift});
        } else {
            logger.warn(`[Neo AI] Stale config.mjs for '${serverName}' — template has evolved:`);
            drift.missingImports.forEach(i => logger.warn(`  + import: ${i}`));
            drift.missingExports.forEach(e => logger.warn(`  + export: ${e}`));
            drift.missingEnvVars.forEach(e => logger.warn(`  + env: ${e}`));
            drift.missingRequiredLeaves.forEach(e => logger.warn(`  + required-leaf: ${e}`));
            drift.changedLeafDefaults.forEach(leaf => logger.warn(`  + leaf-default: ${formatChangedLeafDefault(leaf)}`));
            logger.warn(`  Run \`npm run prepare -- ${MIGRATE_FLAG}\` to refresh (gitignored; safe).`);
            processed.push({serverName, action: 'warn', drift});
        }
    }

    return {processed}
}

/**
 * Ensures the top-level Tier-1 `ai/config.mjs` exists and is in shape-parity
 * with `ai/config.template.mjs`. Runtime code MUST import from `ai/config.mjs`
 * (the operator overlay), never from `ai/config.template.mjs` directly —
 * otherwise the overlay is bypassed and operator customizations don't propagate.
 *
 * Same three branches as `initConfigs`:
 *
 *   1. Template absent — skip (log warning).
 *   2. Config missing — clone template.
 *   3. Config present + drift detected — warn-only (default) OR overwrite
 *      from template when invoked with `--migrate-config`.
 *
 * @param {Object} [options]
 * @param {String[]} [options.argv=process.argv]   Argv source; injectable for tests.
 * @param {Object}   [options.logger=console]      Log sink; injectable for tests.
 * @param {String}   [options.aiRoot=aiDir]        Override for tests.
 * @returns {Promise<{action: String, drift: Object}>} `action` is one of `clone` / `silent` / `warn` / `migrate` / `skip-no-template`; `drift` present when drift was detected.
 */
export async function initTier1Config({argv = process.argv, logger = console, aiRoot = aiDir} = {}) {
    logger.log('[Neo AI] Checking top-level Tier-1 config...');

    const templatePath = path.join(aiRoot, 'config.template.mjs');
    const activePath   = path.join(aiRoot, 'config.mjs');

    if (!fs.existsSync(templatePath)) {
        logger.warn('[Neo AI] ai/config.template.mjs not found; skipping Tier-1 config initialization.');
        return {action: 'skip-no-template'}
    }

    if (!fs.existsSync(activePath)) {
        logger.log('[Neo AI] Tier-1 ai/config.mjs missing. Cloning from template...');
        await fs.copy(templatePath, activePath);
        return {action: 'clone'}
    }

    const drift = detectDrift(
        await projectShape(templatePath),
        await projectShape(activePath)
    );

    if (!drift.hasDrift) {
        return {action: 'silent'}
    }

    const migrate = argv.includes(MIGRATE_FLAG);

    if (migrate) {
        logger.log(`[Neo AI] Migrating stale Tier-1 ai/config.mjs (drift detected, ${MIGRATE_FLAG} set)...`);
        await fs.copy(templatePath, activePath);
        return {action: 'migrate', drift}
    }

    logger.warn('[Neo AI] Stale Tier-1 ai/config.mjs — template has evolved:');
    drift.missingImports.forEach(i => logger.warn(`  + import: ${i}`));
    drift.missingExports.forEach(e => logger.warn(`  + export: ${e}`));
    drift.missingEnvVars.forEach(e => logger.warn(`  + env: ${e}`));
    drift.missingRequiredLeaves.forEach(e => logger.warn(`  + required-leaf: ${e}`));
    drift.changedLeafDefaults.forEach(leaf => logger.warn(`  + leaf-default: ${formatChangedLeafDefault(leaf)}`));
    logger.warn(`  Run \`npm run prepare -- ${MIGRATE_FLAG}\` to refresh (gitignored; safe).`);

    return {action: 'warn', drift}
}

/**
 * @summary Boot-time freshness guard. Throws if a materialized overlay (`config.mjs`) is missing
 * structural leaves its template (`config.template.mjs`) added — the crash-causing drift class that
 * otherwise surfaces as a cryptic `reading '<x>' of undefined` at runtime (the stale-overlay-crash
 * incident). Reuses the prepare-time {@link detectDrift} / {@link projectShape} detection but FAILS
 * FAST at boot, scoped to CRASH-CAUSING drift (missing imports / exports / env-leaves); benign drift
 * (a changed default for a leaf that still exists) warns rather than throws.
 *
 * Pairs with {@link initConfigs} / {@link initTier1Config}: those WARN at `npm prepare`; this is the
 * last-line boot guard for the `git-pull-without-prepare` window, so a stale overlay names its missing
 * leaves + the `--migrate-config` fix instead of crashing every consumer cryptically.
 *
 * @param {Object}   [options]
 * @param {Object[]} [options.requiredFindings=[]] Required-env findings the ENTRYPOINT already computed by
 *   reading `AiConfig` / its own server config at its use site (`config.validateRequiredEnv(...)`) and
 *   passed in as a value. This guard is a non-entrypoint, so it never reads the SSOT itself — the
 *   entrypoint injects the computed findings (a narrow bootstrap boundary), never the config object.
 * @param {String}   [options.serverPath] An `ai/mcp/server/<name>/` dir whose `config.mjs` overlay to
 *   additionally check; its Tier-1 import is materialized before the shape-compare (matching
 *   {@link initConfigs}) so the template-vs-overlay import path is not read as false drift.
 * @param {String}   [options.aiRoot=aiDir]  Tier-1 root; `ai/config.mjs` is always checked.
 * @param {Object}   [options.logger=console] Log sink; injectable for tests.
 * @param {Boolean}  [options.useConfigTemplates] Whether the process resolver has activated the
 *   committed template graph instead of materialized overlays. Defaults to the resolver-owned
 *   `NEO_TEST_CONFIG_TEMPLATES` boundary. Overlay drift is irrelevant in that mode because no
 *   overlay participates in the running module graph; required-env findings remain enforced.
 * @returns {Promise<void>}
 * @throws {Error} on crash-causing overlay drift or missing required env state, naming the fix.
 */
export async function assertConfigFresh({
    aiRoot = aiDir,
    logger = console,
    requiredFindings = [],
    serverPath,
    useConfigTemplates = process.env.NEO_TEST_CONFIG_TEMPLATES === 'true'
} = {}) {
    const stale = [];

    const record = (label, drift) => {
        const crashCausing = [
            ...drift.missingImports,
            ...drift.missingExports,
            ...drift.missingEnvVars,
            ...(drift.missingRequiredLeaves ?? [])
        ];

        if (crashCausing.length > 0) {
            stale.push({label, missing: crashCausing});
        } else if (drift.hasDrift) {
            logger.warn(`[Neo AI] ${label}: benign config drift (changed default only) — run \`npm run prepare -- ${MIGRATE_FLAG}\` to refresh (non-fatal).`);
        }
    };

    const tier1Template = path.join(aiRoot, 'config.template.mjs'),
          tier1Active   = path.join(aiRoot, 'config.mjs');

    if (!useConfigTemplates && fs.existsSync(tier1Template) && fs.existsSync(tier1Active)) {
        record('Tier-1 ai/config.mjs', detectDrift(await projectShape(tier1Template), await projectShape(tier1Active)));
    }

    if (!useConfigTemplates && serverPath) {
        const serverTemplate = path.join(serverPath, 'config.template.mjs');
        const serverActive   = path.join(serverPath, 'config.mjs');

        if (fs.existsSync(serverTemplate) && fs.existsSync(serverActive)) {
            // Materialize the template's Tier-1 import before the compare so the template-vs-overlay
            // import path is not itself flagged as drift (matches the initConfigs per-server path).
            const templateShape = projectSourceShape(materializeServerConfigTemplate(await fs.readFile(serverTemplate, 'utf-8'))),
                  activeShape   = projectSourceShape(await fs.readFile(serverActive, 'utf-8'));

            record(`${path.basename(serverPath)}/config.mjs`, detectDrift(templateShape, activeShape));
        }
    }

    if (stale.length > 0) {
        const detail = stale.map(item => `  - ${item.label}: missing ${item.missing.join(', ')}`).join('\n');

        throw new Error(
            `[Neo AI] Stale config overlay — a materialized config.mjs is missing template-owned config shape:\n${detail}\n` +
            `This can crash at runtime or skip readiness requiredness. Refresh: \`npm run prepare -- ${MIGRATE_FLAG}\` (gitignored; safe), then restart.`
        );
    }

    if (requiredFindings.length > 0) {
        const detail = requiredFindings.map(item => {
            const target = item.env ? `${item.env} (${item.leafPath})` : item.leafPath;
            return `  - ${target}: ${item.valueState}; needed for ${item.entrypoint}/${item.mode}/${item.consumerClaim}${item.reason ? ` — ${item.reason}` : ''}`
        }).join('\n');

        throw new Error(
            `[Neo AI] Required deployment configuration is missing or invalid:\n${detail}\n` +
            'Set the named env var or update the active config before certifying readiness.'
        );
    }
}

/**
 * @summary Pure merge that ensures the template's `hooks` block is present in the active Claude
 * settings object, preserving every other key (permissions, autoMode, operator-local edits) and any
 * non-`Stop` hook events. Template hook events overwrite same-named active events (the template owns
 * the canonical hook wiring); other active events are kept. Returns the merged settings plus a
 * `changed` flag so an idempotent re-run is a no-op write.
 *
 * @param {Object} [activeSettings={}]   Parsed `.claude/settings.json` (or `{}` when absent).
 * @param {Object} [templateSettings={}] Parsed `.claude/settings.template.json`.
 * @returns {{settings: Object, changed: Boolean}}
 */
export function mergeClaudeHooks(activeSettings = {}, templateSettings = {}) {
    const templateHooks = templateSettings.hooks;

    if (!templateHooks || Object.keys(templateHooks).length === 0) {
        return {settings: activeSettings, changed: false};
    }

    const mergedHooks = {...(activeSettings.hooks || {}), ...templateHooks};

    if (JSON.stringify(activeSettings.hooks || {}) === JSON.stringify(mergedHooks)) {
        return {settings: activeSettings, changed: false};
    }

    return {settings: {...activeSettings, hooks: mergedHooks}, changed: true};
}

/**
 * @summary Materializes the tracked `.claude/settings.template.json` into the gitignored
 * `.claude/settings.json` so every clone self-wires the Claude Stop hook (no-hold lane-state
 * enforcement) without per-repo manual management — the Claude analog of {@link initConfigs} /
 * {@link initTier1Config}. A missing active file is cloned whole from the template; an existing one
 * gets only its `hooks` block ensured ({@link mergeClaudeHooks}), preserving operator-local keys.
 * Idempotent: an already-wired settings file is a silent no-op. Runs at `npm prepare`. The tracked
 * template carries `NEO_LANE_STATE_ENFORCE=1` in the Stop-hook command — the operator-directed enforce
 * default (the forcing-function rollout: the hook blocks + injects the no-hold directive at an
 * invalid idle-out turn-terminal, rather than only audit-logging it). Enforce is opted OUT locally by
 * dropping that env prefix in the gitignored `.claude/settings.json`, not by changing the default.
 *
 * Distinct from the server/Tier-1 config path: Claude settings are JSON (not `.mjs`), so the regex
 * shape-drift detector does not apply — a structural `hooks`-key merge is the right primitive.
 *
 * @param {Object} [options]
 * @param {String} [options.claudeDir] `.claude/` dir; defaults to `<repo>/.claude`. Override for tests.
 * @param {Object} [options.logger=console] Log sink; injectable for tests.
 * @returns {Promise<{action: String}>} `action` is one of `clone` / `wired` / `silent` / `skip-no-template`.
 */
export async function initClaudeSettings({claudeDir = path.join(cwd, '.claude'), logger = console} = {}) {
    const templatePath = path.join(claudeDir, 'settings.template.json');
    const activePath   = path.join(claudeDir, 'settings.json');

    if (!fs.existsSync(templatePath)) {
        logger.warn('[Neo AI] .claude/settings.template.json not found; skipping Claude settings initialization.');
        return {action: 'skip-no-template'};
    }

    const templateSettings = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

    if (!fs.existsSync(activePath)) {
        await fs.writeFile(activePath, JSON.stringify(templateSettings, null, 2) + '\n', 'utf-8');
        logger.log('[Neo AI] .claude/settings.json missing. Materialized from template (Stop hook wired).');
        return {action: 'clone'};
    }

    const activeSettings      = JSON.parse(await fs.readFile(activePath, 'utf-8'));
    const {settings, changed} = mergeClaudeHooks(activeSettings, templateSettings);

    if (!changed) {
        return {action: 'silent'};
    }

    await fs.writeFile(activePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    logger.log('[Neo AI] Wired the Claude Stop hook into .claude/settings.json (auto-materialized from template).');
    return {action: 'wired'};
}

if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        await initTier1Config();
        await initConfigs();
        await initClaudeSettings();
    })().catch(err => {
        console.error('[Neo AI] Failed to initialize configs:', err);
        process.exit(1);
    });
}
