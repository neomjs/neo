#!/usr/bin/env node
/**
 * @module ai/scripts/setup/migrateConfigOverlay
 * @summary Converts a snapshot-style Tier-1 operator overlay (`ai/config.mjs` as a full template
 * copy) into the subclass+delta shape (`class Config extends ConfigBase` carrying ONLY the leaves
 * that differ from the base defaults).
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
 * Scope: the ROOT overlay pair (`ai/configBase.mjs` ← `ai/config.mjs`) only. Per-server overlays
 * keep the snapshot shape until their templates gain the same base split.
 */
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

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
 * @returns {{deltas: Object, drift: String[], custom: String[], skipped: String[]}}
 */
export function diffLeafTrees(baseData, overlayData, prefix = '') {
    const result = {deltas: {}, drift: [], custom: [], skipped: []};
    walkLeafTrees(baseData, overlayData, prefix, result);
    return result;
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
 * @param {{deltas: Object, drift: String[], custom: String[], skipped: String[]}} result Shared accumulator.
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
            const rendered = stableStringify(isLeafDescriptor(overlayValue) ? projectLeaf(overlayValue).projection : overlayValue);
            if (rendered === undefined) {
                result.skipped.push(pathKey);
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
 * @summary Renders the complete subclass+delta overlay module source from a delta tree.
 * @param {Object} deltas Nested delta tree (leaf descriptors at the changed paths).
 * @returns {String}
 */
export function renderOverlayModule(deltas) {
    const hasDeltas = Object.keys(deltas).length > 0;
    const dataBlock = hasDeltas
        ? `,\n        /**\n         * Delta-only operator overrides — every other leaf inherits from ConfigBase.\n         * @member {Object} data\n         */\n        data: ${renderValue(deltas, '        ')}`
        : '';

    return `import ConfigBase                from './configBase.mjs';
import {createConfigProxy, leaf} from './ConfigProvider.mjs';

/**
 * Operator overlay — the delta-only singleton subclass of {@link Neo.ai.ConfigBase}.
 * Generated by ai/scripts/setup/migrateConfigOverlay.mjs; edit deltas freely, they deep-merge
 * over the base defaults and every base leaf you do not name is inherited by construction.
 * @class Neo.ai.Config
 * @extends Neo.ai.ConfigBase
 * @singleton
 */
class Config extends ConfigBase {
    static config = {
        /**
         * @member {String} className='Neo.ai.Config'
         * @protected
         */
        className: 'Neo.ai.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true${dataBlock}
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
 * @summary CLI entry — resolves the root overlay pair, diffs declarations, prints the report +
 * generated source, and writes only under `--write` (with a `.pre-migration.bak` beside the old file).
 * @returns {Promise<void>}
 * @protected
 */
async function main() {
    // --ai-root <dir>: operate on a Tier-1 root other than the repo's `ai/` — the seam that lets
    // `initTier1Config` drive the SAME conversion in its child-process cascade AND lets specs pin
    // the cascade against disposable fixture roots. The Neo bootstrap always comes from THIS repo.
    const rootFlagAt = process.argv.indexOf('--ai-root'),
          aiRoot     = rootFlagAt !== -1 && process.argv[rootFlagAt + 1]
              ? path.resolve(process.argv[rootFlagAt + 1])
              : path.join(neoRootDir, 'ai'),
          write       = process.argv.includes('--write'),
          overlayPath = path.join(aiRoot, 'config.mjs');

    if (!fs.existsSync(overlayPath)) {
        console.log('[migrate-config-overlay] no ai/config.mjs overlay exists — nothing to migrate (fresh bootstraps already get the subclass shape from the template copy).');
        return;
    }

    const overlaySource = fs.readFileSync(overlayPath, 'utf8');

    if (detectOverlayShape(overlaySource) === 'subclass') {
        console.log('[migrate-config-overlay] ai/config.mjs is already in the subclass+delta shape — no-op.');
        return;
    }

    // Import order matters: the Neo bootstrap chain first, then the base, then the snapshot
    // overlay (which registers the `Neo.ai.Config` singleton in THIS process — harmless here).
    const Neo = (await import(path.join(neoRootDir, 'src/Neo.mjs'))).default;
    await import(path.join(neoRootDir, 'src/core/_export.mjs'));

    const ConfigBase = (await import(path.join(aiRoot, 'configBase.mjs'))).default;
    await import(overlayPath);

    // Reach the snapshot's class via the registry singleton — NOT via the config proxy's
    // `constructor` (the proxy binds function values, and a bound function drops statics).
    const overlayClass                     = Neo.ns('Neo.ai.Config').constructor,
          {deltas, drift, custom, skipped} = diffLeafTrees(ConfigBase.config.data, overlayClass.config.data);

    console.log('[migrate-config-overlay] drift report (base leaves the snapshot never saw — inherited after migration):');
    drift.length   ? drift.forEach(p => console.log(`  + ${p}`))     : console.log('  (none)');
    console.log('[migrate-config-overlay] operator deltas carried into the subclass overlay:');
    const deltaPaths = [];
    (function walk(node, prefix) {
        for (const [key, value] of Object.entries(node)) {
            const pathKey = prefix ? `${prefix}.${key}` : key;
            isLeafDescriptor(value) || typeof value !== 'object' || Array.isArray(value)
                ? deltaPaths.push(pathKey)
                : walk(value, pathKey);
        }
    })(deltas, '');
    deltaPaths.length ? deltaPaths.forEach(p => console.log(`  ~ ${p}`)) : console.log('  (none)');
    custom.length  && console.log(`[migrate-config-overlay] operator-custom leaves carried verbatim:\n${custom.map(p => `  * ${p}`).join('\n')}`);
    skipped.length && console.log(`[migrate-config-overlay] NON-RENDERABLE differing leaves (left to inherit — review manually):\n${skipped.map(p => `  ! ${p}`).join('\n')}`);

    const generated = renderOverlayModule(deltas);

    if (!write) {
        console.log('\n[migrate-config-overlay] PREVIEW (re-run with --write to apply):\n');
        console.log(generated);
        return;
    }

    const backupPath = `${overlayPath}.pre-migration.bak`;
    fs.copyFileSync(overlayPath, backupPath);
    fs.writeFileSync(overlayPath, generated, 'utf8');
    console.log(`\n[migrate-config-overlay] written: ${overlayPath} (backup: ${backupPath})`);
}

// Process-entry only: never run on import, so unit tests can import the pure helpers.
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
    main().catch(error => {
        console.error('[migrate-config-overlay] failed:', error.message);
        process.exit(1);
    });
}
