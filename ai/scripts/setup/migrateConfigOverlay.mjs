#!/usr/bin/env node
/**
 * @module ai/scripts/setup/migrateConfigOverlay
 * @summary Converts a snapshot-style operator overlay (`config.mjs` as a full template copy) into
 * the subclass+delta shape (`class Config extends ConfigBase` carrying ONLY the leaves that differ
 * from the base defaults). Supports both the Tier-1 root and explicit per-server config roots.
 *
 * Why: a snapshot overlay opts out of `Neo.setupClass`'s hierarchical merge — every leaf added to
 * the base after the copy is invisible to it until hand-merged (the overlay-drift class). The
 * subclass+delta shape inherits new base leaves by construction.
 *
 * Behavior:
 *  - PREVIEW-FIRST: without `--write`, prints the drift report + the generated overlay source and
 *    touches nothing. `--write` backs the old overlay up beside itself (`config.mjs.pre-migration.bak`)
 *    and writes the generated file.
 *  - IDEMPOTENT: an overlay already in the subclass shape (or a missing overlay) is a no-op report.
 *  - DECLARATION-LEVEL diff: compares the overlay class's declared leaf descriptors against the
 *    base class's — never env-resolved values, so the machine's current env can neither masquerade
 *    as a delta nor mask one.
 *  - FAIL-HONEST: leaves whose values cannot be rendered back to source (functions and other
 *    non-JSON defaults) are reported and left to inherit; operator-custom leaves absent from the
 *    base are carried into the delta verbatim.
 *
 * Scope: the ROOT overlay pair (`ai/configBase.mjs` ← `ai/config.mjs`) by default, or one
 * explicit per-server pair via `--config-root <server-dir>`.
 */
import fs                             from 'fs';
import path                           from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import {writeFileAtomicSync}          from '../../services/shared/atomicFileWrite.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const neoRootDir = path.resolve(__dirname, '../../../');

/**
 * @summary True when a value is a leaf DESCRIPTOR (the `leaf()` declaration shape) rather than a
 * nested subtree. Mirrors the ConfigProvider convention: leaf descriptors carry a `default` key
 * (plus `env` / `type` / a derived `parse` / spread metadata); nested subtrees never do.
 * @param {*} value
 * @returns {Boolean}
 */
export function isLeafDescriptor(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'default');
}

/**
 * @summary Projects a leaf descriptor onto its DECLARED surface — `default`, `env`, `type`, and
 * any spread metadata keys — excluding `parse`, which `leaf()` DERIVES from `env` + `type` (a
 * function member that carries no declaration information and would defeat JSON comparison).
 * @param {Object} descriptor A `leaf()`-shaped object.
 * @returns {{projection: Object, metadata: (Object|null)}} The comparable projection plus the
 * reconstructed metadata object (`null` when the leaf carries none).
 */
export function projectLeaf(descriptor) {
    const {default: dflt, env = null, type = null, parse, ...metadataRest} = descriptor,
          metadata = Object.keys(metadataRest).length ? metadataRest : null;

    return {
        projection: {default: dflt, env, type, ...(metadata ? {metadata} : {})},
        metadata
    };
}

/**
 * @summary Stable stringify for descriptor equality — key-sorted, so property order differences
 * between the base and a hand-edited snapshot never read as deltas.
 * @param {*} value
 * @returns {String|undefined} `undefined` when the value is not JSON-serializable (functions etc.).
 */
export function stableStringify(value) {
    try {
        const seen = new WeakSet();
        const out  = JSON.stringify(value, function(key, val) {
            if (typeof val === 'function') throw new Error('function');
            if (val && typeof val === 'object') {
                if (seen.has(val)) throw new Error('cycle');
                seen.add(val);
                if (!Array.isArray(val)) {
                    return Object.keys(val).sort().reduce((acc, k) => (acc[k] = val[k], acc), {});
                }
            }
            return val;
        });
        return out;
    } catch {
        return undefined;
    }
}

/**
 * @summary Recursively diffs an overlay's declared data tree against the base's.
 *
 * Classification per key path:
 *  - `deltas`   — leaf present in both, descriptors differ, overlay value renderable → migrated.
 *  - `drift`    — leaf present in the base, ABSENT from the overlay (the drift class this script
 *                 retires: inherited after migration).
 *  - `custom`   — key present in the overlay only (operator-custom) → carried verbatim.
 *  - `skipped`  — differing leaf whose overlay value cannot render back to source → left to
 *                 inherit, reported for manual attention.
 * @param {Object} baseData Declared base data subtree (leaf descriptors + nested subtrees).
 * @param {Object} overlayData Declared overlay data subtree.
 * @param {String} [prefix=''] Current key path prefix.
 * @returns {{deltas: Object, drift: String[], custom: String[], skipped: String[], blockedCustom: String[]}}
 */
export function diffLeafTrees(baseData, overlayData, prefix = '') {
    const result = {deltas: {}, drift: [], custom: [], skipped: [], blockedCustom: []};
    walkLeafTrees(baseData, overlayData, prefix, result);
    return result;
}

/**
 * @summary Reports operator formula declarations that cannot be represented in the generated
 * data-only subclass. Equal inherited formulas need no output; custom or changed formulas must be
 * visible to the operator instead of disappearing silently.
 * @param {Object} [baseFormulas]
 * @param {Object} [overlayFormulas]
 * @returns {String[]}
 */
export function collectNonRenderableFormulaDifferences(baseFormulas = {}, overlayFormulas = {}) {
    const base    = baseFormulas ?? {},
          overlay = overlayFormulas ?? {};

    return Object.entries(overlay)
        .filter(([key, value]) => !(key in base) || String(base[key]) !== String(value))
        .map(([key]) => `formulas.${key}`)
        .sort()
}

/**
 * @summary The shared-accumulator recursion behind {@link diffLeafTrees}.
 *
 * ONE accumulator flows through the whole walk and `setPath` (full dotted paths against the shared
 * root) is the ONLY deltas writer, so sibling iteration order can never matter. The previous shape
 * merged each subtree child's own accumulator upward via a shallow `Object.assign`, whose top-level
 * key is the shared path root — at any nested level it REPLACED whatever a leaf-delta sibling (or an
 * earlier subtree sibling) had already written under that key, silently reverting operator overrides
 * to base defaults after `--write` (the drift-class harm this script exists to retire, inverted).
 * @param {Object} baseData Declared base data subtree (leaf descriptors + nested subtrees).
 * @param {Object} overlayData Declared overlay data subtree.
 * @param {String} prefix Current key path prefix.
 * @param {{deltas: Object, drift: String[], custom: String[], skipped: String[], blockedCustom: String[]}} result Shared accumulator.
 */
function walkLeafTrees(baseData, overlayData, prefix, result) {
    const baseKeys    = baseData    && typeof baseData    === 'object' ? Object.keys(baseData)    : [],
          overlayKeys = overlayData && typeof overlayData === 'object' ? Object.keys(overlayData) : [];

    for (const key of new Set([...baseKeys, ...overlayKeys])) {
        const pathKey      = prefix ? `${prefix}.${key}` : key,
              baseValue    = baseData?.[key],
              overlayValue = overlayData?.[key];

        if (overlayValue === undefined) {
            result.drift.push(pathKey);
            continue;
        }

        if (baseValue === undefined) {
            // A custom SUBTREE (absent from base) can hold nested leaf descriptors. Serializing the
            // whole namespace would hit a descriptor's function-valued `parse` and skip it wholesale —
            // silently dropping operator data — so recurse with an empty base: every nested entry
            // re-enters this branch individually and leaves render via their projection.
            if (!isLeafDescriptor(overlayValue) && overlayValue && typeof overlayValue === 'object' && !Array.isArray(overlayValue)) {
                walkLeafTrees({}, overlayValue, pathKey, result);
                continue;
            }

            const rendered = stableStringify(isLeafDescriptor(overlayValue) ? projectLeaf(overlayValue).projection : overlayValue);
            if (rendered === undefined) {
                result.skipped.push(pathKey);
                result.blockedCustom.push(pathKey);
            } else {
                result.custom.push(pathKey);
                setPath(result.deltas, pathKey, overlayValue);
            }
            continue;
        }

        if (isLeafDescriptor(baseValue) || isLeafDescriptor(overlayValue)) {
            const baseStr    = isLeafDescriptor(baseValue)    ? stableStringify(projectLeaf(baseValue).projection)    : stableStringify(baseValue),
                  overlayStr = isLeafDescriptor(overlayValue) ? stableStringify(projectLeaf(overlayValue).projection) : stableStringify(overlayValue);

            // Non-renderable overlay side (function-valued default etc.): equality is unverifiable
            // and the value cannot be emitted as source — inherit + report for manual review.
            if (overlayStr === undefined) {
                result.skipped.push(pathKey);
                continue;
            }

            if (baseStr !== undefined && baseStr === overlayStr) continue;

            setPath(result.deltas, pathKey, overlayValue);
            continue;
        }

        // Nested subtree on both sides → recurse into the SHARED accumulator.
        walkLeafTrees(baseValue, overlayValue, pathKey, result);
    }
}

/**
 * @summary Sets a dotted path inside a plain nested object (delta accumulator).
 * @param {Object} target
 * @param {String} dottedPath
 * @param {*} value
 */
function setPath(target, dottedPath, value) {
    const parts = dottedPath.split('.');
    let   node  = target;
    for (let i = 0; i < parts.length - 1; i++) {
        node = node[parts[i]] ??= {};
    }
    node[parts.at(-1)] = value;
}

/**
 * @summary Renders one declared value back to overlay source. Leaf descriptors render as `leaf()`
 * calls (default, then env/type/metadata only when present); nested subtrees recurse; plain values
 * (operator-custom non-leaf entries) render as JSON.
 * @param {*} value
 * @param {String} indent Current indentation.
 * @returns {String}
 */
export function renderValue(value, indent = '            ') {
    if (isLeafDescriptor(value)) {
        const {projection, metadata} = projectLeaf(value),
              args                   = [JSON.stringify(projection.default)];
        // Emit the STORED type explicitly (leaf() re-infers an omitted type, so round-tripping the
        // resolved value is drift-safe), and reconstruct spread metadata as the 4th argument.
        if (projection.env != null || projection.type != null || metadata != null) args.push(JSON.stringify(projection.env));
        if (projection.type != null || metadata != null) args.push(JSON.stringify(projection.type));
        if (metadata != null) args.push(JSON.stringify(metadata));
        return `leaf(${args.join(', ')})`;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const entries = Object.entries(value).map(([key, child]) =>
            `${indent}    ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${renderValue(child, indent + '    ')}`);
        return `{\n${entries.join(',\n')}\n${indent}}`;
    }

    return JSON.stringify(value);
}

/**
 * @summary Quotes a generated JavaScript string with single quotes while escaping path/class-name
 * content that would otherwise terminate the literal.
 * @param {String} value
 * @returns {String}
 */
function quoteSingle(value) {
    return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/**
 * @summary Renders the complete subclass+delta overlay module source from a delta tree.
 * @param {Object} deltas Nested delta tree (leaf descriptors at the changed paths).
 * @param {Object} [options]
 * @param {String} [options.baseClassName='Neo.ai.ConfigBase'] Registry name of the defaults class.
 * @param {String} [options.baseImport='./configBase.mjs'] Overlay-relative defaults import.
 * @param {String} [options.className='Neo.ai.Config'] Registry name retained from the snapshot.
 * @param {String} [options.configProviderImport='./ConfigProvider.mjs'] Overlay-relative provider import.
 * @param {String|null} [options.parentConfigImport=null] Parent-realm import that must run before the base.
 * @returns {String}
 */
export function renderOverlayModule(deltas, {
    baseClassName        = 'Neo.ai.ConfigBase',
    baseImport           = './configBase.mjs',
    className            = 'Neo.ai.Config',
    configProviderImport = './ConfigProvider.mjs',
    parentConfigImport   = null
} = {}) {
    const hasDeltas = Object.keys(deltas).length > 0,
          imports   = `${parentConfigImport ? `import ${quoteSingle(parentConfigImport)};\n` : ''}import ConfigBase                from ${quoteSingle(baseImport)};
import {createConfigProxy, leaf} from ${quoteSingle(configProviderImport)};`;

    const renderedDataBlock = hasDeltas
        ? `,\n        /**\n         * Delta-only operator overrides — every other leaf inherits from ConfigBase.\n         * @member {Object} data\n         */\n        data: ${renderValue(deltas, '        ')}`
        : '';

    return `${imports}

/**
 * Operator overlay — the delta-only singleton subclass of {@link ${baseClassName}}.
 * Generated by ai/scripts/setup/migrateConfigOverlay.mjs; edit deltas freely, they deep-merge
 * over the base defaults and every base leaf you do not name is inherited by construction.
 * @class ${className}
 * @extends ${baseClassName}
 * @singleton
 */
class Config extends ConfigBase {
    static config = {
        /**
         * @member {String} className=${quoteSingle(className)}
         * @protected
         */
        className: ${quoteSingle(className)},
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true${renderedDataBlock}
    }
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
`;
}

/**
 * @summary Classifies an overlay source's shape without importing it.
 * @param {String} source
 * @returns {'subclass'|'snapshot'}
 */
export function detectOverlayShape(source) {
    return /class\s+\w+\s+extends\s+ConfigBase\b/.test(source) ? 'subclass' : 'snapshot';
}

/**
 * @summary Reads the registered config class name from a snapshot declaration.
 * @param {String} source
 * @returns {String|null}
 */
export function extractConfigClassName(source) {
    return source.match(/\bclassName\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? null;
}

/**
 * @summary Reads the ConfigProvider module specifier so a generated server overlay preserves its
 * root-relative import rather than inheriting the Tier-1 renderer's path.
 * @param {String} source
 * @returns {String|null}
 */
export function extractConfigProviderImport(source) {
    return source.match(/\bimport\s+ConfigProvider(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]/)?.[1] ?? null;
}

/**
 * @summary Reads a server snapshot's Tier-1 config import, accepting both side-effect and bound
 * import forms. The generated overlay retains it before ConfigBase so the operator Tier-1 root is
 * registered before base defaults that derive from the winning realm evaluate.
 * @param {String} source
 * @returns {String|null}
 */
export function extractParentConfigImport(source) {
    for (const match of source.matchAll(/^\s*import\s+(?:[^'"\n]+\s+from\s+)?['"]([^'"]*\/config\.mjs)['"]\s*;?\s*$/gm)) {
        return match[1];
    }
    return null;
}

/**
 * @summary Replaces an overlay atomically after writing the generated source to a same-directory
 * temporary sibling. A write or rename failure leaves the live overlay byte-identical; the backup
 * always contains the pre-migration snapshot.
 * @param {Object} options
 * @param {String} options.overlayPath
 * @param {String} options.generated
 * @param {Object} [options.fileSystem=fs] Injectable filesystem for failure witnesses.
 * @returns {{backupPath: String}}
 */
export function writeMigratedOverlay({overlayPath, generated, fileSystem = fs}) {
    const backupPath = `${overlayPath}.pre-migration.bak`;

    // The backup is taken FIRST rather than between the scratch write and the rename. It copies the
    // ORIGINAL overlay, which is untouched until the atomic write publishes — so both orders capture
    // the same bytes, and taking it first means a failed backup aborts before anything was staged.
    //
    // The former `${overlayPath}.migration-${pid}-${Date.now()}.tmp` and its catch-block cleanup are
    // both gone: the primitive owns its scratch and removes it in a `finally`, so there is no longer
    // a leaked sibling for this function to chase.
    fileSystem.copyFileSync(overlayPath, backupPath);
    writeFileAtomicSync(overlayPath, generated, {fsModule: fileSystem, mode: 0o644});

    return {backupPath}
}

/**
 * @summary Converts one explicit overlay/base pair. Preview is the default; write mode first backs
 * up the snapshot. Server mode preserves the snapshot's namespace and import topology, while
 * Tier-1 mode retains the historical output contract.
 * @param {Object} [options]
 * @param {String} [options.configRoot] Directory containing `config.mjs` + `configBase.mjs`.
 * @param {'tier1'|'server'} [options.kind='tier1'] Overlay realm shape.
 * @param {Object} [options.logger=console] Logger exposing `log()`.
 * @param {Boolean} [options.write=false] Apply the conversion instead of previewing it.
 * @returns {Promise<Object>} Action receipt plus generated/diff metadata where applicable.
 */
export async function migrateConfigOverlay({
    configRoot = path.join(neoRootDir, 'ai'),
    kind       = 'tier1',
    logger     = console,
    write      = false
} = {}) {
    if (!['tier1', 'server'].includes(kind)) {
        throw new Error(`unsupported config overlay kind: ${kind}`);
    }

    const root        = path.resolve(configRoot),
          overlayPath = path.join(root, 'config.mjs'),
          basePath    = path.join(root, 'configBase.mjs'),
          label       = kind === 'tier1' ? 'ai/config.mjs' : `${path.basename(root)}/config.mjs`;

    if (!fs.existsSync(overlayPath)) {
        logger.log(`[migrate-config-overlay] no ${label} overlay exists — nothing to migrate (fresh bootstraps already get the subclass shape from the template copy).`);
        return {action: 'missing', overlayPath};
    }

    const overlaySource = fs.readFileSync(overlayPath, 'utf8');

    if (detectOverlayShape(overlaySource) === 'subclass') {
        logger.log(`[migrate-config-overlay] ${label} is already in the subclass+delta shape — no-op.`);
        return {action: 'noop', overlayPath};
    }

    if (!fs.existsSync(basePath)) {
        throw new Error(`missing defaults class: ${basePath}`);
    }

    const className = extractConfigClassName(overlaySource);
    if (!className) {
        throw new Error(`cannot determine className from snapshot: ${overlayPath}`);
    }

    let parentConfigImport = null,
        renderOptions      = {};

    if (kind === 'tier1') {
        if (className !== 'Neo.ai.Config') {
            throw new Error(`unexpected Tier-1 className ${className}; expected Neo.ai.Config`);
        }
    } else {
        const configProviderImport = extractConfigProviderImport(overlaySource);
        parentConfigImport = extractParentConfigImport(overlaySource);

        if (!className.endsWith('.Config')) {
            throw new Error(`server className must end in .Config: ${className}`);
        }
        if (!configProviderImport) {
            throw new Error(`cannot determine ConfigProvider import from snapshot: ${overlayPath}`);
        }
        if (!parentConfigImport) {
            throw new Error(`cannot determine parent config import from snapshot: ${overlayPath}`);
        }

        renderOptions = {
            baseClassName: className.replace(/\.Config$/, '.ConfigBase'),
            className,
            configProviderImport,
            parentConfigImport
        };
    }

    // Import order matters: the Neo bootstrap chain first, then (for servers) the parent realm,
    // then the base, then the snapshot overlay that registers the class being projected.
    const Neo = (await import(pathToFileURL(path.join(neoRootDir, 'src/Neo.mjs')).href)).default;
    await import(pathToFileURL(path.join(neoRootDir, 'src/core/_export.mjs')).href);

    if (parentConfigImport) {
        // Register the operator's Tier-1 realm before ConfigBase evaluates defaults that derive
        // from that winning root. `Neo.setupClass` is first-registration-wins, so reversing these
        // imports would silently select the wrong realm during declaration comparison.
        await import(new URL(parentConfigImport, pathToFileURL(overlayPath)).href);
    }

    const ConfigBase = (await import(pathToFileURL(basePath).href)).default;
    await import(pathToFileURL(overlayPath).href);

    // Reach the snapshot's class via the registry singleton — NOT via the config proxy's
    // `constructor` (the proxy binds function values, and a bound function drops statics).
    const overlayInstance = Neo.ns(className);
    if (!overlayInstance) {
        throw new Error(`snapshot did not register ${className}`);
    }

    const
        overlayClass = overlayInstance.constructor,
        leafDiff     = diffLeafTrees(ConfigBase.config.data, overlayClass.config.data),
        deltas       = leafDiff.deltas,
        drift        = leafDiff.drift,
        custom       = leafDiff.custom,
        skipped      = [
            ...leafDiff.skipped,
            ...collectNonRenderableFormulaDifferences(ConfigBase.config.formulas, overlayClass.config.formulas)
        ].sort(),
        blockedCustom = leafDiff.blockedCustom;

    logger.log('[migrate-config-overlay] drift report (base leaves the snapshot never saw — inherited after migration):');
    drift.length   ? drift.forEach(p => logger.log(`  + ${p}`))     : logger.log('  (none)');
    logger.log('[migrate-config-overlay] operator deltas carried into the subclass overlay:');
    const deltaPaths = [];
    (function walk(node, prefix) {
        for (const [key, value] of Object.entries(node)) {
            const pathKey = prefix ? `${prefix}.${key}` : key;
            isLeafDescriptor(value) || typeof value !== 'object' || Array.isArray(value)
                ? deltaPaths.push(pathKey)
                : walk(value, pathKey);
        }
    })(deltas, '');
    deltaPaths.length ? deltaPaths.forEach(p => logger.log(`  ~ ${p}`)) : logger.log('  (none)');
    custom.length  && logger.log(`[migrate-config-overlay] operator-custom leaves carried verbatim:\n${custom.map(p => `  * ${p}`).join('\n')}`);
    skipped.length && logger.log(`[migrate-config-overlay] NON-RENDERABLE differing leaves (left to inherit — review manually):\n${skipped.map(p => `  ! ${p}`).join('\n')}`);
    blockedCustom.length && logger.log(`[migrate-config-overlay] NON-RENDERABLE OPERATOR-CUSTOM leaves block --write:\n${blockedCustom.map(p => `  x ${p}`).join('\n')}`);

    const generated = renderOverlayModule(deltas, renderOptions);

    if (!write) {
        logger.log('\n[migrate-config-overlay] PREVIEW (re-run with --write to apply):\n');
        logger.log(generated);
        return {action: 'preview', generated, overlayPath, deltas, drift, custom, skipped, blockedCustom};
    }

    if (blockedCustom.length > 0) {
        throw new Error(`refusing --write: non-renderable operator-custom leaves require manual preservation (${blockedCustom.join(', ')})`)
    }

    const {backupPath} = writeMigratedOverlay({overlayPath, generated});
    logger.log(`\n[migrate-config-overlay] written: ${overlayPath} (backup: ${backupPath})`);

    return {action: 'write', generated, overlayPath, backupPath, deltas, drift, custom, skipped, blockedCustom};
}

/**
 * @summary CLI entry — resolves the root overlay pair, diffs declarations, prints the report +
 * generated source, and writes only under `--write` (with a `.pre-migration.bak` beside the old file).
 * @returns {Promise<void>}
 * @protected
 */
async function main() {
    // --ai-root <dir>: operate on a Tier-1 root other than the repo's `ai/` — the seam that lets
    // `initTier1Config` drive the SAME conversion in its child-process cascade AND lets specs pin
    // the cascade against disposable fixture roots. The Neo bootstrap always comes from THIS repo.
    const aiRootAt     = process.argv.indexOf('--ai-root'),
          configRootAt = process.argv.indexOf('--config-root');

    const readRootFlag = (flagAt, flagName) => {
        if (flagAt === -1) return null;
        const value = process.argv[flagAt + 1];
        if (!value || value.startsWith('--')) throw new Error(`${flagName} requires a directory`);
        return value;
    };

    const aiRootValue     = readRootFlag(aiRootAt, '--ai-root'),
          aiRoot          = aiRootValue ? path.resolve(aiRootValue) : path.join(neoRootDir, 'ai'),
          configRootValue = readRootFlag(configRootAt, '--config-root'),
          kind            = configRootValue ? 'server' : 'tier1',
          configRoot      = configRootValue
              ? (path.isAbsolute(configRootValue) ? configRootValue : path.resolve(aiRoot, configRootValue))
              : aiRoot;

    await migrateConfigOverlay({
        configRoot,
        kind,
        write: process.argv.includes('--write')
    });
}

// Process-entry only: never run on import, so unit tests can import the pure helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error('[migrate-config-overlay] failed:', error.message);
        process.exit(1);
    });
}
