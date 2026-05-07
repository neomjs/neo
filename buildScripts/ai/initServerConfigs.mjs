import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * @module buildScripts/ai/initServerConfigs
 * @summary Bootstrap script for `ai/mcp/server/*` config files. Runs at `npm prepare`.
 *
 * Two responsibilities:
 *
 * 1. **First-time clone:** when a server's gitignored `config.mjs` is missing, copy
 *    `config.template.mjs` over it.
 * 2. **Drift detection (#10815):** when `config.mjs` already exists, compare its
 *    structural shape (top-level imports + named exports) against the template.
 *    Mismatched items emit a per-server stderr warning listing what's new in the
 *    template. Operator can refresh the gitignored file by re-running with
 *    `npm run prepare -- --migrate-config` (overwrites `config.mjs` from the template).
 *
 * The drift detector is regex-based by design. AST parsing was rejected per the
 * #10815 Avoided Traps section — adds dependency weight to a 52-line bootstrap
 * script for a failure mode that hasn't required deep parsing in practice. Re-evaluate
 * only if structural drift starts hiding inside conditional / dynamic imports.
 *
 * @see https://github.com/neomjs/neo/issues/10815
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const cwd        = path.resolve(__dirname, '../../');
const serversDir = path.join(cwd, 'ai', 'mcp', 'server');

const MIGRATE_FLAG = '--migrate-config';

/**
 * Projects a `.mjs` file's structural shape — the surface that `initServerConfigs`
 * watches for drift between template and gitignored config.
 *
 * The `imports` projection is two-tiered to cover both whole-import drift AND
 * same-source named-specifier drift. The latter is the dominant evolution mode
 * for the canonical config templates — adding `parseUrl` to the existing
 * `import {parsePort, parseBool} from '../shared/helpers/EnvConfig.mjs'` block
 * is structural drift even though the source path is unchanged.
 *
 * - **Whole-import entries** (source-path strings, e.g. `'../shared/helpers/EnvConfig.mjs'`):
 *   detect missing imports — the gitignored config doesn't import from a path
 *   the template imports from at all.
 * - **Named-specifier entries** (`<source>:<specifier>` strings, e.g.
 *   `'../shared/helpers/EnvConfig.mjs:parseUrl'`): detect missing named
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
export async function projectShape(filePath) {
    const src = await fs.readFile(filePath, 'utf-8');

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
 *   2. Config missing — clone template (preserves pre-#10815 behavior).
 *   3. Config present + drift detected — warn-only (default) OR overwrite
 *      from template when invoked with `--migrate-config`.
 *
 * @param {Object}   [options]
 * @param {String[]} [options.argv=process.argv]   Argv source; injectable for tests.
 * @param {Object}   [options.logger=console]      Log sink; injectable for tests.
 * @param {String}   [options.serversRoot=serversDir]  Override for tests.
 * @returns {Promise<{
 *     processed: Array<{serverName: String, action: 'clone'|'silent'|'warn'|'migrate'|'skip-no-template', drift?: Object}>
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

        if (!fs.existsSync(activePath)) {
            logger.log(`[Neo AI] Config missing for MCP server '${serverName}'. Cloning from template...`);
            await fs.copy(templatePath, activePath);
            processed.push({serverName, action: 'clone'});
            continue;
        }

        const drift = detectDrift(
            await projectShape(templatePath),
            await projectShape(activePath)
        );

        if (!drift.hasDrift) {
            processed.push({serverName, action: 'silent'});
            continue;
        }

        if (migrate) {
            logger.log(`[Neo AI] Migrating stale config for '${serverName}' (drift detected, ${MIGRATE_FLAG} set)...`);
            await fs.copy(templatePath, activePath);
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

if (import.meta.url === `file://${process.argv[1]}`) {
    initConfigs().catch(err => {
        console.error('[Neo AI] Failed to initialize server configs:', err);
        process.exit(1);
    });
}
