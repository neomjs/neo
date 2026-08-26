#!/usr/bin/env node

import {execFileSync}                 from 'node:child_process';
import {createHash}                   from 'node:crypto';
import fs                             from 'node:fs';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse}                        from 'acorn';
import {Command}                      from 'commander';

import {
    buildAuthorityByScript,
    edgeIdentity,
    readEntrypoints
}                                    from '../lint/lint-script-plane.mjs';
import {
    collectModuleFacts,
    FINDING,
    resolveEntrypointPlane,
    resolveRelative,
    walkCapabilityClosure
}                                    from '../lint/scriptPlaneClosure.mjs';
import {censusPlaneOpeners}           from './planePlacementCensus.mjs';

/**
 * Pre-Flight (structural fast-path): authoring
 * `ai/scripts/diagnostics/agentOsExtractionInventory.mjs` matches the read-only, rerunnable census
 * role of `planePlacementCensus.mjs` and `devDependencyCensus.mjs`; sibling-file-lift applies and
 * no novel directory choice or Architecture Overview row is introduced.
 *
 * @module ai/scripts/diagnostics/agentOsExtractionInventory
 * @summary Reconciles every current AgentOS extraction surface against one explicit plane/custody
 * authority and composes the freeze-bound Wave-3 cut receipt from those existing proofs.
 *
 * ## Why the populations remain separate
 *
 * A launchable root, an `ai/scripts` module, a root npm command, a workflow occurrence, a subprocess
 * string, and a durable-plane opener are different identities. Collapsing them makes a plausible
 * count while dropping the exact edge a repository move must rewrite. This diagnostic derives each
 * population from its current source and only then joins it to the disposition registry.
 *
 * ## Authority discipline
 *
 * The existing classifiers remain authoritative: `lint-script-plane.mjs` owns launchable roots,
 * `scriptPlaneClosure.mjs` owns transitive capability reach, and `planePlacementCensus.mjs` owns
 * durable-plane openers. This module composes their exports; it does not copy their ledgers or
 * re-implement their predicates. Reactive config custody is static: operator overlays are named as
 * a class but never imported, and no env/config value is read or re-derived here.
 *
 * @example
 * node ai/scripts/diagnostics/agentOsExtractionInventory.mjs
 * node ai/scripts/diagnostics/agentOsExtractionInventory.mjs --json
 * node ai/scripts/diagnostics/agentOsExtractionInventory.mjs --wave3-cut-input /tmp/wave3-cut-input.json
 */

const
    __filename                  = fileURLToPath(import.meta.url),
    PROJECT_ROOT                = path.resolve(path.dirname(__filename), '../../..'),
    DEFAULT_REGISTRY_PATH       = path.join(PROJECT_ROOT, 'ai/scripts/diagnostics/agentOsExtractionInventory.json'),
    SCRIPT_PATH_RE              = /\bai\/scripts\/[A-Za-z0-9_./-]+\.mjs\b/g,
    WORKFLOW_ARTIFACT_RE        = /\b(?:test\/playwright\/unit\/)?ai\/scripts\/[A-Za-z0-9_./-]+\.(?:json|mjs)\b/g,
    AGENTOS_TARGET_REPOSITORY   = 'neomjs/neo-agent-brain',
    VALID_DISPOSITIONS          = new Set(['cloud', 'edge', 'retire', 'shared', 'stays-engine']),
    VALID_LEARNING_DISPOSITIONS = new Set(['move', 'stays-engine']),
    VALID_MANIFEST_TARGETS      = new Set(['cloud', 'edge', 'engine', 'shared']),
    VALID_PROBE_ELIGIBILITY     = new Set(['eligible', 'ineligible']),
    VALID_SUCCESSOR_PHASES      = new Set(['engine-continuity', 'move', 'seat-reprovisioning']),
    DEPLOYMENT_ARTIFACT_RE      = /^(?:Dockerfile(?:\..+)?|docker-compose(?:\..+)?\.ya?ml|Caddyfile(?:\..+)?|.+\.plist|.+\.dockerignore)$/,
    LAUNCH_CALLEES              = new Set([
        'exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'runCommand', 'spawn', 'spawnSync'
    ]),
    SUBPROCESS_SCAN_ROOTS       = ['.agents', '.claude', '.codex', 'ai', 'buildScripts', 'test'];

const
    DEPENDENCY_MANIFESTS = ['package.json', 'package.brain.json'],
    DEPENDENCY_SECTIONS  = [
        'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'
    ];

/**
 * Stable surface names in the machine receipt.
 * @type {Object}
 */
export const SURFACE = Object.freeze({
    closureEdge        : 'closure-edge',
    configAuthority    : 'config-authority',
    consumerEdge       : 'consumer-edge',
    consumerSourceClass: 'consumer-source-class',
    custodyBoundary    : 'custody-boundary',
    deploymentArtifact : 'deployment-artifact',
    launchRoot         : 'launch-root',
    learningArtifact   : 'learning-artifact',
    packageDependency  : 'package-dependency',
    planeOpener        : 'plane-opener',
    rootScript         : 'root-script',
    scriptModule       : 'script-module',
    subprocessLaunch   : 'subprocess-launch',
    workflowFile       : 'workflow-file',
    workflowReference  : 'workflow-reference'
});

/**
 * Repository-cut actions for workflows that currently reach AgentOS-owned artifacts.
 * These are deliberately separate from Edge/Cloud execution custody: one answers where a
 * referenced target runs, the other answers which repository owns the workflow after the cut.
 * @type {Object<String, String>}
 */
export const WORKFLOW_FILE_DISPOSITION = Object.freeze({
    move    : 'move',
    pinFetch: 'pin-fetch',
    retire  : 'retire'
});

const VALID_WORKFLOW_FILE_DISPOSITIONS = new Set(Object.values(WORKFLOW_FILE_DISPOSITION));

/**
 * Stable direction vocabulary for package-boundary consumer edges.
 * @type {Object}
 */
export const CONSUMER_EDGE_DIRECTION = Object.freeze({
    agentOsToOutside: 'agentos-to-outside',
    outsideToAgentOs: 'outside-to-agentos'
});

/**
 * Direction-specific closure vocabulary. These values describe the cut action, not present-day
 * execution-plane custody, so they intentionally do not enter `VALID_DISPOSITIONS`.
 * @type {Object<String, Set<String>>}
 */
export const CONSUMER_EDGE_DISPOSITIONS = Object.freeze({
    [CONSUMER_EDGE_DIRECTION.agentOsToOutside]: new Set([
        'moves-agentos-source',
        'published-engine-package',
        'retire-boundary-edge'
    ]),
    [CONSUMER_EDGE_DIRECTION.outsideToAgentOs]: new Set([
        'engine-contract-client',
        'generated-target-artifact',
        'moves-agentos-test',
        'served-contract-integration',
        'stays-engine-guard'
    ])
});

const PRECLASSIFIED_CONSUMER_DISPOSITIONS = new Set([
    'generated-target-artifact',
    'moves-agentos-source',
    'moves-agentos-test'
]);

/**
 * Maps the existing execution-authority vocabulary onto the extraction registry vocabulary.
 * `shared-primitive` is NOT C′'s conditional pure `shared/` package: the declared task-authority
 * matrix assigns that class to the Container profile, while Host Edge owns only `host-edge`. It therefore
 * maps to Cloud. A module enters `shared/` only through an explicit, purity-backed registry row.
 * This mapping is valid only while the task-authority matrix has the current Host-Edge and
 * Container-Cloud owner roles; a third role must first extend that source authority and then this map.
 * @type {Object}
 */
export const PLANE_DISPOSITIONS = Object.freeze({
    'container-plane' : 'cloud',
    'host-edge'       : 'edge',
    'shared-primitive': 'cloud'
});

/**
 * Stable runtime-probe eligibility vocabulary consumed by the paired AgentOS boundary proof.
 * `eligible` licenses bounded evaluation inside the disposable child, not side-effect purity:
 * finite child-local env/config reads are allowed. Entrypoints that can run their CLI, exit, wait,
 * spawn persistent work, or acquire durable state merely by import are `ineligible` with a reason.
 * @type {Object}
 */
export const RUNTIME_PROBE_ELIGIBILITY = Object.freeze({
    eligible  : 'eligible',
    ineligible: 'ineligible'
});

/**
 * Stable Wave-3 receipt vocabulary. These are execution-order coordinates from the existing
 * runway, not a second workflow registry.
 * @type {String}
 */
export const WAVE3_CUT_MANIFEST_VERSION = 'wave3-cut-manifest.v1';

export const WAVE3_RECEIVE_ORDER = Object.freeze(['#17788', '#17789', '#17790', '#17791']);

export const WAVE3_REMOVAL_REQUIRES = Object.freeze([
    '#17783', '#17788', '#17789', '#17790', '#17798', 'neo-agent-brain#10'
]);

const
    GIT_SHA_RE                    = /^[0-9a-f]{40}$/,
    SHA256_RE                     = /^[0-9a-f]{64}$/,
    DIGEST_RE                     = /^sha256:[0-9a-f]{64}$/,
    VALID_REFERENCE_CLOSURE_STATE = new Set(['red', 'green']);

/**
 * @summary Normalizes one filesystem path into a repository-style slash path.
 * @param {String} value
 * @returns {String}
 */
export function normalizePath(value) {
    return String(value || '').split(path.sep).join('/')
}

/**
 * @summary Lists tracked files below the supplied pathspecs, never untracked scratch/output.
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {String[]} [options.pathspecs=[]]
 * @returns {String[]}
 */
export function listTrackedFiles({projectRoot = PROJECT_ROOT, pathspecs = []} = {}) {
    const output = execFileSync('git', ['-C', projectRoot, 'ls-files', ...pathspecs], {
        encoding : 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });

    return output.split('\n').filter(Boolean).map(normalizePath).sort()
}

/**
 * @summary Discovers every tracked deployment artifact, including deployment-shaped files outside
 * the canonical `ai/deploy/` root.
 *
 * The root population stays exact even for support files whose basename is not deployment-shaped
 * (`kb-config.yaml`, mock servers, Host-Edge profile code). The global shape sweep catches the
 * dangerous inverse: a Caddyfile or launchd plist stored elsewhere that directory-only discovery
 * would silently omit. Input is already Git-tracked, so ignored build/vendor output never enters.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {String[]} [options.trackedFiles] Injectable tracked-tree population.
 * @returns {Object[]} Stable deployment-artifact rows awaiting source-owned disposition.
 */
export function collectDeploymentArtifacts({
    projectRoot = PROJECT_ROOT,
    trackedFiles = listTrackedFiles({projectRoot})
} = {}) {
    return trackedFiles.map(normalizePath).filter(file => file.startsWith('ai/deploy/') ||
        DEPLOYMENT_ARTIFACT_RE.test(path.posix.basename(file))).map(file => ({
        surface    : SURFACE.deploymentArtifact,
        identity   : file,
        source     : file,
        disposition: null,
        rationale  : null,
        evidence   : {
            discoveredVia: file.startsWith('ai/deploy/') ? 'declared-root' : 'tracked-shape-sweep'
        }
    })).sort(compareRows)
}

/**
 * @summary Discovers the exact tracked Agent OS learning/decision population for subject custody.
 *
 * No directory default is applied: Brain/Fleet/Engine/skills subjects coexist below
 * `learn/agentos`, so every path requires one explicit judgment from the frozen census.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {String[]} [options.trackedFiles] Injectable tracked-tree population.
 * @returns {Object[]} Stable learning-artifact rows awaiting source-owned disposition.
 */
export function collectLearningArtifacts({
    projectRoot = PROJECT_ROOT,
    trackedFiles = listTrackedFiles({projectRoot, pathspecs: ['learn/agentos']})
} = {}) {
    return trackedFiles.map(normalizePath).filter(file => file.startsWith('learn/agentos/')).map(file => ({
        surface    : SURFACE.learningArtifact,
        identity   : file,
        source     : file,
        disposition: null,
        rationale  : null,
        evidence   : {tracked: true}
    })).sort(compareRows)
}

/**
 * @summary Reads the source-owned disposition registry without evaluating code.
 * @param {String} [registryPath=DEFAULT_REGISTRY_PATH]
 * @returns {Object}
 */
export function readRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'))
}

/**
 * @summary Returns one row identity scoped by its population, preventing same-path cross-surface
 * collisions from being mistaken for duplicates.
 * @param {String} surface
 * @param {String} identity
 * @returns {String}
 */
export function rowKey(surface, identity) {
    return `${surface}::${identity}`
}

/**
 * @summary Validates disposition vocabulary without leaking learning-migration actions into plane surfaces.
 * @param {String} surface
 * @param {String} disposition
 * @returns {Boolean}
 */
function isValidDisposition(surface, disposition) {
    return surface === SURFACE.learningArtifact
        ? VALID_LEARNING_DISPOSITIONS.has(disposition)
        : VALID_DISPOSITIONS.has(disposition)
}

/**
 * @summary Refuses to bind a receipt to `HEAD` when staged, modified, or untracked source is also
 * part of the census. Tests may opt into derivation over a dirty tree, but that result is never a
 * publishable SHA receipt.
 * @param {String} status Porcelain-v1 status output.
 * @param {Boolean} [allowDirty=false]
 * @returns {Object|null} Typed error, or `null` when the SHA binding is honest/explicitly bypassed.
 */
export function sourceBindingError(status, allowDirty = false) {
    if (!status || allowDirty) return null;

    return {
        kind : 'dirty-worktree',
        key  : status.split('\n').map(line => line.slice(3)).sort().join(', '),
        error: 'a commit SHA cannot bind staged, modified, or untracked source'
    }
}

/**
 * @summary Resolves operator-overlay imports through their tracked template sibling before the
 * filesystem fallback, so closure reachability is a pure function of the committed tree whether
 * or not the install-time `prepare` hook rendered `config.mjs`.
 * @param {String} specifier Relative import specifier.
 * @param {String} fromFile Absolute importing module path.
 * @param {Function} [resolve=resolveRelative] Fallback resolver for non-overlay imports.
 * @returns {String|null}
 */
export function resolveTrackedConfigSpecifier(specifier, fromFile, resolve = resolveRelative) {
    const requested = path.resolve(path.dirname(fromFile), specifier);

    if (requested.endsWith(`${path.sep}config.mjs`)) {
        const template = requested.slice(0, -'config.mjs'.length) + 'config.template.mjs';

        if (fs.existsSync(template) && fs.statSync(template).isFile()) {
            return template
        }
    }

    return resolve(specifier, fromFile)
}

/**
 * @summary Extracts every static string represented by a literal, template-without-expressions,
 * concatenation, or array. Dynamic fragments return no invented value.
 * @param {Object|null} node ESTree node.
 * @returns {String[]}
 */
export function staticStrings(node) {
    if (!node) return [];

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return [node.value]
    }

    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return [node.quasis.map(item => item.value.cooked ?? item.value.raw).join('')]
    }

    if (node.type === 'BinaryExpression' && node.operator === '+') {
        const left = staticStrings(node.left), right = staticStrings(node.right);

        return left.flatMap(a => right.map(b => `${a}${b}`))
    }

    if (node.type === 'ArrayExpression') {
        return node.elements.flatMap(staticStrings)
    }

    return []
}

/**
 * @summary Walks an ESTree tree without adding another parser dependency.
 * @param {Object} node
 * @param {Function} visit
 */
export function walkAst(node, visit) {
    if (!node || typeof node.type !== 'string') return;

    visit(node);

    for (const [key, value] of Object.entries(node)) {
        if (['end', 'loc', 'start', 'type'].includes(key)) continue;

        if (Array.isArray(value)) {
            value.forEach(child => walkAst(child, visit))
        } else if (value && typeof value.type === 'string') {
            walkAst(value, visit)
        }
    }
}

/**
 * @summary Resolves a call expression's terminal callee name (`spawn`, `execFileSync`, wrapper
 * `runCommand`, etc.) while retaining member-call support.
 * @param {Object} callee
 * @returns {String|null}
 */
export function calleeName(callee) {
    if (callee?.type === 'Identifier') return callee.name;
    if (callee?.type === 'MemberExpression' && !callee.computed) return callee.property?.name ?? null;

    return null
}

/**
 * @summary Finds static `ai/scripts/*.mjs` subprocess targets in executable AST calls. Comments and
 * arbitrary prose never enter the population; concatenated/template literals are folded only when
 * fully static. A parse failure is returned separately and can never shrink the census silently.
 * @param {String} source
 * @param {String} file
 * @returns {{launches: Object[], parseError: String|null}}
 */
export function discoverSubprocessLaunches(source, file) {
    let ast;

    try {
        ast = parse(source, {allowHashBang: true, ecmaVersion: 'latest', locations: true, sourceType: 'module'})
    } catch (error) {
        return {launches: [], parseError: error.message}
    }

    const launches = [], ordinals = new Map();

    walkAst(ast, node => {
        if (node.type !== 'CallExpression') return;

        const callee = calleeName(node.callee);

        if (!LAUNCH_CALLEES.has(callee)) return;

        for (const value of node.arguments.flatMap(staticStrings)) {
            for (const match of value.matchAll(SCRIPT_PATH_RE)) {
                const target  = match[0],
                      ordinal = (ordinals.get(`${callee}:${target}`) ?? 0) + 1;

                ordinals.set(`${callee}:${target}`, ordinal);
                launches.push({
                    identity: `${file}::${callee}::${target}::${ordinal}`,
                    source  : `${file}:${node.loc.start.line}`,
                    target,
                    callee
                })
            }
        }
    });

    return {launches, parseError: null}
}

/**
 * @summary Collects raw workflow references, including comments and path filters that the later
 * rewrite must update. Identity is target+ordinal within one file, while `source` carries the
 * current line coordinate; inserting unrelated lines does not churn authority.
 * @param {String} source
 * @param {String} file
 * @returns {Object[]}
 */
export function discoverWorkflowReferences(source, file) {
    const rows = [], ordinals = new Map();

    source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(WORKFLOW_ARTIFACT_RE)) {
            const target  = match[0],
                  ordinal = (ordinals.get(target) ?? 0) + 1;

            ordinals.set(target, ordinal);
            rows.push({
                identity: `${file}::${target}::${ordinal}`,
                source  : `${file}:${index + 1}`,
                target
            })
        }
    });

    return rows
}

/**
 * @summary Creates the script-module rows by inverting every launchable root's existing closure.
 * Closure supplies a suggested disposition and reachability evidence only. Final custody always
 * comes from an explicit registry row: present-day reach cannot silently rewrite the migration plan.
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Function} [options.resolveFallback=resolveRelative] Filesystem resolver wrapped by the
 * tracked-config resolver.
 * @returns {{rows: Object[], closureRows: Object[], launchRoots: Object[], closureByLaunchRoot: Map<String,String[]>}}
 */
export function collectScriptModules({
    projectRoot = PROJECT_ROOT,
    resolveFallback = resolveRelative
} = {}) {
    const
        scripts           = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts ?? {},
        authorityByScript = buildAuthorityByScript({projectRoot}),
        launchRoots       = readEntrypoints(scripts, authorityByScript),
        files             = listTrackedFiles({projectRoot, pathspecs: ['ai/scripts']})
            .filter(file => file.endsWith('.mjs')),
        reachedBy         = new Map(files.map(file => [file, new Set()])),
        closureRows       = new Map(),
        closureByLaunchRoot = new Map();

    launchRoots.forEach(entry => {
        const
            absolute = path.join(projectRoot, entry.rel),
            closure  = walkCapabilityClosure({
                entrypoint: absolute,
                resolve   : (specifier, fromFile) =>
                    resolveTrackedConfigSpecifier(specifier, fromFile, resolveFallback)
            }),
            resolved = resolveEntrypointPlane({
                closure,
                authorityClass: authorityByScript[entry.rel]?.authorityClass ?? null,
                taskName      : authorityByScript[entry.rel]?.taskName ?? null,
                entrypoint    : entry.rel
            }),
            plane    = resolved.plane ?? 'unresolved';

        const priorReach = closureByLaunchRoot.get(entry.rel) ?? new Set();
        closure.reached.forEach(file => priorReach.add(file));
        closureByLaunchRoot.set(entry.rel, priorReach);

        // Keep the owning closure/authority classifier's result on the exact launch population.
        // H1 later promotes these objects into registry rows; retaining the result here lets task
        // roots outside `ai/scripts` receive the same authority-conflict protection as resident
        // script modules without re-running or copying the plane classifier.
        entry.plane                = plane;
        entry.suggestedDisposition = PLANE_DISPOSITIONS[plane] ?? null;

        closure.reached.forEach(absolutePath => {
            const relative = normalizePath(path.relative(projectRoot, absolutePath));

            reachedBy.get(relative)?.add(plane)
        });

        resolved.findings
            .filter(finding => finding.kind === FINDING.unresolvedEdge)
            .forEach(finding => {
                const identity = edgeIdentity(finding, projectRoot);

                closureRows.set(identity, {
                    surface    : SURFACE.closureEdge,
                    identity,
                    source     : `${normalizePath(path.relative(projectRoot, finding.module ?? absolute))}:${finding.line ?? '?'}`,
                    disposition: null,
                    rationale  : null,
                    evidence   : {entrypoint: entry.rel, reason: finding.reason, member: finding.member, callee: finding.callee}
                })
            })
    });

    const rows = files.map(file => {
        const
            planes      = [...reachedBy.get(file)].sort(),
            disposition = planes.length === 1 ? PLANE_DISPOSITIONS[planes[0]] ?? null : null;

        return {
            surface    : SURFACE.scriptModule,
            identity   : file,
            source     : file,
            disposition: null,
            rationale  : null,
            evidence   : {
                planes,
                suggestedDisposition: disposition,
                reachability        : planes.length === 0 ? 'unreached' : planes.length === 1 ? 'single-plane' : 'mixed'
            }
        }
    });

    return {
        rows,
        closureRows        : [...closureRows.values()].sort(compareRows),
        launchRoots,
        closureByLaunchRoot: new Map([...closureByLaunchRoot.entries()].map(([identity, reached]) => [
            identity,
            [...reached].sort()
        ]))
    }
}

/**
 * @summary Promotes the owning launch-root classifier's exact target population into inventory
 * rows. The target path is stable identity; npm/workflow/task channel and source name stay
 * evidence, so a channel correction does not manufacture a different executable while a target
 * substitution still changes identity. Custody follows the already-reconciled target module when
 * one exists; task roots outside `ai/scripts` must carry their classifier's explicit suggestion,
 * because emitting a null suggestion would silently disable the later authority-conflict guard.
 * @param {Object} options
 * @param {Object[]} options.launchRoots Output of `readEntrypoints()`.
 * @param {Map<String, Object>} options.scriptRowsByIdentity Reconciled script-module rows.
 * @returns {Object[]}
 * @throws {Error} When a launch root has neither reconciled script-module custody nor an explicit
 *     classifier suggestion.
 */
export function collectLaunchRoots({launchRoots = [], scriptRowsByIdentity = new Map()} = {}) {
    return launchRoots.map(({name, plane = null, rel, suggestedDisposition = null, via}) => {
        const
            target            = scriptRowsByIdentity.get(rel),
            targetDisposition = target?.disposition ?? suggestedDisposition;

        if (!targetDisposition) {
            throw new Error(`collectLaunchRoots: launch root '${rel}' has no reconciled script-module custody or explicit suggestedDisposition`)
        }

        return {
            surface : SURFACE.launchRoot,
            identity: rel,
            source  : via === 'npm'
                ? `package.json#scripts.${name}`
                : via === 'task'
                    ? `ai/daemons/orchestrator/taskDefinitions.mjs#${name}`
                    : `.github/workflows launch target ${rel}`,
            disposition: null,
            rationale  : null,
            evidence   : {
                name,
                plane,
                target              : rel,
                via,
                suggestedDisposition: targetDisposition,
                suggestedRationale  : targetDisposition ? `follows ${rel}` : null
            }
        }
    }).sort(compareRows)
}

/**
 * @summary Derives exact dependency-declaration rows from one parsed package manifest.
 * Identity binds manifest, declaration section, and package name; version is evidence rather than
 * identity so a version edit remains the same owned declaration while still changing the receipt.
 * The Brain tier supplies a Cloud suggestion only; the registry remains final custody authority.
 * @param {Object} options
 * @param {Object} options.manifest Parsed package manifest.
 * @param {String} options.manifestName Repository-relative manifest path.
 * @returns {Object[]}
 */
export function inspectManifestDependencies({manifest = {}, manifestName}) {
    const errors = [];

    Object.keys(manifest).filter(key => /dependencies$/i.test(key) && !DEPENDENCY_SECTIONS.includes(key))
        .forEach(key => errors.push({
            kind : 'unsupported-dependency-section',
            key  : `${manifestName}::${key}`,
            error: 'dependency-bearing sections must enter the exact manifest population explicitly'
        }));

    const rows = DEPENDENCY_SECTIONS.flatMap(section => {
        const declarations = manifest[section];

        if (declarations === undefined) return [];
        if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) {
            errors.push({
                kind : 'invalid-dependency-section',
                key  : `${manifestName}::${section}`,
                error: 'expected a package-name to version object'
            });
            return []
        }

        return Object.entries(declarations)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, version]) => ({
            surface    : SURFACE.packageDependency,
            identity   : `${manifestName}::${section}::${name}`,
            source     : `${manifestName}#${section}.${name}`,
            disposition: null,
            rationale  : null,
            evidence   : {
                manifest            : manifestName,
                name,
                section,
                version,
                suggestedDisposition: manifestName === 'package.brain.json' ? 'cloud' : null,
                suggestedRationale  : manifestName === 'package.brain.json'
                    ? 'the Brain install tier owns durable Cloud packages'
                    : null
            }
        }))
    }).sort(compareRows);

    return {
        rows,
        errors: errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`))
    }
}

/**
 * @summary Convenience projection for callers that already own manifest-read error handling.
 * @param {Object} options See `inspectManifestDependencies()`.
 * @returns {Object[]}
 */
export function collectManifestDependencyRows(options) {
    return inspectManifestDependencies(options).rows
}

/**
 * @summary Reads every current dependency manifest and install-bearing declaration section into
 * one exact, disposition-ready population.
 * Missing optional manifests contribute no rows; a future declaration inside either supported
 * section enters the population automatically and fails reconciliation until it gains authority.
 * @param {Object} [options]
 * @param {String[]} [options.manifestNames=DEPENDENCY_MANIFESTS]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @returns {{rows: Object[], errors: Object[]}}
 */
export function collectPackageDependencies({
    manifestNames = DEPENDENCY_MANIFESTS,
    projectRoot   = PROJECT_ROOT
} = {}) {
    const rows = [], errors = [];

    manifestNames.forEach(manifestName => {
        const manifestPath = path.join(projectRoot, manifestName);

        if (!fs.existsSync(manifestPath)) {
            errors.push({kind: 'missing-dependency-manifest', key: manifestName});
            return
        }

        let manifest;

        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        } catch (error) {
            errors.push({kind: 'invalid-dependency-manifest', key: manifestName, error: error.message});
            return
        }

        const inspected = inspectManifestDependencies({manifest, manifestName});

        rows.push(...inspected.rows);
        errors.push(...inspected.errors)
    });

    return {
        rows  : rows.sort(compareRows),
        errors: errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`))
    }
}

/**
 * @summary Materializes the explicit dependency membership authority into independently installable
 * manifest maps. A package may target multiple planes, but each target is named; no `shared`
 * disposition is overloaded to mean duplication, and conflicting versions for one target fail.
 * @param {Object[]} rows Reconciled package-dependency inventory rows.
 * @returns {{manifests: Object<String, Object>, errors: Object[]}}
 */
export function composeDependencyManifests(rows = []) {
    const
        errors    = [],
        manifests = Object.fromEntries([...VALID_MANIFEST_TARGETS].sort().map(target => [target, {}]));

    rows.forEach(row => {
        const {name, version} = row.evidence ?? {};

        (row.manifestTargets ?? []).forEach(target => {
            const previous = manifests[target]?.[name];

            if (previous !== undefined && previous !== version) {
                errors.push({
                    kind : 'manifest-target-version-conflict',
                    key  : `${target}::${name}`,
                    error: `${previous} != ${version}`
                });
                return
            }
            if (manifests[target]) manifests[target][name] = version
        })
    });

    Object.values(manifests).forEach(manifest => {
        const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));

        Object.keys(manifest).forEach(key => delete manifest[key]);
        Object.assign(manifest, sorted)
    });

    return {
        manifests,
        errors: errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`))
    }
}

/**
 * @summary Collects every root npm script. Command shape supplies a suggested disposition only;
 * every command requires an exact registry identity so a new alias cannot become authority by name.
 * @param {Object} options
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Map<String, Object>} options.scriptRowsByIdentity
 * @returns {Object[]}
 */
export function collectRootScripts({projectRoot = PROJECT_ROOT, scriptRowsByIdentity}) {
    const scripts = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts ?? {};

    return Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b)).map(([name, command]) => {
        const targets = [...new Set([...String(command).matchAll(SCRIPT_PATH_RE)].map(match => match[0]))],
              target  = targets.length === 1 ? scriptRowsByIdentity.get(targets[0]) : null;

        let suggestedDisposition = null, suggestedRationale = null;

        if (!name.startsWith('ai:')) {
            suggestedDisposition = 'stays-engine';
            suggestedRationale   = 'non-AgentOS root command remains with the Engine package'
        } else if (target?.disposition) {
            suggestedDisposition = target.disposition;
            suggestedRationale   = `follows ${targets[0]}`
        }

        return {
            surface    : SURFACE.rootScript,
            identity   : name,
            source     : `package.json#scripts.${name}`,
            disposition: null,
            rationale  : null,
            evidence   : {command, targets, suggestedDisposition, suggestedRationale}
        }
    })
}

/**
 * @summary Collects every raw workflow occurrence. Target custody is a suggestion; each occurrence
 * remains explicit authority so a new path filter or test carrier cannot arrive silently.
 * @param {Object} options
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Map<String, Object>} options.scriptRowsByIdentity
 * @returns {Object[]}
 */
export function collectWorkflowReferences({projectRoot = PROJECT_ROOT, scriptRowsByIdentity}) {
    const files = listTrackedFiles({projectRoot, pathspecs: ['.github/workflows']})
        .filter(file => /\.ya?ml$/.test(file));

    return files.flatMap(file => discoverWorkflowReferences(
        fs.readFileSync(path.join(projectRoot, file), 'utf8'), file
    )).map(row => {
        const target = scriptRowsByIdentity.get(row.target);

        return {
            surface    : SURFACE.workflowReference,
            identity   : row.identity,
            source     : row.source,
            disposition: null,
            rationale  : null,
            evidence   : {
                target              : row.target,
                workflowFile        : row.identity.split('::', 1)[0],
                suggestedDisposition: target?.disposition ?? null,
                suggestedRationale  : target?.disposition ? `follows ${row.target}` : null
            }
        }
    }).sort(compareRows)
}

/**
 * @summary Folds exact workflow occurrences into the file population that needs one repository-cut
 * action. Occurrence custody remains evidence; it never chooses the file action.
 * @param {Object[]} workflowRows Reconciled workflow-reference rows.
 * @returns {{rows: Object[], errors: Object[]}}
 */
export function deriveWorkflowFilePopulation(workflowRows = []) {
    const
        errors = [],
        files  = new Map();

    if (!Array.isArray(workflowRows)) {
        return {
            rows  : [],
            errors: [{kind: 'invalid-workflow-reference-population', key: 'workflowRows'}]
        }
    }

    workflowRows.forEach(row => {
        const workflowFile = row?.evidence?.workflowFile ?? row?.identity?.split('::', 1)[0];

        if (typeof workflowFile !== 'string'
            || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflowFile)) {
            errors.push({
                kind: 'invalid-workflow-file-identity',
                key : String(workflowFile ?? row?.identity ?? 'missing')
            });
            return
        }

        const file = files.get(workflowFile) ?? {
            dispositions   : new Set(),
            occurrenceCount: 0,
            targets        : new Set()
        };

        file.occurrenceCount++;
        row.disposition && file.dispositions.add(row.disposition);
        row.evidence?.target && file.targets.add(row.evidence.target);
        files.set(workflowFile, file)
    });

    const rows = [...files.entries()].map(([identity, file]) => ({
        surface    : SURFACE.workflowFile,
        identity,
        source     : identity,
        disposition: null,
        rationale  : null,
        evidence   : {
            occurrenceCount       : file.occurrenceCount,
            occurrenceDispositions: [...file.dispositions].sort(),
            targets               : [...file.targets].sort()
        }
    })).sort(compareRows);

    return {
        rows,
        errors: errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`))
    }
}

/**
 * @summary Reconciles the source-derived workflow-file population against one explicit cut action
 * per file. The action registry is separate from Edge/Cloud custody by construction.
 * @param {Object[]} workflowRows Reconciled workflow-reference rows.
 * @param {Object} registry Source-owned extraction registry.
 * @returns {Object}
 */
export function reconcileWorkflowFileDispositions(workflowRows, registry) {
    const
        population   = deriveWorkflowFilePopulation(workflowRows),
        errors       = [...population.errors],
        authorityMap = new Map(),
        derivedKeys  = new Set(population.rows.map(row => row.identity)),
        authority    = Array.isArray(registry?.workflowFileDispositions)
            ? registry.workflowFileDispositions
            : [];

    if (!Array.isArray(registry?.workflowFileDispositions)) {
        errors.push({kind: 'invalid-workflow-file-registry', key: 'workflowFileDispositions'})
    }

    authority.forEach(entry => {
        const {identity} = entry ?? {};

        if (typeof identity !== 'string' || !identity.trim()) {
            errors.push({kind: 'missing-workflow-file-identity', key: 'workflowFileDispositions'});
            return
        }

        if (authorityMap.has(identity)) {
            errors.push({kind: 'duplicate-workflow-file-authority', key: identity});
            return
        }

        authorityMap.set(identity, entry);

        if (!VALID_WORKFLOW_FILE_DISPOSITIONS.has(entry.disposition)) {
            errors.push({kind: 'invalid-workflow-file-disposition', key: identity})
        }
        if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 12) {
            errors.push({kind: 'missing-workflow-file-rationale', key: identity})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) {
            errors.push({kind: 'missing-workflow-file-source', key: identity})
        }

        const unexpected = [];

        if (entry.disposition === WORKFLOW_FILE_DISPOSITION.move) {
            if (entry.targetRepository !== AGENTOS_TARGET_REPOSITORY) {
                errors.push({kind: 'invalid-workflow-move-target', key: identity})
            }
            Object.hasOwn(entry, 'pinAuthority') && unexpected.push('pinAuthority');
            Object.hasOwn(entry, 'retirementEvidence') && unexpected.push('retirementEvidence')
        } else if (entry.disposition === WORKFLOW_FILE_DISPOSITION.pinFetch) {
            if (typeof entry.pinAuthority !== 'string' || entry.pinAuthority.trim().length < 12) {
                errors.push({kind: 'missing-workflow-pin-authority', key: identity})
            }
            Object.hasOwn(entry, 'targetRepository') && unexpected.push('targetRepository');
            Object.hasOwn(entry, 'retirementEvidence') && unexpected.push('retirementEvidence')
        } else if (entry.disposition === WORKFLOW_FILE_DISPOSITION.retire) {
            if (typeof entry.retirementEvidence !== 'string'
                || entry.retirementEvidence.trim().length < 12) {
                errors.push({kind: 'missing-workflow-retirement-evidence', key: identity})
            }
            Object.hasOwn(entry, 'targetRepository') && unexpected.push('targetRepository');
            Object.hasOwn(entry, 'pinAuthority') && unexpected.push('pinAuthority')
        }

        unexpected.forEach(field => errors.push({
            kind: 'unexpected-workflow-file-metadata', key: `${identity}::${field}`
        }))
    });

    const rows = population.rows.map(row => {
        const entry = authorityMap.get(row.identity);

        if (!entry) return row;

        return {
            ...row,
            disposition    : entry.disposition,
            rationale      : entry.rationale,
            authoritySource: entry.source,
            ...(entry.targetRepository ? {targetRepository: entry.targetRepository} : {}),
            ...(entry.pinAuthority ? {pinAuthority: entry.pinAuthority} : {}),
            ...(entry.retirementEvidence ? {retirementEvidence: entry.retirementEvidence} : {}),
            evidence       : {...row.evidence, override: true}
        }
    });

    const
        diskMinusAuthority = rows.filter(row => !authorityMap.has(row.identity))
            .map(row => row.identity).sort(),
        authorityMinusDisk = [...authorityMap.keys()].filter(identity => !derivedKeys.has(identity)).sort();

    diskMinusAuthority.forEach(key => errors.push({kind: 'missing-workflow-file-authority', key}));
    authorityMinusDisk.forEach(key => errors.push({kind: 'stale-workflow-file-authority', key}));

    const byDisposition = Object.fromEntries(Object.values(WORKFLOW_FILE_DISPOSITION)
        .map(disposition => [disposition, rows.filter(row => row.disposition === disposition).length]));

    return {
        total          : rows.length,
        occurrenceTotal: rows.reduce((total, row) => total + row.evidence.occurrenceCount, 0),
        byDisposition,
        rows           : rows.sort(compareRows),
        residue        : {diskMinusAuthority, authorityMinusDisk},
        errors         : errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`)),
        ok             : diskMinusAuthority.length === 0
            && authorityMinusDisk.length === 0
            && errors.length === 0
    }
}

/**
 * @summary Collects AST-proven subprocess launch strings from the AgentOS/build/harness source
 * trees. Parse failures are named separately so they cannot silently shrink the population.
 * @param {Object} options
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Map<String, Object>} options.scriptRowsByIdentity
 * @returns {{rows: Object[], parseFailures: Object[]}}
 */
export function collectSubprocessLaunches({projectRoot = PROJECT_ROOT, scriptRowsByIdentity}) {
    const files = listTrackedFiles({projectRoot, pathspecs: SUBPROCESS_SCAN_ROOTS})
        .filter(file => file.endsWith('.mjs')),
          rows = [], parseFailures = [];

    files.forEach(file => {
        const result = discoverSubprocessLaunches(fs.readFileSync(path.join(projectRoot, file), 'utf8'), file);

        if (result.parseError) {
            parseFailures.push({file, error: result.parseError});
            return
        }

        result.launches.forEach(launch => {
            const target = scriptRowsByIdentity.get(launch.target);

            rows.push({
                surface    : SURFACE.subprocessLaunch,
                identity   : launch.identity,
                source     : launch.source,
                disposition: null,
                rationale  : null,
                evidence   : {
                    callee              : launch.callee,
                    target              : launch.target,
                    suggestedDisposition: target?.disposition ?? null,
                    suggestedRationale  : target?.disposition ? `follows ${launch.target}` : null
                }
            })
        })
    });

    return {rows: rows.sort(compareRows), parseFailures}
}

/**
 * @summary Collects the source-owned durable-plane opener rows. In-server modules are Cloud by
 * construction; `ai/scripts` rows follow their script custody; every remaining locus requires an
 * explicit registry decision rather than a directory-shaped guess.
 * @param {Object} options
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Map<String, Object>} options.scriptRowsByIdentity
 * @returns {Object[]}
 */
export function collectPlaneOpeners({projectRoot = PROJECT_ROOT, scriptRowsByIdentity}) {
    const openers = censusPlaneOpeners({projectRoot}), rows = [];

    for (const [runtimeClass, files] of [
        ['host-side', openers.hostSide],
        ['in-server', openers.inServer],
        ['unclassified', openers.unclassified]
    ]) {
        files.forEach(file => {
            const script = scriptRowsByIdentity.get(file),
                  // This surface classifies the OPENING CONCERN, not the whole file. An Edge script
                  // that currently opens SQLite therefore has an Edge script-module row and a Cloud
                  // opener row: the mismatch is the severance work, not a contradiction to hide.
                  disposition = 'cloud',
                  rationale   = 'durable-plane access is Container-Cloud-owned by C′ invariant 5';

            rows.push({
                surface : SURFACE.planeOpener,
                identity: file,
                source  : file,
                disposition,
                rationale,
                evidence: {runtimeClass, scriptDisposition: script?.disposition ?? null}
            })
        })
    }

    return rows.sort(compareRows)
}

/**
 * @summary Collects tracked AiConfig bases/templates plus virtual operator-overlay identities.
 * The overlay rows name custody only; no overlay is imported or inspected.
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @returns {Object[]}
 */
export function collectConfigAuthorities({projectRoot = PROJECT_ROOT} = {}) {
    const tracked = listTrackedFiles({projectRoot, pathspecs: ['ai']}).filter(file =>
        /^ai\/(?:config(?:Base|\.template)|mcp\/server\/[^/]+\/config(?:Base|\.template))\.mjs$/.test(file)
    );

    const overlays = tracked
        .filter(file => file.endsWith('config.template.mjs'))
        .map(file => file.replace('config.template.mjs', 'config.mjs'));

    return [...new Set([...tracked, ...overlays])].sort().map(file => {
        const match = /^ai\/mcp\/server\/([^/]+)\//.exec(file), server = match?.[1] ?? null;

        let disposition = null, rationale = null;

        if (['github-workflow', 'gitlab-workflow', 'neural-link'].includes(server)) {
            disposition = 'edge';
            rationale   = `${server} is a Host-Edge service`
        } else if (['knowledge-base', 'memory-core'].includes(server)) {
            disposition = 'cloud';
            rationale   = `${server} owns durable Cloud state`
        }

        return {
            surface : SURFACE.configAuthority,
            identity: file,
            source  : file.endsWith('/config.mjs') || file === 'ai/config.mjs'
                ? 'ADR 0019 operator-overlay class (gitignored)'
                : file,
            disposition,
            rationale,
            evidence: {server, tracked: tracked.includes(file)}
        }
    })
}

/**
 * @summary Returns the stable identity for one directed package-boundary import edge.
 *
 * Line numbers are deliberately evidence, not identity: inserting an unrelated line above an
 * import must not manufacture missing+stale registry residue. The ordinal discriminates duplicate
 * equal edges inside one source file while preserving stability across unrelated line movement.
 * @param {Object} edge
 * @returns {String}
 */
export function consumerEdgeIdentity({direction, sourcePath, kind, specifier, targetPath, ordinal}) {
    return [direction, sourcePath, kind, specifier, targetPath, ordinal].join('::')
}

/**
 * @summary Materializes registry-owned source classes that are already AgentOS by an independent
 * project/custody authority even though their physical path sits outside `ai/**`.
 *
 * This is intentionally source-class authority, not a broad ignore list. The canonical example is
 * Playwright's `unit-brain` project: registering each of its internal imports as an Engine→AgentOS
 * crossing would create thousands of rows for a population whose owner is already explicit.
 * Ambiguous app/e2e/hook sources stay in the edge-exact population.
 *
 * @param {Object} registry
 * @param {String[]} trackedFiles Repository-relative tracked JS files.
 * @returns {Object}
 */
export function reconcileConsumerSourceClasses(registry, trackedFiles = []) {
    const authority = Array.isArray(registry?.consumerSourceClasses) ? registry.consumerSourceClasses : [],
          errors    = [],
          prefixes  = new Set(),
          rows      = [];

    if (!Array.isArray(registry?.consumerSourceClasses)) {
        errors.push({kind: 'invalid-consumer-source-class-registry', key: 'consumerSourceClasses'})
    }

    authority.forEach(entry => {
        const {identity, pathPrefix} = entry;

        if (typeof identity !== 'string' || !identity.trim()) {
            errors.push({kind: 'missing-consumer-source-class-identity', key: 'consumerSourceClasses'});
            return
        }
        if (typeof pathPrefix !== 'string' || !pathPrefix.trim() || pathPrefix === '/' || pathPrefix === '.') {
            errors.push({kind: 'invalid-consumer-source-class-prefix', key: identity});
            return
        }
        if (prefixes.has(pathPrefix)) {
            errors.push({kind: 'duplicate-consumer-source-class-prefix', key: pathPrefix});
            return
        }

        prefixes.add(pathPrefix);

        if (!PRECLASSIFIED_CONSUMER_DISPOSITIONS.has(entry.disposition)) {
            errors.push({kind: 'invalid-consumer-source-class-disposition', key: identity})
        }
        if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 12) {
            errors.push({kind: 'missing-consumer-source-class-rationale', key: identity})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) {
            errors.push({kind: 'missing-consumer-source-class-source', key: identity})
        }
        if (!VALID_SUCCESSOR_PHASES.has(entry.successorPhase)) {
            errors.push({kind: 'invalid-consumer-source-class-successor-phase', key: identity})
        }

        const files = trackedFiles.filter(file => normalizePath(file).startsWith(pathPrefix)).sort();

        if (files.length === 0) {
            errors.push({kind: 'stale-consumer-source-class', key: identity})
        }

        rows.push({
            surface        : SURFACE.consumerSourceClass,
            identity,
            source         : entry.source,
            authoritySource: entry.source,
            disposition    : entry.disposition,
            rationale      : entry.rationale,
            successorPhase : entry.successorPhase,
            evidence       : {fileCount: files.length, pathPrefix, files, override: true}
        })
    });

    const orderedPrefixes = [...prefixes].sort();

    for (let i = 0; i < orderedPrefixes.length; i++) {
        for (let j = i + 1; j < orderedPrefixes.length; j++) {
            if (orderedPrefixes[j].startsWith(orderedPrefixes[i])) {
                errors.push({
                    kind: 'overlapping-consumer-source-class-prefix',
                    key : `${orderedPrefixes[i]}::${orderedPrefixes[j]}`
                })
            }
        }
    }

    return {
        prefixes: orderedPrefixes,
        rows    : rows.sort(compareRows),
        errors  : errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`)),
        ok      : errors.length === 0
    }
}

/**
 * @summary Derives every tracked import crossing between the moving AgentOS `ai/**` population and
 * source outside that region.
 *
 * The shared `collectModuleFacts()` AST parser supplies static imports, named/export-all re-exports,
 * and literal dynamic imports. This function only classifies resolved tracked-tree edges; it does
 * not parse syntax a second time and it never treats a grep match as an import.
 *
 * Inbound edges scan every tracked JS module outside `ai/**`. Outbound edges are narrower by
 * authority: their source must be inside the union of the reconciled Host-Edge launch closures, so
 * an unrelated Cloud module importing Engine source cannot be mislabeled as an Edge cut blocker.
 *
 * @param {Object} [options]
 * @param {String[]} [options.edgeReachedFiles=[]] Absolute or repository-relative files reached by
 *     reconciled Edge launch roots.
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Function} [options.readFile] `(absolutePath) => String|null`.
 * @param {Function} [options.resolve] `(specifier, fromFile) => absolutePath|null`.
 * @param {String[]} [options.preclassifiedSourcePrefixes=[]] Registry-reconciled source classes
 *     already owned by AgentOS and therefore not outside consumers.
 * @param {String[]} [options.trackedFiles] Injectable tracked source population.
 * @returns {{rows: Object[], errors: Object[]}}
 */
export function collectConsumerEdges({
    edgeReachedFiles = [],
    preclassifiedSourcePrefixes = [],
    projectRoot = PROJECT_ROOT,
    readFile = absolutePath => fs.readFileSync(absolutePath, 'utf8'),
    resolve = (specifier, fromFile) => resolveTrackedConfigSpecifier(specifier, fromFile),
    trackedFiles = listTrackedFiles({projectRoot})
        .filter(file => /\.(?:mjs|js)$/.test(file))
} = {}) {
    const
        errors          = [],
        rows            = [],
        edgeSourceSet   = new Set(edgeReachedFiles.map(file => path.resolve(projectRoot, file))),
        isAgentOsPath   = file => file === 'ai' || file.startsWith('ai/'),
        isInsideProject = file => file && file !== '..' && !file.startsWith('../') && !path.isAbsolute(file);

    trackedFiles.map(normalizePath).sort().forEach(sourcePath => {
        if (preclassifiedSourcePrefixes.some(prefix => sourcePath.startsWith(prefix))) return;

        const absoluteSource = path.resolve(projectRoot, sourcePath);

        let source;

        try {
            source = readFile(absoluteSource)
        } catch (error) {
            errors.push({kind: 'consumer-edge-read-failure', key: sourcePath, error: error.message});
            return
        }

        if (source === null || source === undefined) {
            errors.push({kind: 'consumer-edge-read-failure', key: sourcePath, error: 'source unavailable'});
            return
        }

        const facts = collectModuleFacts(source);

        if (!facts.parsed) {
            errors.push({kind: 'consumer-edge-parse-failure', key: sourcePath});
            return
        }

        const ordinals = new Map();

        facts.importEdges.forEach(edge => {
            const specifier = normalizePath(edge.specifier);

            if (!specifier.startsWith('.') && !specifier.startsWith('/')) return;

            const absoluteTarget = resolve(edge.specifier, absoluteSource);

            if (!absoluteTarget) return;

            const targetPath = normalizePath(path.relative(projectRoot, absoluteTarget));

            if (!isInsideProject(targetPath)) return;

            const
                sourceIsAgentOs = isAgentOsPath(sourcePath),
                targetIsAgentOs = isAgentOsPath(targetPath);

            let direction = null;

            if (!sourceIsAgentOs && targetIsAgentOs) {
                direction = CONSUMER_EDGE_DIRECTION.outsideToAgentOs
            } else if (sourceIsAgentOs && !targetIsAgentOs && edgeSourceSet.has(absoluteSource)) {
                direction = CONSUMER_EDGE_DIRECTION.agentOsToOutside
            }

            if (!direction) return;

            const ordinalKey = [edge.kind, specifier, targetPath].join('::'),
                  ordinal    = (ordinals.get(ordinalKey) ?? 0) + 1;

            ordinals.set(ordinalKey, ordinal);

            const identity = consumerEdgeIdentity({
                direction,
                sourcePath,
                kind: edge.kind,
                specifier,
                targetPath,
                ordinal
            });

            rows.push({
                surface    : SURFACE.consumerEdge,
                identity,
                source     : `${sourcePath}:${edge.line ?? '?'}`,
                disposition: null,
                rationale  : null,
                evidence   : {
                    direction,
                    importKind: edge.kind,
                    line      : edge.line ?? null,
                    ordinal,
                    sourcePath,
                    specifier,
                    targetPath
                }
            })
        })
    });

    return {
        rows  : rows.sort(compareRows),
        errors: errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`))
    }
}

/**
 * @summary Reconciles derived consumer crossings against direction-specific cut dispositions in
 * the source-owned extraction registry.
 * @param {Object[]} derivedRows
 * @param {Object} registry
 * @param {Object[]} [derivationErrors=[]]
 * @returns {Object}
 */
export function reconcileConsumerEdges(derivedRows, registry, derivationErrors = []) {
    const
        errors       = [...derivationErrors],
        authorityMap = new Map(),
        derivedKeys  = new Set(derivedRows.map(row => row.identity)),
        authority    = (Array.isArray(registry?.consumerEdges) ? registry.consumerEdges : [])
            .flatMap(entry => {
                const identities = Array.isArray(entry.identities) ? entry.identities : [entry.identity];

                return identities.map(identity => ({
                    ...Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'identities')),
                    identity
                }))
            });

    if (!Array.isArray(registry?.consumerEdges)) {
        errors.push({kind: 'invalid-consumer-edge-registry', key: 'consumerEdges'})
    }

    authority.forEach(entry => {
        const {identity} = entry;

        if (typeof identity !== 'string' || !identity.trim()) {
            errors.push({kind: 'missing-consumer-edge-identity', key: 'consumerEdges'});
            return
        }

        if (authorityMap.has(identity)) {
            errors.push({kind: 'duplicate-consumer-edge-authority', key: identity});
            return
        }

        authorityMap.set(identity, entry);

        if (!Object.values(CONSUMER_EDGE_DIRECTION).includes(entry.direction)) {
            errors.push({kind: 'invalid-consumer-edge-direction', key: identity})
        }
        if (!CONSUMER_EDGE_DISPOSITIONS[entry.direction]?.has(entry.disposition)) {
            errors.push({kind: 'invalid-consumer-edge-disposition', key: identity})
        }
        if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 12) {
            errors.push({kind: 'missing-consumer-edge-rationale', key: identity})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) {
            errors.push({kind: 'missing-consumer-edge-source', key: identity})
        }
        if (!VALID_SUCCESSOR_PHASES.has(entry.successorPhase)) {
            errors.push({kind: 'invalid-consumer-edge-successor-phase', key: identity})
        }
        if (!identity.startsWith(`${entry.direction}::`)) {
            errors.push({kind: 'consumer-edge-direction-identity-mismatch', key: identity})
        }
    });

    const rows = derivedRows.map(row => {
        const entry = authorityMap.get(row.identity);

        if (!entry) return row;

        const derivedDirection = row.evidence?.direction;

        if (entry.direction !== derivedDirection) {
            errors.push({kind: 'consumer-edge-direction-mismatch', key: row.identity})
        }

        return {
            ...row,
            authoritySource: entry.source,
            disposition    : entry.disposition,
            rationale      : entry.rationale,
            successorPhase : entry.successorPhase,
            evidence       : {...row.evidence, override: true}
        }
    });

    const
        diskMinusAuthority = rows.filter(row => !authorityMap.has(row.identity)).map(row => row.identity).sort(),
        authorityMinusDisk = [...authorityMap.keys()].filter(identity => !derivedKeys.has(identity)).sort();

    diskMinusAuthority.forEach(key => errors.push({kind: 'missing-consumer-edge-authority', key}));
    authorityMinusDisk.forEach(key => errors.push({kind: 'stale-consumer-edge-authority', key}));

    return {
        rows   : rows.sort(compareRows),
        residue: {diskMinusAuthority, authorityMinusDisk},
        errors : errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`)),
        ok     : diskMinusAuthority.length === 0 && authorityMinusDisk.length === 0 && errors.length === 0
    }
}

/**
 * @summary Enforces the absolute Engine→AgentOS package-direction covenant against both dependency
 * maps that could reinstall the Brain for Engine contributors.
 * @param {Object} options
 * @param {String[]} options.forbiddenPackages Exact AgentOS package identities from the registry.
 * @param {Object} options.manifest Parsed Engine package manifest.
 * @returns {Object}
 */
export function inspectEngineAgentOsDependencies({forbiddenPackages = [], manifest = {}} = {}) {
    const errors = [], violations = [];

    if (!Array.isArray(forbiddenPackages) || forbiddenPackages.length === 0) {
        errors.push({kind: 'empty-engine-agentos-package-covenant', key: 'engineDependencyCovenant.forbiddenPackages'})
    }

    const uniquePackages = [...new Set(forbiddenPackages.filter(name => typeof name === 'string' && name.trim()))].sort();

    if (uniquePackages.length !== forbiddenPackages.length) {
        errors.push({kind: 'invalid-engine-agentos-package-covenant', key: 'engineDependencyCovenant.forbiddenPackages'})
    }

    ['dependencies', 'devDependencies'].forEach(section => {
        const declarations = manifest?.[section] ?? {};

        uniquePackages.filter(name => Object.hasOwn(declarations, name)).forEach(name => {
            const violation = {section, name, version: declarations[name]};

            violations.push(violation);
            errors.push({
                kind : 'engine-agentos-package-edge',
                key  : `${section}::${name}`,
                error: String(declarations[name])
            })
        })
    });

    return {
        forbiddenPackages: uniquePackages,
        violations,
        errors,
        ok               : errors.length === 0
    }
}

/**
 * @summary Applies explicit overrides, validates registry shape, and computes both residue
 * directions. Overrides are conscious judgments over derived rows; stale overrides are authority
 * without disk, while rows with no derived or explicit disposition are disk without authority.
 * @param {Object[]} derivedRows
 * @param {Object} registry
 * @param {Object[]} [parseFailures=[]]
 * @returns {Object}
 */
export function reconcileInventory(derivedRows, registry, parseFailures = []) {
    const
        errors      = [],
        overrideMap = new Map(),
        rowKeys     = new Set(derivedRows.map(row => rowKey(row.surface, row.identity))),
        overrides   = (Array.isArray(registry?.overrides) ? registry.overrides : []).flatMap(entry => {
            const identities = Array.isArray(entry.identities) ? entry.identities : [entry.identity];

            return identities.map(identity => {
                const shared = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'identities'));

                return {...shared, identity}
            })
        }),
        custody     = Array.isArray(registry?.custody) ? registry.custody : [];

    for (const entry of overrides) {
        const key = rowKey(entry.surface, entry.identity);

        if (overrideMap.has(key)) {
            errors.push({kind: 'duplicate-authority', key});
            continue
        }

        if (!isValidDisposition(entry.surface, entry.disposition)) errors.push({kind: 'invalid-disposition', key});
        if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 12) {
            errors.push({kind: 'missing-rationale', key})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) errors.push({kind: 'missing-source', key});

        if (entry.surface === SURFACE.learningArtifact) {
            if (!VALID_LEARNING_DISPOSITIONS.has(entry.disposition)) {
                errors.push({kind: 'invalid-learning-artifact-disposition', key})
            }
            if (entry.disposition === 'move' && entry.targetRepository !== AGENTOS_TARGET_REPOSITORY) {
                errors.push({kind: 'missing-learning-artifact-target', key})
            }
            if (entry.disposition === 'stays-engine' && entry.targetRepository) {
                errors.push({kind: 'staying-learning-artifact-targeted', key})
            }
        }

        if (entry.surface === SURFACE.packageDependency) {
            const targets = entry.manifestTargets;

            // The physical shared source package reserves `shared` custody for its inventory-proven
            // module population. A dependency may MATERIALIZE into the shared manifest, but letting its source
            // declaration own shared custody would keep that package's empty-population retirement
            // trigger unreachable.
            if (entry.disposition === 'shared') {
                errors.push({kind: 'shared-disposition-on-dependency', key})
            }

            if (!Array.isArray(targets) || (targets.length === 0 && entry.disposition !== 'retire')) {
                errors.push({kind: 'missing-manifest-targets', key})
            } else {
                const uniqueTargets = new Set(targets);

                if (uniqueTargets.size !== targets.length) errors.push({kind: 'duplicate-manifest-target', key});
                targets.filter(target => !VALID_MANIFEST_TARGETS.has(target)).forEach(target => {
                    errors.push({kind: 'invalid-manifest-target', key: `${key}::${target}`})
                });

                const dispositionTarget = {
                    cloud         : 'cloud',
                    edge          : 'edge',
                    'stays-engine': 'engine'
                }[entry.disposition];

                if (dispositionTarget && !uniqueTargets.has(dispositionTarget)) {
                    errors.push({kind: 'disposition-target-mismatch', key})
                }
                if (entry.disposition === 'retire' && uniqueTargets.size > 0) {
                    errors.push({kind: 'retired-dependency-targeted', key})
                }
            }
        }

        overrideMap.set(key, entry)
    }

    const rows = derivedRows.map(row => {
        const override = overrideMap.get(rowKey(row.surface, row.identity));

        if (override && [
            SURFACE.launchRoot,
            SURFACE.packageDependency,
            SURFACE.rootScript,
            SURFACE.subprocessLaunch,
            SURFACE.workflowReference
        ].includes(row.surface)
            && row.evidence?.suggestedDisposition
            && override.disposition !== row.evidence.suggestedDisposition
            && override.allowDivergence !== true) {
            errors.push({
                kind : 'authority-conflict',
                key  : rowKey(row.surface, row.identity),
                error: `registry says ${override.disposition}; target custody says ${row.evidence.suggestedDisposition}`
            })
        }

        return override ? {
            ...row,
            disposition    : override.disposition,
            rationale      : override.rationale,
            authoritySource: override.source,
            ...(override.targetRepository ? {targetRepository: override.targetRepository} : {}),
            ...(row.surface === SURFACE.packageDependency
                ? {manifestTargets: [...new Set(override.manifestTargets ?? [])].sort()}
                : {}),
            evidence       : {...row.evidence, override: true}
        } : row
    });

    custody.forEach(entry => {
        const key = rowKey(SURFACE.custodyBoundary, entry.identity);

        if (rowKeys.has(key)) errors.push({kind: 'duplicate-authority', key});
        if (!VALID_DISPOSITIONS.has(entry.disposition)) errors.push({kind: 'invalid-disposition', key});
        if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 12) {
            errors.push({kind: 'missing-rationale', key})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) errors.push({kind: 'missing-source', key});

        rows.push({surface: SURFACE.custodyBoundary, ...entry, evidence: {registry: true}});
        rowKeys.add(key)
    });

    const
        diskMinusAuthority = rows.filter(row => !isValidDisposition(row.surface, row.disposition)
            || typeof row.rationale !== 'string' || !row.rationale.trim())
            .map(row => rowKey(row.surface, row.identity)).sort(),
        authorityMinusDisk = [...overrideMap.keys()].filter(key => !rowKeys.has(key)).sort();

    authorityMinusDisk.forEach(key => errors.push({kind: 'stale-authority', key}));
    parseFailures.forEach(({file, error}) => errors.push({kind: 'parse-failure', key: file, error}));

    return {
        rows   : rows.sort(compareRows),
        residue: {diskMinusAuthority, authorityMinusDisk},
        errors : errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`)),
        ok     : diskMinusAuthority.length === 0 && authorityMinusDisk.length === 0 && errors.length === 0
    }
}

/**
 * @summary Derives the unique Host-Edge launch-target population governed by runtime-probe
 * eligibility. Custody remains authoritative in the reconciled script rows; launch-root shape
 * merely selects which owned modules the paired proof may need to evaluate.
 * @param {Object} [options]
 * @param {Object[]} options.launchRootRows Reconciled launch-root inventory rows. This is
 * authoritative at schema v3 and includes task roots outside the resident `ai/scripts` population.
 * @returns {String[]}
 */
export function deriveRuntimeProbeTargets({launchRootRows} = {}) {
    if (!Array.isArray(launchRootRows) || launchRootRows.length === 0) {
        throw new Error('deriveRuntimeProbeTargets: schema v3 requires non-empty reconciled launch-root rows')
    }

    return launchRootRows
        .filter(row => row.surface === SURFACE.launchRoot && row.disposition === 'edge')
        .map(row => row.identity)
        .sort()
}

/**
 * @summary Reconciles exact Edge launch targets against identity-scoped runtime-probe judgments.
 * No status is inferred: missing and stale identities remain distinct residue, while invalid or
 * explanation-free authority stays visible as typed errors.
 * @param {String[]} targets Derived unique Edge launch-target identities.
 * @param {Object} registry Source-owned extraction registry.
 * @returns {Object}
 */
export function reconcileRuntimeProbeEligibility(targets, registry) {
    const
        governed  = [...new Set(targets)].sort(),
        authority = Array.isArray(registry?.runtimeProbeEligibility)
            ? registry.runtimeProbeEligibility
            : [],
        errors       = [],
        authorityMap = new Map(),
        targetSet    = new Set(governed);

    if (!Array.isArray(registry?.runtimeProbeEligibility)) {
        errors.push({kind: 'invalid-runtime-probe-registry', key: 'runtimeProbeEligibility'})
    }

    authority.forEach(entry => {
        const identity = entry?.identity;

        if (typeof identity !== 'string' || !identity.trim()) {
            errors.push({kind: 'missing-runtime-probe-identity', key: 'runtimeProbeEligibility'});
            return
        }

        if (authorityMap.has(identity)) {
            errors.push({kind: 'duplicate-runtime-probe-eligibility', key: identity});
            return
        }

        authorityMap.set(identity, entry);

        if (!VALID_PROBE_ELIGIBILITY.has(entry.eligibility)) {
            errors.push({kind: 'invalid-runtime-probe-eligibility', key: identity})
        }
        if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) {
            errors.push({kind: 'missing-runtime-probe-reason', key: identity})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) {
            errors.push({kind: 'missing-runtime-probe-source', key: identity})
        }
    });

    const
        targetsWithoutAuthority = governed.filter(identity => !authorityMap.has(identity)),
        authorityWithoutTargets = [...authorityMap.keys()].filter(identity => !targetSet.has(identity)).sort(),
        rows                    = governed.filter(identity => authorityMap.has(identity)).map(identity => {
            const entry = authorityMap.get(identity);

            return {
                identity,
                eligibility: VALID_PROBE_ELIGIBILITY.has(entry.eligibility) ? entry.eligibility : null,
                reason     : typeof entry.reason === 'string' ? entry.reason : null,
                source     : typeof entry.source === 'string' ? entry.source : null
            }
        });

    if (governed.length === 0) {
        errors.push({kind: 'empty-runtime-probe-population', key: 'runtimeProbeEligibility'})
    }
    targetsWithoutAuthority.forEach(key => errors.push({kind: 'missing-runtime-probe-eligibility', key}));
    authorityWithoutTargets.forEach(key => errors.push({kind: 'stale-runtime-probe-eligibility', key}));

    const byEligibility = {
        eligible  : rows.filter(row => row.eligibility === RUNTIME_PROBE_ELIGIBILITY.eligible).length,
        ineligible: rows.filter(row => row.eligibility === RUNTIME_PROBE_ELIGIBILITY.ineligible).length
    };

    return {
        total  : governed.length,
        byEligibility,
        rows,
        residue: {targetsWithoutAuthority, authorityWithoutTargets},
        errors : errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`)),
        ok     : errors.length === 0
    }
}

/**
 * @summary Stable row comparator used by human and JSON outputs.
 * @param {Object} a
 * @param {Object} b
 * @returns {Number}
 */
export function compareRows(a, b) {
    return rowKey(a.surface, a.identity).localeCompare(rowKey(b.surface, b.identity))
}

/**
 * @summary Hashes only the source-owned disposition identity needed by the cut.
 *
 * The extraction inventory remains the population authority. The cut receipt carries one digest,
 * not a copied file list; sorting here makes source discovery order irrelevant while retaining the
 * exact identity substitution property a count-only receipt loses.
 *
 * @param {Object[]} [rows=[]] Reconciled inventory rows.
 * @returns {String} `sha256:<hex>` digest.
 */
export function inventoryDispositionDigest(rows = []) {
    const projection = rows.map(row => ({
        surface         : row.surface,
        identity        : row.identity,
        disposition     : row.disposition ?? null,
        targetRepository: row.targetRepository ?? null,
        manifestTargets : [...new Set(row.manifestTargets ?? [])].sort(),
        successorPhase  : row.successorPhase ?? null
    })).sort(compareRows);

    return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`
}

/**
 * @summary Hashes the exact learning identity/disposition partition consumed from the external census.
 * @param {Object[]} [rows=[]] Inventory rows containing the reconciled learning population.
 * @returns {String} Stable SHA-256 digest.
 */
export function learningDispositionDigest(rows = []) {
    const projection = rows.filter(row => row.surface === SURFACE.learningArtifact).map(row => ({
        identity   : row.identity,
        disposition: row.disposition ?? null
    })).sort((a, b) => a.identity.localeCompare(b.identity));

    return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`
}

/**
 * @summary Recomputes the canonical digest stored inside the immutable learning census artifact.
 * @param {Object} [artifact={}] Parsed census artifact.
 * @returns {String} Lowercase SHA-256 digest without a prefix.
 */
export function canonicalLearningCensusSha256(artifact = {}) {
    const projection = {...artifact};

    delete projection.canonicalSha256;

    return createHash('sha256').update(JSON.stringify(projection)).digest('hex')
}

/**
 * @summary Hashes the semantic plane-proof receipt while excluding disposable fixture paths.
 * @param {Object} [planeProof={}] Existing paired plane-proof receipt.
 * @returns {String} `sha256:<hex>` digest.
 */
export function planeProofReceiptDigest(planeProof = {}) {
    const
        byIdentity = (a, b) => {
            const left = JSON.stringify(a), right = JSON.stringify(b);

            return left < right ? -1 : left > right ? 1 : 0
        },
        binding    = planeProof.meta?.sourceBinding ?? {};

    const projection = {
        head         : planeProof.meta?.head ?? null,
        sourceBinding: {
            bound     : binding.bound === true,
            sha       : binding.sha ?? null,
            dirtyPaths: [...(binding.dirtyPaths ?? [])].sort()
        },
        cloudOnlyPackages: [...(planeProof.meta?.cloudOnlyPackages ?? [])].sort(),
        instrumentErrors : [...(planeProof.instrumentErrors ?? [])].sort(byIdentity),
        topologyFindings : [...(planeProof.topologyFindings ?? [])].sort(byIdentity),
        exitCode         : planeProof.exitCode ?? null
    };

    return `sha256:${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`
}

/**
 * @summary Invokes the existing paired plane-proof producer and returns its machine receipt.
 *
 * The cut CLI owns the observation: it never accepts a caller-authored green proof object. A red
 * proof intentionally exits non-zero but still emits JSON, so that receipt is parsed and carried to
 * the manifest rather than being mistaken for an instrument crash.
 *
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {Function} [options.execFile=execFileSync] Injectable child-process seam.
 * @returns {Object} Plane-boundary proof receipt.
 */
export function runPlaneBoundaryProof({projectRoot = PROJECT_ROOT, execFile = execFileSync} = {}) {
    const args = [
        path.join(projectRoot, 'ai/scripts/diagnostics/agentOsPlaneBoundaryProof.mjs'),
        '--json'
    ];

    let output;

    try {
        output = execFile(process.execPath, args, {
            cwd      : projectRoot,
            encoding : 'utf8',
            maxBuffer: 64 * 1024 * 1024
        })
    } catch (error) {
        output = error.stdout?.toString?.() ?? '';

        if (!output.trim()) throw error
    }

    const receipt = JSON.parse(output);

    if (!receipt?.meta || !Array.isArray(receipt.instrumentErrors) ||
        !Array.isArray(receipt.topologyFindings) || !Number.isInteger(receipt.exitCode)) {
        throw new TypeError('agentOsPlaneBoundaryProof emitted an invalid machine receipt')
    }

    return receipt
}

/**
 * @summary Builds the minimal deterministic Wave-3 cut receipt from existing authorities.
 *
 * This function deliberately does not discover GitHub state, enumerate A2A lanes, copy the tracker
 * table, or introduce a registry. Callers supply immutable coordinates read once at the freeze;
 * the existing extraction inventory and plane proof remain the only population/topology tools.
 *
 * @param {Object} config
 * @param {Object} config.inventory Existing `agentos-extraction-inventory.v6` receipt.
 * @param {Object} config.planeProof Existing paired plane-proof receipt.
 * @param {String} config.sourceSha Frozen `neomjs/neo` SHA.
 * @param {String} config.targetSha Current `neo-agent-brain/dev` SHA.
 * @param {Object} config.skillsPackage Published npm + consumer coordinate.
 * @param {String} config.skillsPackage.version Published package version.
 * @param {String} config.skillsPackage.sourceSha Canonical package source SHA.
 * @param {String} config.skillsPackage.consumerSha Consumer PR/head SHA.
 * @param {String} config.skillsPackage.materializationRef Clean-consumer materialization receipt.
 * @param {Object} config.skillsPackage.referenceClosure Typed packaged-reference closure receipt.
 * @param {String} config.skillsPackage.referenceClosure.ref Immutable owner-produced receipt coordinate.
 * @param {'red'|'green'} config.skillsPackage.referenceClosure.state Observed closure state at the cut.
 * @param {Object} config.enforcement One-time required-context read-back.
 * @param {String} config.enforcement.ref Public coordinate of the read-back observation.
 * @param {String} config.enforcement.rulesetDigest `sha256:<hex>` over the observed branch ruleset.
 * @param {String} config.enforcement.requiredContext Surviving required context.
 * @param {Number} config.enforcement.integrationId Check-integration id owning that context.
 * @param {Object} config.learningCensus Immutable Brain-guide / ADR disposition census.
 * @param {String} config.learningCensus.ref Public census comment coordinate.
 * @param {String} config.learningCensus.commitSha Brain commit containing the census artifact.
 * @param {String} config.learningCensus.artifactPath Census path at the pinned Brain commit.
 * @param {Object} config.learningCensus.artifact Parsed immutable census artifact; omitted from output.
 * @param {Object} config.trackerSnapshot Frozen Wave-2.5 snapshot references.
 * @param {String} config.trackerSnapshot.baselineRef Immutable baseline receipt reference.
 * @param {Number} config.trackerSnapshot.baselineCount Frozen baseline population.
 * @param {String} config.trackerSnapshot.deltaRef Immutable sanctioned-delta receipt reference.
 * @param {String} config.trackerSnapshot.sourceDispositionDigest Exact source number/disposition digest.
 * @param {Number} config.trackerSnapshot.deltaCount Sanctioned post-freeze source rows.
 * @param {Number} config.trackerSnapshot.sourceTotal Baseline plus sanctioned deltas.
 * @param {String} config.trackerSnapshot.transferLedgerCommitSha Commit containing the transfer pre-state.
 * @param {String} config.trackerSnapshot.transferLedgerPath Transfer pre-state artifact path.
 * @param {String} config.trackerSnapshot.transferLedgerSha256 Raw transfer pre-state artifact digest.
 * @param {Number} config.trackerSnapshot.brainTransferTotal Brain transfer ledger population.
 * @param {Number} config.trackerSnapshot.openNativeTransferCount Open native-transfer rows.
 * @param {Number} config.trackerSnapshot.sourceOnlyClosedCount Closed rows retained in Neo.
 * @param {Object} config.custodyCorrection Merged custody-correction coordinate.
 * @param {String} config.custodyCorrection.sha Merged custody-correction SHA.
 * @param {Object} config.rollback Wave-0 rollback pair.
 * @param {String} config.rollback.imageSha Image revision.
 * @param {String} config.rollback.bundle Named verified bundle.
 * @returns {Object} Versioned receipt with `ok` and named `errors`.
 */
export function buildWave3CutManifest({
    inventory = {},
    planeProof = {},
    sourceSha,
    targetSha,
    skillsPackage = {},
    enforcement = {},
    learningCensus = {},
    trackerSnapshot = {},
    custodyCorrection = {},
    rollback = {}
} = {}) {
    const
        errors         = [],
        hasProofArrays = Array.isArray(planeProof.instrumentErrors) &&
            Array.isArray(planeProof.topologyFindings),
        instrumentErrors     = hasProofArrays ? planeProof.instrumentErrors : [],
        topologyFindings     = hasProofArrays ? planeProof.topologyFindings : [],
        relocationBlockers   = topologyFindings.filter(row => row.preRelocationBlocker === true),
        inventoryResidue     = inventory.residue ?? {},
        inventoryDiskResidue = inventoryResidue.diskMinusAuthority ?? [],
        inventoryAuthResidue = inventoryResidue.authorityMinusDisk ?? [],
        sourceBinding        = planeProof.meta?.sourceBinding ?? null,
        learningArtifact     = learningCensus.artifact ?? {},
        artifactRows         = Array.isArray(learningArtifact.rows) ? learningArtifact.rows : [],
        artifactPaths        = artifactRows.map(row => row.sourcePath),
        artifactRowsValid    = artifactRows.length > 0 && artifactRows.every(row =>
            typeof row.sourcePath === 'string' && row.sourcePath.startsWith('learn/agentos/') &&
            GIT_SHA_RE.test(row.sourceBlobOid ?? '') &&
            ['move-to-brain', 'stay-engine'].includes(row.disposition)
        ) && new Set(artifactPaths).size === artifactPaths.length,
        artifactInventoryRows = artifactRows.map(row => ({
            surface    : SURFACE.learningArtifact,
            identity   : row.sourcePath,
            disposition: row.disposition === 'move-to-brain' ? 'move' :
                row.disposition === 'stay-engine' ? 'stays-engine' : null
        })),
        artifactDigest       = learningDispositionDigest(artifactInventoryRows),
        artifactCanonicalSha = canonicalLearningCensusSha256(learningArtifact),
        learningRows         = (inventory.rows ?? []).filter(row => row.surface === SURFACE.learningArtifact),
        learningCounts       = {
            rowCount    : learningRows.length,
            adrCount    : learningRows.filter(row => row.identity.startsWith('learn/agentos/decisions/')).length,
            movingCount : learningRows.filter(row => row.disposition === 'move').length,
            stayingCount: learningRows.filter(row => row.disposition === 'stays-engine').length
        },
        learningDigest       = learningDispositionDigest(inventory.rows ?? []),
        expectedLearningCounts = [
            learningArtifact.counts?.total,
            learningArtifact.counts?.decisions,
            learningArtifact.counts?.moveToBrain,
            learningArtifact.counts?.stayEngine
        ],
        trackerCounts        = [
            trackerSnapshot.baselineCount,
            trackerSnapshot.deltaCount,
            trackerSnapshot.sourceTotal,
            trackerSnapshot.brainTransferTotal,
            trackerSnapshot.openNativeTransferCount,
            trackerSnapshot.sourceOnlyClosedCount
        ];

    if (!GIT_SHA_RE.test(sourceSha ?? '')) errors.push('source-sha-invalid');
    if (!GIT_SHA_RE.test(targetSha ?? '')) errors.push('target-sha-invalid');
    if (inventory.ok !== true) errors.push('inventory-not-green');
    if (!Array.isArray(inventory.rows) || inventory.rows.length === 0) errors.push('inventory-population-missing');
    if (inventory.git?.clean !== true || inventory.git?.sha !== sourceSha) errors.push('inventory-source-unbound');
    if (inventoryDiskResidue.length || inventoryAuthResidue.length) errors.push('inventory-residue');
    if (!hasProofArrays || !Number.isInteger(planeProof.exitCode)) errors.push('plane-proof-receipt-invalid');
    if (planeProof.exitCode !== 0) errors.push('plane-proof-not-green');
    if (sourceBinding?.bound !== true || planeProof.meta?.head !== sourceSha) errors.push('plane-proof-source-unbound');
    if (instrumentErrors.length) errors.push('plane-proof-instrument-errors');
    if (relocationBlockers.length) errors.push('plane-proof-relocation-blockers');
    if (!skillsPackage.version || !GIT_SHA_RE.test(skillsPackage.sourceSha ?? '') ||
        !GIT_SHA_RE.test(skillsPackage.consumerSha ?? '') || !skillsPackage.materializationRef ||
        !skillsPackage.referenceClosure?.ref ||
        !VALID_REFERENCE_CLOSURE_STATE.has(skillsPackage.referenceClosure?.state)) {
        errors.push('skills-package-coordinate-missing')
    }
    if (!enforcement.ref || !DIGEST_RE.test(enforcement.rulesetDigest ?? '') ||
        !enforcement.requiredContext || !Number.isInteger(enforcement.integrationId)) {
        errors.push('enforcement-coordinate-missing')
    }
    if (!learningCensus.ref || !GIT_SHA_RE.test(learningCensus.commitSha ?? '') ||
        !learningCensus.artifactPath || learningArtifact.schemaVersion !== 'learn-custody-census.v1' ||
        learningArtifact.sourceRepository !== 'neomjs/neo' ||
        !GIT_SHA_RE.test(learningArtifact.sourceRef ?? '') ||
        !GIT_SHA_RE.test(learningArtifact.sourceSha ?? '') ||
        !GIT_SHA_RE.test(learningArtifact.sourceTreeOid ?? '') ||
        !SHA256_RE.test(learningArtifact.canonicalSha256 ?? '') || !artifactRowsValid) {
        errors.push('learning-census-coordinate-missing')
    } else {
        if (learningArtifact.canonicalSha256 !== artifactCanonicalSha) {
            errors.push('learning-census-canonical-mismatch')
        }
        if (inventory.git?.learningTreeOid !== learningArtifact.sourceTreeOid) {
            errors.push('learning-census-tree-unbound')
        }
        if (artifactDigest !== learningDigest) {
            errors.push('learning-census-disposition-mismatch')
        }
    }
    if (!expectedLearningCounts.every(value => Number.isInteger(value) && value >= 0)) {
        errors.push('learning-census-counts-invalid')
    } else if (learningArtifact.counts.total !==
            learningArtifact.counts.moveToBrain + learningArtifact.counts.stayEngine ||
        learningArtifact.counts.total !== artifactRows.length ||
        learningArtifact.counts.decisions !==
            artifactRows.filter(row => row.sourcePath.startsWith('learn/agentos/decisions/')).length ||
        learningCounts.rowCount !== learningArtifact.counts.total ||
        learningCounts.adrCount !== learningArtifact.counts.decisions ||
        learningCounts.movingCount !== learningArtifact.counts.moveToBrain ||
        learningCounts.stayingCount !== learningArtifact.counts.stayEngine) {
        errors.push('learning-census-mismatch')
    }
    if (!trackerSnapshot.baselineRef || !trackerSnapshot.deltaRef ||
        !DIGEST_RE.test(trackerSnapshot.sourceDispositionDigest ?? '') ||
        !GIT_SHA_RE.test(trackerSnapshot.transferLedgerCommitSha ?? '') ||
        !trackerSnapshot.transferLedgerPath || !SHA256_RE.test(trackerSnapshot.transferLedgerSha256 ?? '')) {
        errors.push('tracker-snapshot-coordinate-missing')
    }
    if (!trackerCounts.every(value => Number.isInteger(value) && value >= 0)) {
        errors.push('tracker-snapshot-counts-invalid')
    } else if (trackerSnapshot.baselineCount + trackerSnapshot.deltaCount !== trackerSnapshot.sourceTotal ||
        trackerSnapshot.openNativeTransferCount + trackerSnapshot.sourceOnlyClosedCount !==
            trackerSnapshot.brainTransferTotal) {
        errors.push('tracker-snapshot-counts-inconsistent')
    }
    if (!GIT_SHA_RE.test(custodyCorrection.sha ?? '')) errors.push('custody-correction-coordinate-missing');
    if (!GIT_SHA_RE.test(rollback.imageSha ?? '') || !rollback.bundle) errors.push('rollback-pair-missing');

    return {
        schemaVersion: WAVE3_CUT_MANIFEST_VERSION,
        source       : {repository: 'neomjs/neo', sha: sourceSha ?? null},
        target       : {repository: 'neomjs/neo-agent-brain', sha: targetSha ?? null},
        inventory    : {
            schemaVersion    : inventory.schemaVersion ?? null,
            rowCount         : Array.isArray(inventory.rows) ? inventory.rows.length : 0,
            dispositionDigest: inventoryDispositionDigest(inventory.rows ?? [])
        },
        planeProof: {
            head                  : planeProof.meta?.head ?? null,
            receiptDigest         : planeProofReceiptDigest(planeProof),
            instrumentErrorCount  : instrumentErrors.length,
            relocationBlockerCount: relocationBlockers.length
        },
        prerequisites: {
            skillsPackage: {
                version           : skillsPackage.version ?? null,
                sourceSha         : skillsPackage.sourceSha ?? null,
                consumerSha       : skillsPackage.consumerSha ?? null,
                materializationRef: skillsPackage.materializationRef ?? null,
                referenceClosure  : {
                    ref  : skillsPackage.referenceClosure?.ref ?? null,
                    state: skillsPackage.referenceClosure?.state ?? null
                }
            },
            enforcement: {
                ref            : enforcement.ref ?? null,
                rulesetDigest  : enforcement.rulesetDigest ?? null,
                requiredContext: enforcement.requiredContext ?? null,
                integrationId  : enforcement.integrationId ?? null
            },
            learningCensus: {
                schemaVersion    : learningArtifact.schemaVersion ?? null,
                ref              : learningCensus.ref ?? null,
                commitSha        : learningCensus.commitSha ?? null,
                artifactPath     : learningCensus.artifactPath ?? null,
                sourceRepository : learningArtifact.sourceRepository ?? null,
                sourceRef        : learningArtifact.sourceRef ?? null,
                sourceSha        : learningArtifact.sourceSha ?? null,
                sourceTreeOid    : learningArtifact.sourceTreeOid ?? null,
                canonicalSha256  : learningArtifact.canonicalSha256 ?? null,
                dispositionDigest: artifactDigest,
                rowCount         : learningArtifact.counts?.total ?? null,
                adrCount         : learningArtifact.counts?.decisions ?? null,
                movingCount      : learningArtifact.counts?.moveToBrain ?? null,
                stayingCount     : learningArtifact.counts?.stayEngine ?? null
            },
            trackerSnapshot: {
                baselineRef            : trackerSnapshot.baselineRef ?? null,
                baselineCount          : trackerSnapshot.baselineCount ?? null,
                deltaRef               : trackerSnapshot.deltaRef ?? null,
                sourceDispositionDigest: trackerSnapshot.sourceDispositionDigest ?? null,
                deltaCount             : trackerSnapshot.deltaCount ?? null,
                sourceTotal            : trackerSnapshot.sourceTotal ?? null,
                transferLedgerCommitSha: trackerSnapshot.transferLedgerCommitSha ?? null,
                transferLedgerPath     : trackerSnapshot.transferLedgerPath ?? null,
                transferLedgerSha256   : trackerSnapshot.transferLedgerSha256 ?? null,
                brainTransferTotal     : trackerSnapshot.brainTransferTotal ?? null,
                openNativeTransferCount: trackerSnapshot.openNativeTransferCount ?? null,
                sourceOnlyClosedCount  : trackerSnapshot.sourceOnlyClosedCount ?? null
            },
            custodyCorrection: {sha: custodyCorrection.sha ?? null}
        },
        rollback: {
            imageSha: rollback.imageSha ?? null,
            bundle  : rollback.bundle ?? null
        },
        receiveOrder         : [...WAVE3_RECEIVE_ORDER],
        engineRemovalRequires: [...WAVE3_REMOVAL_REQUIRES],
        errors,
        ok                   : errors.length === 0
    }
}

/**
 * @summary Builds the complete SHA-bound extraction receipt from current source plus registry.
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT]
 * @param {String} [options.registryPath]
 * @param {Function} [options.closureResolve=resolveRelative] Injectable non-overlay resolver used
 * by the tracked-tree closure wrapper.
 * @param {Boolean} [options.allowDirty=false] Development/test-only opt-in. The CLI never enables it.
 * @returns {Object}
 */
export function buildInventory({
    allowDirty = false,
    closureResolve = resolveRelative,
    projectRoot = PROJECT_ROOT,
    registryPath = process.env.NEO_AGENTOS_EXTRACTION_INVENTORY_REGISTRY || DEFAULT_REGISTRY_PATH
} = {}) {
    const
        registry                                     = readRegistry(registryPath),
        {
            rows: scriptRows,
            closureRows,
            launchRoots,
            closureByLaunchRoot
        }                                            = collectScriptModules({
            projectRoot,
            resolveFallback: closureResolve
        }),
        preliminary                                  = reconcileInventory(scriptRows, registry),
        scriptRowsByIdentity                         = new Map(preliminary.rows
            .filter(row => row.surface === SURFACE.scriptModule)
            .map(row => [row.identity, row])),
        launchRootRows                               = collectLaunchRoots({launchRoots, scriptRowsByIdentity}),
        dependencyPopulation                         = collectPackageDependencies({projectRoot}),
        packageDependencyRows                        = dependencyPopulation.rows,
        manifestPreliminary                          = reconcileInventory([
            ...scriptRows,
            ...launchRootRows,
            ...packageDependencyRows
        ], registry),
        runtimeProbeTargets                          = deriveRuntimeProbeTargets({
            launchRootRows: manifestPreliminary.rows
        }),
        runtimeProbeEligibility                      = reconcileRuntimeProbeEligibility(
            runtimeProbeTargets,
            registry
        ),
        edgeReachedFiles                     = [...new Set(manifestPreliminary.rows
            .filter(row => row.surface === SURFACE.launchRoot && row.disposition === 'edge')
            .flatMap(row => closureByLaunchRoot.get(row.identity) ?? []))].sort(),
        consumerTrackedFiles                 = listTrackedFiles({projectRoot})
            .filter(file => /\.(?:mjs|js)$/.test(file)),
        consumerSourceClasses                = reconcileConsumerSourceClasses(
            registry,
            consumerTrackedFiles
        ),
        consumerPopulation                    = collectConsumerEdges({
            edgeReachedFiles,
            preclassifiedSourcePrefixes: consumerSourceClasses.prefixes,
            projectRoot,
            resolve                    : (specifier, fromFile) =>
                resolveTrackedConfigSpecifier(specifier, fromFile, closureResolve),
            trackedFiles: consumerTrackedFiles
        }),
        consumerEdges                         = reconcileConsumerEdges(
            consumerPopulation.rows,
            registry,
            consumerPopulation.errors
        ),
        engineDependencyCovenant              = inspectEngineAgentOsDependencies({
            forbiddenPackages: registry?.engineDependencyCovenant?.forbiddenPackages,
            manifest         : JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
        }),
        rootRows                             = collectRootScripts({projectRoot, scriptRowsByIdentity}),
        workflowRows                         = collectWorkflowReferences({projectRoot, scriptRowsByIdentity}),
        subprocess                           = collectSubprocessLaunches({projectRoot, scriptRowsByIdentity}),
        openerRows                           = collectPlaneOpeners({projectRoot, scriptRowsByIdentity}),
        configRows                           = collectConfigAuthorities({projectRoot}),
        deploymentArtifactRows               = collectDeploymentArtifacts({projectRoot}),
        learningArtifactRows                 = collectLearningArtifacts({projectRoot}),
        allDerived                           = [
            ...scriptRows,
            ...closureRows,
            ...launchRootRows,
            ...packageDependencyRows,
            ...rootRows,
            ...workflowRows,
            ...subprocess.rows,
            ...openerRows,
            ...configRows,
            ...deploymentArtifactRows,
            ...learningArtifactRows
        ],
        reconciled                           = reconcileInventory(allDerived, registry, subprocess.parseFailures),
        workflowFiles                        = reconcileWorkflowFileDispositions(
            reconciled.rows.filter(row => row.surface === SURFACE.workflowReference),
            registry
        ),
        sha                                  = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
        learningTreeOid                      = execFileSync(
            'git', ['-C', projectRoot, 'rev-parse', 'HEAD:learn/agentos'], {encoding: 'utf8'}
        ).trim(),
        status                               = execFileSync(
            'git', ['-C', projectRoot, 'status', '--porcelain=v1', '--untracked-files=all'], {encoding: 'utf8'}
        ).trimEnd(),
        capturedAt                           = execFileSync(
            'git', ['-C', projectRoot, 'show', '-s', '--format=%cI', 'HEAD'], {encoding: 'utf8'}
        ).trim(),
        counts                               = {};

    reconciled.errors.push(...runtimeProbeEligibility.errors);
    reconciled.errors.push(...dependencyPopulation.errors);
    reconciled.errors.push(...consumerEdges.errors);
    reconciled.errors.push(...consumerSourceClasses.errors);
    reconciled.errors.push(...engineDependencyCovenant.errors);
    reconciled.errors.push(...workflowFiles.errors);
    reconciled.rows.push(...consumerEdges.rows);
    reconciled.rows.push(...consumerSourceClasses.rows);
    reconciled.rows.push(...workflowFiles.rows);
    reconciled.residue.diskMinusAuthority.push(...consumerEdges.residue.diskMinusAuthority.map(
        identity => rowKey(SURFACE.consumerEdge, identity)
    ));
    reconciled.residue.authorityMinusDisk.push(...consumerEdges.residue.authorityMinusDisk.map(
        identity => rowKey(SURFACE.consumerEdge, identity)
    ));
    reconciled.residue.diskMinusAuthority.push(...workflowFiles.residue.diskMinusAuthority.map(
        identity => rowKey(SURFACE.workflowFile, identity)
    ));
    reconciled.residue.authorityMinusDisk.push(...workflowFiles.residue.authorityMinusDisk.map(
        identity => rowKey(SURFACE.workflowFile, identity)
    ));
    reconciled.rows.sort(compareRows);
    reconciled.residue.diskMinusAuthority.sort();
    reconciled.residue.authorityMinusDisk.sort();
    reconciled.errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
    reconciled.ok &&= runtimeProbeEligibility.ok
        && dependencyPopulation.errors.length === 0
        && consumerEdges.ok
        && consumerSourceClasses.ok
        && engineDependencyCovenant.ok
        && workflowFiles.ok;

    const bindingError = sourceBindingError(status, allowDirty);

    if (bindingError) {
        reconciled.errors.push(bindingError);
        reconciled.ok = false
    }

    reconciled.rows.forEach(row => {
        const surface = counts[row.surface] ??= {total: 0, byDisposition: {}};

        surface.total++;
        surface.byDisposition[row.disposition ?? 'unclassified'] =
            (surface.byDisposition[row.disposition ?? 'unclassified'] ?? 0) + 1
    });

    const
        reconciledLaunchRoots  = reconciled.rows.filter(row => row.surface === SURFACE.launchRoot),
        reconciledDependencies = reconciled.rows.filter(row => row.surface === SURFACE.packageDependency),
        dependencyManifests    = composeDependencyManifests(reconciledDependencies);

    reconciled.errors.push(...dependencyManifests.errors);
    reconciled.errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
    reconciled.ok &&= dependencyManifests.errors.length === 0;

    return {
        schemaVersion: 'agentos-extraction-inventory.v6',
        capturedAt,
        git          : {
            sha,
            learningTreeOid,
            clean     : !status,
            dirtyPaths: status ? status.split('\n').map(line => line.slice(3)).sort() : []
        },
        launchRoots: {
            total: reconciledLaunchRoots.length,
            byVia: Object.fromEntries(Object.entries(Object.groupBy(launchRoots, row => row.via))
                .map(([via, rows]) => [via, rows.length])),
            rows: reconciledLaunchRoots
        },
        packageDependencies: {
            total     : reconciledDependencies.length,
            byManifest: Object.fromEntries(Object.entries(Object.groupBy(
                reconciledDependencies,
                row => row.evidence.manifest
            )).map(([manifest, rows]) => [manifest, rows.length])),
            manifests: dependencyManifests.manifests,
            rows     : reconciledDependencies
        },
        consumerEdges: {
            total      : consumerEdges.rows.length,
            byDirection: Object.fromEntries(Object.entries(Object.groupBy(
                consumerEdges.rows,
                row => row.evidence.direction
            )).map(([direction, rows]) => [direction, rows.length])),
            rows         : consumerEdges.rows,
            residue      : consumerEdges.residue,
            sourceClasses: consumerSourceClasses.rows
        },
        workflowFiles,
        engineDependencyCovenant,
        runtimeProbeEligibility,
        counts,
        ...reconciled
    }
}

/**
 * @summary Renders the actionable human receipt: population counts first, then every residue/error.
 * @param {Object} report
 * @returns {String}
 */
export function formatInventory(report) {
    const lines = [`[agentOsExtractionInventory] ${report.git.sha}`, ''];

    Object.entries(report.counts).sort(([a], [b]) => a.localeCompare(b)).forEach(([surface, data]) => {
        const detail = Object.entries(data.byDisposition).sort(([a], [b]) => a.localeCompare(b))
            .map(([name, count]) => `${name} ${count}`).join(' · ');

        lines.push(`${surface.padEnd(22)} ${String(data.total).padStart(4)}  ${detail}`)
    });

    const probe = report.runtimeProbeEligibility;

    lines.push('', `launch-root identities: ${report.launchRoots.total}`);
    report.launchRoots.rows.forEach(row => lines.push(
        `  ${String(row.disposition).padEnd(12)} ${row.identity} — ${row.evidence.via}:${row.evidence.name}`
    ));

    lines.push('', `package-dependency identities: ${report.packageDependencies.total}`);
    report.packageDependencies.rows.forEach(row => lines.push(
        `  ${String(row.disposition).padEnd(12)} ${row.identity} @ ${row.evidence.version} ` +
        `→ ${(row.manifestTargets ?? []).join('+')}`
    ));

    lines.push('', `consumer-edge identities: ${report.consumerEdges.total}`);
    Object.entries(report.consumerEdges.byDirection).sort(([a], [b]) => a.localeCompare(b))
        .forEach(([direction, count]) => lines.push(`  ${direction}: ${count}`));
    report.consumerEdges.rows.forEach(row => lines.push(
        `  ${String(row.disposition).padEnd(28)} ${row.identity} → ${row.successorPhase}`
    ));
    lines.push('  preclassified source classes:');
    report.consumerEdges.sourceClasses.forEach(row => lines.push(
        `    ${row.identity} — ${row.evidence.fileCount} tracked files → ${row.successorPhase}`
    ));

    const workflowFiles = report.workflowFiles;

    lines.push('', `workflow-file identities: ${workflowFiles.total} · ` +
        `occurrences ${workflowFiles.occurrenceTotal}`);
    Object.entries(workflowFiles.byDisposition).sort(([a], [b]) => a.localeCompare(b))
        .forEach(([disposition, count]) => lines.push(`  ${disposition}: ${count}`));
    workflowFiles.rows.forEach(row => lines.push(
        `  ${String(row.disposition).padEnd(10)} ${row.identity} — ${row.evidence.occurrenceCount} occurrences`
    ));

    lines.push('', `Engine→AgentOS forbidden packages: ${report.engineDependencyCovenant.forbiddenPackages.join(', ')}`);
    report.engineDependencyCovenant.violations.forEach(row => lines.push(
        `  ! ${row.section}.${row.name} @ ${row.version}`
    ));

    lines.push('', `runtime-probe targets: ${probe.total} · eligible ${probe.byEligibility.eligible} · ` +
        `ineligible ${probe.byEligibility.ineligible}`);
    probe.rows.forEach(row => lines.push(
        `  ${String(row.eligibility).padEnd(10)} ${row.identity} — ${row.reason}`
    ));

    lines.push('', `disk - authority: ${report.residue.diskMinusAuthority.length}`);
    report.residue.diskMinusAuthority.forEach(key => lines.push(`  + ${key}`));
    lines.push(`authority - disk: ${report.residue.authorityMinusDisk.length}`);
    report.residue.authorityMinusDisk.forEach(key => lines.push(`  - ${key}`));

    if (report.errors.length) {
        lines.push('', `errors: ${report.errors.length}`);
        report.errors.forEach(error => lines.push(`  ! ${error.kind}: ${error.key}${error.error ? ` — ${error.error}` : ''}`))
    }

    lines.push('', report.ok ? 'OK — zero unexplained residue.' : 'FAILED — inventory authority is incomplete.');

    return lines.join('\n')
}

/**
 * @summary Builds a fresh Commander program for the inventory and Wave-3 receipt CLI.
 * @returns {Command}
 */
export function createProgram() {
    return new Command()
        .name('agentOsExtractionInventory')
        .description('Emit the Agent OS extraction inventory or compose its Wave-3 cut receipt.')
        .option('--json', 'Emit the inventory machine receipt JSON on stdout.', false)
        .option(
            '--wave3-cut-input <path>',
            'Compose wave3-cut-manifest.v1 from this JSON input plus a fresh local inventory.'
        )
}

/**
 * @summary Parses CLI arguments with deterministic Commander failure semantics for focused tests.
 * @param {String[]} argv User arguments, excluding node and script paths.
 * @returns {{json: Boolean, wave3CutInput: String|null}}
 */
export function parseArgs(argv = []) {
    const program = createProgram();

    program.exitOverride();
    program.configureOutput({writeOut: () => {}, writeErr: () => {}});
    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        json         : options.json === true,
        wave3CutInput: options.wave3CutInput ?? null
    }
}

/**
 * @summary Builds the selected CLI receipt without coupling parser tests to live repository scans.
 * @param {Object} [options]
 * @param {{json: Boolean, wave3CutInput: String|null}} [options.cliOptions]
 * @param {Object} [options.inventory] Fresh extraction inventory; defaults to a live build.
 * @param {Function} [options.planeProofBuilder] Existing proof producer invocation.
 * @param {Function} [options.readFile] Injectable UTF-8 input reader.
 * @returns {{kind: String, report: Object}}
 */
export function buildCliReport({
    cliOptions = {json: false, wave3CutInput: null},
    inventory = buildInventory(),
    planeProofBuilder = () => runPlaneBoundaryProof(),
    readFile = file => fs.readFileSync(file, 'utf8')
} = {}) {
    if (!cliOptions.wave3CutInput) {
        return {kind: 'inventory', report: inventory}
    }

    const input = JSON.parse(readFile(path.resolve(cliOptions.wave3CutInput)));

    if (!input || Array.isArray(input) || typeof input !== 'object') {
        throw new TypeError('--wave3-cut-input must contain one JSON object')
    }

    const coordinates = {...input};

    // A caller-authored proof object is a declaration, not an observation. The CLI invokes the
    // existing producer and owns the receipt it consumes; deleting here makes that boundary
    // explicit even if an old input file still carries the retired field.
    delete coordinates.planeProof;

    return {
        kind  : WAVE3_CUT_MANIFEST_VERSION,
        report: buildWave3CutManifest({
            ...coordinates,
            inventory,
            planeProof: planeProofBuilder()
        })
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    const
        options        = createProgram().parse(process.argv).opts(),
        {kind, report} = buildCliReport({
            cliOptions: {
                json         : options.json === true,
                wave3CutInput: options.wave3CutInput ?? null
            }
        }),
        emitJson       = options.json === true || kind === WAVE3_CUT_MANIFEST_VERSION;

    console.log(emitJson ? JSON.stringify(report, null, 4) : formatInventory(report));
    process.exitCode = report.ok ? 0 : 1
}
