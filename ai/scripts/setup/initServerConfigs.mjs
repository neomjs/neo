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

const MIGRATE_FLAG = '--migrate-config';
const MATERIALIZED_SERVER_IMPORTS = new Set([
    '../../../config.mjs',
    '../../../config.mjs:default'
]);

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
 * @param {String} filePath  Absolute path to a readable `.mjs` file.
 * @returns {Promise<{imports: String[], exports: String[]}>}
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
                const cleaned  = raw.trim();
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

    imports.sort();

    const exports = [...src.matchAll(/^export\s+\{([^}]+)\}/gm)]
        .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean))
        .sort();

    return {imports, exports}
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
 * @param {{missingImports: String[], missingExports: String[], hasDrift: Boolean}} drift
 * @returns {Boolean}
 */
export function isOnlyServerMaterializationDrift(drift) {
    return Boolean(
        drift.hasDrift &&
        drift.missingExports.length === 0 &&
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
 * @param {{imports: String[], exports: String[]}} templateShape
 * @param {{imports: String[], exports: String[]}} configShape
 * @returns {{missingImports: String[], missingExports: String[], hasDrift: Boolean}}
 */
export function detectDrift(templateShape, configShape) {
    const missingImports = templateShape.imports.filter(i => !configShape.imports.includes(i));
    const missingExports = templateShape.exports.filter(e => !configShape.exports.includes(e));

    return {
        missingImports,
        missingExports,
        hasDrift: missingImports.length + missingExports.length > 0
    }
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
 * @returns {Promise<{
 *     processed: Array<{serverName: String, action: 'clone'|'silent'|'warn'|'migrate'|'skip-no-template', drift?: Object, migration?: String}>
 * }>}
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

        if (!fs.existsSync(templatePath)) {
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
        const drift = detectDrift(
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
 * @returns {Promise<{action: 'clone'|'silent'|'warn'|'migrate'|'skip-no-template', drift?: Object}>}
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
    logger.warn(`  Run \`npm run prepare -- ${MIGRATE_FLAG}\` to refresh (gitignored; safe).`);

    return {action: 'warn', drift}
}

if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        await initTier1Config();
        await initConfigs();
    })().catch(err => {
        console.error('[Neo AI] Failed to initialize configs:', err);
        process.exit(1);
    });
}
