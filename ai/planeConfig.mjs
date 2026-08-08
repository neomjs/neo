import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Plane-identity helpers for the CONFIG layer: the opacity predicate, the leaf's env
 * parser, the module-scope anchor computation, and the boot coherence assertions.
 *
 * **This module reads no environment.** It used to — it carried a parallel env-resolution path
 * (`resolvePlaneId`, and an `env` argument on the anchor computation) alongside the leaf's own env
 * layer. That was the duplication the config SSOT bans: two resolvers for one value, able to
 * disagree. Every production caller had already opted out by passing `{env: {}}`, and the identity
 * resolver had no production caller at all — the second path was exercised only by its own tests.
 * The leaf machinery owns env binding, unconditionally and alone.
 *
 * **Why it stays free of Neo imports**, now that the "serves non-Neo consumers" story is retired:
 * because its consumers are **config files** — `ai/configBase.mjs` and the three per-server config
 * bases — and a config cannot read the Provider that does not exist yet. That is the genuine
 * chicken-and-egg, and it is the whole justification. It is not a companion module shadowing the
 * config; it is the config layer's own helper.
 *
 * The three concepts this plane API never conflates:
 * - **identity** — the opaque `planeId` (never a path, never checkout-shaped: a checkout-shaped
 *   identity would silently pre-decide the data-root placement election);
 * - **resolved evidence** — the `dataRoot` a process actually resolved at runtime;
 * - **checkout root** — `NEO_AI_CANONICAL_ROOT`, which names a checkout for provisioning-time
 *   hydration (`bootstrapWorktree.mjs`) and is explicitly NOT the plane identity.
 */

/**
 * @summary The institution's canonical local plane identity — the ONE exported configured identity literal.
 *
 * It crosses the module boundary because two consumers must compare against the same value: the
 * `plane.id` leaf declares it as its default, and {@link assertPlaneCoherence} treats it as the
 * canonical identity a declared overlay must not resolve to. If those two drifted, an overlay could
 * be mistaken for canonical and mutate the durable plane — so this is one literal with two
 * consumers, not a defaults copy kept in step.
 *
 * Overlays, cloud deployments and ephemeral isolation planes override it through the leaf's env
 * binding — a stable literal, deliberately carrying no path or checkout content. The exported
 * `UNKNOWN_PLANE_ID` below is a read-side non-identity sentinel, not a competing configured identity.
 * @type {String}
 */
export const CANONICAL_PLANE_ID = 'neo-local-canonical';

/**
 * @summary Read-side sentinel for durable records written before plane provenance existed.
 *
 * This is deliberately NOT a valid configured plane identity. A missing historical value must surface
 * honestly without becoming a plane a new writer can claim; otherwise a deployment configured as
 * `unknown` would be indistinguishable from legacy evidence whose producer cannot be attributed.
 * @type {String}
 */
export const UNKNOWN_PLANE_ID = 'unknown';

/**
 * Module-internal only. `dataRootRelative` is consumed by the opacity predicate and the anchor
 * computation below; nothing outside this file needs either value.
 * @type {Object}
 * @private
 */
const PLANE_DEFAULTS = Object.freeze({
    dataRootRelative: '.neo-ai-data',
    planeId         : CANONICAL_PLANE_ID
});

/**
 * @summary The opacity predicate for plane identities — ONE rule covering the frozen default
 * (module-load guard below) and every RESOLVED value, env overrides included. A path- or
 * checkout-shaped planeId silently pre-decides the data-root placement election, so opacity
 * must hold on the values that vary, not only on the literal that cannot.
 * @param {*} value
 * @returns {Boolean}
 */
export function isOpaquePlaneId(value) {
    return typeof value === 'string' && value.length > 0 && value.trim() === value &&
        value !== UNKNOWN_PLANE_ID &&
        !value.includes('/') && !value.includes('\\') &&
        !value.includes(PLANE_DEFAULTS.dataRootRelative)
}

/**
 * @summary Env-layer parser for the `plane.id` leaf — the leaf reaches the SAME opacity
 * predicate the twin's resolver enforces (mirrors the `parseMemorySharingPolicy` descriptor
 * precedent: absent/empty env → `undefined`, so the declared default applies).
 * @param {String} envVarName
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {String|undefined}
 */
export function parsePlaneIdEnv(envVarName, {env = process.env} = {}) {
    const rawValue = env[envVarName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    if (!isOpaquePlaneId(rawValue)) {
        throw new Error(
            `planeConfig: ${envVarName}="${rawValue}" is not an opaque planeId — ` +
            'no path separators or data-dir content; a path-shaped identity would pre-decide the placement election.'
        );
    }
    return rawValue
}

/**
 * @summary Computes the plane data-root ANCHOR a config's leaf defaults derive from — a pure path
 * join over a caller-supplied root, with no environment access of any kind.
 *
 * It reads no env on purpose. The `plane.dataRoot` leaf binds `NEO_PLANE_DATA_ROOT` and the leaf
 * machinery resolves it; a second env read here would be a resolver competing with that one, able
 * to disagree with it. This function answers only "where does the anchor sit when nothing has
 * relocated it" — relocation is the leaf's job, and every caller reaches this for the anchor alone.
 *
 * `rootDir` is required rather than defaulted: a config that trusted ambient cwd would land its
 * plane wherever the process happened to start, which is the alternate-realities defect the plane
 * contract exists to remove.
 * @param {Object} options
 * @param {String} options.rootDir Discovered repository / deployment root the relative default anchors on.
 * @returns {String}
 */
export function resolvePlaneDataRoot({rootDir} = {}) {
    if (!rootDir) {
        throw new Error(
            'planeConfig.resolvePlaneDataRoot: rootDir is required — a config must inject its ' +
            'discovered root rather than trusting ambient cwd.'
        );
    }

    return path.resolve(rootDir, PLANE_DEFAULTS.dataRootRelative)
}

/**
 * @summary Symlink-transparent path identity: real path when the target exists, plain
 * resolution when it does not (a not-yet-created root cannot be the durable root).
 * @param {String} p
 * @returns {String}
 */
function realpathOrResolve(p) {
    try {
        return fs.realpathSync(p)
    } catch {
        return path.resolve(p)
    }
}

/**
 * @summary The F-invariant boot assertion — a declared plane's resolved values must be
 * internally consistent, and an isolated overlay must FAIL CLOSED if it can resolve the
 * durable root (including through a symlink layer — the reconcile probe's escape class).
 *
 * Three clauses, in order:
 * 1. `planeId` must be opaque — this closes the custom-config-file route the leaf's
 *    env parser never sees.
 * 2. `dataRoot` must be absolute — a relative root re-imports ambient-cwd resolution.
 * 3. A NON-canonical `planeId` (a declared overlay) must not resolve — symlink-transparently —
 *    to the canonical durable root: identity-without-isolation would mutate the durable plane.
 *
 * ## What this CANNOT detect — read before treating a call site as protected
 *
 * Clause 3 is a **collision** test: a non-canonical identity resolving ONTO the canonical root.
 * It is not, and cannot be, a **divergence** test — a canonical identity resolving AWAY from the
 * root the deployment actually serves.
 *
 * Two structural reasons, both load-bearing:
 *
 * 1. `planeId !== canonicalPlaneId` short-circuits before the root comparison, so a process
 *    claiming the canonical identity never reaches clause 3 at all.
 * 2. There is no served-root fact here to compare against. Callers derive `canonicalDataRoot`
 *    from their own module location, so a process booted from the wrong checkout computes a
 *    canonical that agrees with itself perfectly and passes. Supplying the true served root as
 *    `canonicalDataRoot` does NOT help: clause 3 still never runs for a canonical identity.
 *
 * The measured shapes:
 *
 * ```
 * THROWS  overlay id + dataRoot collides with canonical root   <- the hazard it was built for
 * PASS    canonical id, dataRoot = orphan, canonical = orphan  <- what a wrong-checkout boot passes
 * PASS    canonical id, dataRoot = orphan, canonical = SERVED  <- injecting the true root does not help
 * PASS    overlay id,   roots DIVERGE                          <- divergence is not expressible
 * ```
 *
 * **Consequence:** a caller that runs this at boot is protected against overlay-onto-durable
 * mutation and is NOT protected against serving the wrong store. Do not read a call to this as
 * coverage for the second. Detecting divergence requires a served-root fact supplied from OUTSIDE
 * the process — never re-derived from `import.meta.url`, since that self-derivation is the defect.
 *
 * Pure and injectable (no Neo import): entrypoints assert provider-resolved values;
 * non-entrypoints may assert twin-resolved values.
 * @param {Object} options
 * @param {String} options.planeId Resolved plane identity.
 * @param {String} options.dataRoot Resolved plane data root.
 * @param {String} [options.canonicalDataRoot] The durable root reference; clause 3 only runs when provided.
 * @param {String} [options.canonicalPlaneId] Canonical identity; defaults to the twin literal.
 * @param {Function} [options.realpathFn] Path-identity resolver, injectable for tests.
 * @returns {Object} Frozen observed identity `{planeId, dataRoot}` for emission consumers.
 */
export function assertPlaneCoherence({planeId, dataRoot, canonicalDataRoot, canonicalPlaneId = PLANE_DEFAULTS.planeId, realpathFn = realpathOrResolve}) {
    if (!isOpaquePlaneId(planeId)) {
        throw new Error(
            `planeConfig.assertPlaneCoherence: planeId "${planeId}" is not opaque — ` +
            'no path separators or data-dir content; a path-shaped identity would pre-decide the placement election.'
        );
    }

    if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot)) {
        throw new Error(
            `planeConfig.assertPlaneCoherence: dataRoot "${dataRoot}" must be absolute — ` +
            'a relative plane root re-imports the ambient-cwd resolution this contract retires.'
        );
    }

    if (planeId !== canonicalPlaneId && canonicalDataRoot &&
        realpathFn(dataRoot) === realpathFn(canonicalDataRoot)) {
        throw new Error(
            `planeConfig.assertPlaneCoherence: plane "${planeId}" resolves the durable root "${canonicalDataRoot}" — ` +
            'an isolated overlay must fail closed rather than mutate the durable plane (identity without isolation).'
        );
    }

    return Object.freeze({planeId, dataRoot})
}

/**
 * @summary Walks a claimed plane-member path list against a RESOLVED config plus the
 * declaring class's static descriptor data, producing `{path, resolved, default}` entries
 * for `assertPlaneMemberCoherence`. Fails loud on any unresolvable listed path — a claimed
 * member that cannot be walked is a contract breach, never a skip.
 * @param {Object} options
 * @param {String[]} options.memberPaths Dotted member paths the config base claims.
 * @param {Object} options.resolvedConfig The resolved config (Provider proxy) to read values from.
 * @param {Object} options.descriptorData The declaring class's static `config.data` tree.
 * @returns {Object[]} `{path, resolved, default}` entries.
 */
export function collectPlaneMembers({memberPaths, resolvedConfig, descriptorData}) {
    // Read-then-check (never the `in` operator): resolved configs are Provider PROXIES whose
    // reads delegate to the reactive data tree without implementing a `has` trap. An
    // undefined terminal fails loud — a claimed member that cannot be walked is a contract
    // breach, never a skip.
    const dig = (obj, dotted, what) => {
        const value = dotted.split('.').reduce((node, key) => node == null ? undefined : node[key], obj);

        if (value === undefined) {
            throw new Error(`planeConfig.collectPlaneMembers: claimed member "${dotted}" is not resolvable in the ${what} tree.`);
        }
        return value;
    };

    return memberPaths.map(memberPath => ({
        path    : memberPath,
        resolved: dig(resolvedConfig, memberPath, 'resolved'),
        default : dig(descriptorData, memberPath, 'descriptor').default
    }))
}

/**
 * @summary Derives the plane-member path set from a declaring class's static descriptor tree —
 * the COMPLETENESS half of the member contract, checking the list against the config tree it
 * claims to describe rather than against itself or a pinned count.
 *
 * Declaration and membership are ONE act: a leaf whose default resolves beneath the plane
 * anchor must carry an explicit `planeMember` decision in its descriptor metadata.
 * - `planeMember: true`  — the leaf IS a plane member; included in the derived set.
 * - `planeMember: false` — an explicit non-member; REQUIRES a non-empty `planeMemberReason`
 *   (the decision is recorded, never implied — see `orchestrator.tenantRepoMirrorRoot`'s
 *   cloud-profile pinning and the `plane.dataRoot` anchor leaf itself).
 * - absent               — undecided. When the default is an absolute path at or beneath the
 *   anchor, this FAILS CLOSED: the common operation (add a plane-anchored leaf, forget the
 *   list) can no longer pass silently, which is the omission class a real instance first confirmed
 *   (the graph SQLite leaf in the memory-core copy — the plane's core artifact with a plane-anchored
 *   default and no declared membership) and the pinned `toBe(N)` census could never see.
 *   ticket-ref-ok: #15872 is the omission instance the mechanism exists to catch — the check's
 *   empirical anchor, named because the motivation lives in the proof, not the number.
 *
 * A leaf-shaped node owns all four descriptor keys (`default`, `env`, `type`, `parse`) — the
 * `leaf()` signature in `ConfigProvider.mjs` — which is what distinguishes a descriptor from
 * a plain nested config object that merely has a `default`-named key.
 *
 * "Explicitly placed" is unaffected: this walk reads METADATA and DEFAULTS, never resolved
 * values, so a member relocated by its own env binding stays a member (its placement is the
 * boot clause's question, `assertPlaneMemberCoherence` — not this one's).
 *
 * Pure and injectable (no Neo import): the declaring config's descriptor tree is plain data.
 * @param {Object} options
 * @param {Object} options.descriptorData The declaring class's static `config.data` tree.
 * @param {String} options.anchor The absolute plane anchor the config's member defaults derive
 *     from (each config base's own `resolvePlaneDataRoot({rootDir})` result).
 * @returns {String[]} The derived member path list (tree-walk order).
 */
export function derivePlaneMemberPaths({descriptorData, anchor}) {
    if (!descriptorData || typeof descriptorData !== 'object' || Array.isArray(descriptorData)) {
        throw new Error('planeConfig.derivePlaneMemberPaths: descriptorData must be a config data tree (object).');
    }
    if (typeof anchor !== 'string' || !path.isAbsolute(anchor)) {
        throw new Error(`planeConfig.derivePlaneMemberPaths: anchor "${anchor}" must be an absolute path — the reference member defaults derive from.`);
    }

    const
        memberPaths = [],
        LEAF_KEYS   = ['default', 'env', 'type', 'parse'],
        isLeaf      = node => LEAF_KEYS.every(key => Object.prototype.hasOwnProperty.call(node, key));

    const walk = (node, trail) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return;

        if (isLeaf(node)) {
            const dotted = trail.join('.');

            if (node.planeMember === true) {
                memberPaths.push(dotted);
                return;
            }

            if (node.planeMember === false) {
                if (typeof node.planeMemberReason !== 'string' || node.planeMemberReason.length === 0) {
                    throw new Error(
                        `planeConfig.derivePlaneMemberPaths: "${dotted}" declares planeMember: false without a non-empty ` +
                        'planeMemberReason — an explicit non-member must name why, or the exclusion is indistinguishable from an omission.'
                    );
                }
                return;
            }

            const defaultValue = node.default;

            if (typeof defaultValue === 'string' && path.isAbsolute(defaultValue) &&
                (defaultValue === anchor || defaultValue.startsWith(anchor + path.sep))) {
                throw new Error(
                    `planeConfig.derivePlaneMemberPaths: leaf "${dotted}" has a plane-anchored default but NO planeMember decision — ` +
                    'declaration and membership are one act: set planeMember: true (a plane member), or planeMember: false with ' +
                    'planeMemberReason (an explicit non-member). An undecided anchored leaf fails closed; a pinned count cannot see it.'
                );
            }
            return;
        }

        for (const key of Object.keys(node)) {
            walk(node[key], [...trail, key]);
        }
    };

    walk(descriptorData, []);

    return memberPaths;
}

/**
 * @summary Member-coherence clause of the F-invariant: when `plane.dataRoot` resolves away
 * from the build-time anchor (an env/profile relocation), every claimed member must either
 * sit beneath the RESOLVED root or be EXPLICITLY placed (resolved ≠ its declared default).
 * A partially-moved plane — root relocated, members still on their anchor defaults — is the
 * alternate-realities defect this epic exists to remove, so it FAILS BOOT rather than
 * silently splitting storage across two roots.
 * Comparison is LITERAL-prefix (`path.resolve` normalization, injectable): member coherence
 * asks whether a member's resolved string derives from the resolved root — symlink
 * forensics (a member reaching the root through a link layer) belong to the reconcile
 * probe, not this boot clause; mixing realpath into one side of a string-derivation
 * comparison flags every not-yet-created member on a symlinked seat.
 * @param {Object} options
 * @param {String} options.dataRoot Resolved `plane.dataRoot`.
 * @param {Object[]} options.members `{path, resolved, default}` entries from `collectPlaneMembers`.
 * @param {Function} [options.realpathFn] Path normalizer, injectable for tests.
 * @returns {void}
 */
export function assertPlaneMemberCoherence({dataRoot, members, realpathFn = path.resolve}) {
    const rootReal = realpathFn(dataRoot);

    const strays = members.filter(member => {
        if (member.resolved !== member.default) return false;

        const resolvedReal = realpathFn(member.resolved);
        return resolvedReal !== rootReal && !resolvedReal.startsWith(rootReal + path.sep);
    });

    if (strays.length > 0) {
        throw new Error(
            `planeConfig.assertPlaneMemberCoherence: plane.dataRoot resolves to "${dataRoot}" but ` +
            `${strays.length} claimed member(s) still derive from the build-time anchor ` +
            `(${strays.map(stray => stray.path).join(', ')}) — relocating the plane requires per-member ` +
            'placement (member env bindings / the per-profile election); a partially-moved plane fails closed.'
        );
    }
}

// Module-load invariant: the twin is literals + env NAMES only — the frozen default must
// satisfy the same opacity predicate every resolved value passes through. Fail at load,
// not at review.
if (!isOpaquePlaneId(PLANE_DEFAULTS.planeId)) {
    throw new Error('planeConfig: PLANE_DEFAULTS.planeId must stay opaque — no path content.');
}
