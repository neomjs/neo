#!/usr/bin/env node

import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse}                        from 'acorn';

import {
    buildAuthorityByScript,
    edgeIdentity,
    readEntrypoints
}                                    from '../lint/lint-script-plane.mjs';
import {
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
 * authority, producing the blocking pre-relocation inventory proof.
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
 */

const
    __filename              = fileURLToPath(import.meta.url),
    PROJECT_ROOT            = path.resolve(path.dirname(__filename), '../../..'),
    DEFAULT_REGISTRY_PATH   = path.join(PROJECT_ROOT, 'ai/scripts/diagnostics/agentOsExtractionInventory.json'),
    SCRIPT_PATH_RE          = /\bai\/scripts\/[A-Za-z0-9_./-]+\.mjs\b/g,
    WORKFLOW_ARTIFACT_RE    = /\b(?:test\/playwright\/unit\/)?ai\/scripts\/[A-Za-z0-9_./-]+\.(?:json|mjs)\b/g,
    VALID_DISPOSITIONS      = new Set(['cloud', 'edge', 'retire', 'shared', 'stays-engine']),
    VALID_PROBE_ELIGIBILITY = new Set(['eligible', 'ineligible']),
    LAUNCH_CALLEES          = new Set([
        'exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'runCommand', 'spawn', 'spawnSync'
    ]),
    SUBPROCESS_SCAN_ROOTS   = ['.agents', '.claude', '.codex', 'ai', 'buildScripts', 'test'];

/**
 * Stable surface names in the machine receipt.
 * @type {Object}
 */
export const SURFACE = Object.freeze({
    closureEdge      : 'closure-edge',
    configAuthority  : 'config-authority',
    custodyBoundary  : 'custody-boundary',
    planeOpener      : 'plane-opener',
    rootScript       : 'root-script',
    scriptModule     : 'script-module',
    subprocessLaunch : 'subprocess-launch',
    workflowReference: 'workflow-reference'
});

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
 * @returns {{rows: Object[], closureRows: Object[], launchRoots: Object[]}}
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
        closureRows       = new Map();

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

    return {rows, closureRows: [...closureRows.values()].sort(compareRows), launchRoots}
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
                suggestedDisposition: target?.disposition ?? null,
                suggestedRationale  : target?.disposition ? `follows ${row.target}` : null
            }
        }
    }).sort(compareRows)
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

        if (!VALID_DISPOSITIONS.has(entry.disposition)) errors.push({kind: 'invalid-disposition', key});
        if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 12) {
            errors.push({kind: 'missing-rationale', key})
        }
        if (typeof entry.source !== 'string' || !entry.source.trim()) errors.push({kind: 'missing-source', key});

        overrideMap.set(key, entry)
    }

    const rows = derivedRows.map(row => {
        const override = overrideMap.get(rowKey(row.surface, row.identity));

        if (override && [SURFACE.rootScript, SURFACE.subprocessLaunch, SURFACE.workflowReference].includes(row.surface)
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
        diskMinusAuthority = rows.filter(row => !VALID_DISPOSITIONS.has(row.disposition)
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
 * @param {Object[]} [options.launchRoots=[]]
 * @param {Object[]} [options.scriptRows=[]] Reconciled inventory rows.
 * @returns {String[]}
 */
export function deriveRuntimeProbeTargets({launchRoots = [], scriptRows = []} = {}) {
    const dispositionByIdentity = new Map(scriptRows
        .filter(row => row.surface === SURFACE.scriptModule)
        .map(row => [row.identity, row.disposition]));

    return [...new Set(launchRoots.map(row => row.rel).filter(Boolean))]
        .filter(identity => dispositionByIdentity.get(identity) === 'edge')
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
        {rows: scriptRows, closureRows, launchRoots} = collectScriptModules({
            projectRoot,
            resolveFallback: closureResolve
        }),
        preliminary                                  = reconcileInventory(scriptRows, registry),
        runtimeProbeTargets                          = deriveRuntimeProbeTargets({
            launchRoots,
            scriptRows: preliminary.rows
        }),
        runtimeProbeEligibility                      = reconcileRuntimeProbeEligibility(
            runtimeProbeTargets,
            registry
        ),
        scriptRowsByIdentity                         = new Map(preliminary.rows
            .filter(row => row.surface === SURFACE.scriptModule)
            .map(row => [row.identity, row])),
        rootRows                             = collectRootScripts({projectRoot, scriptRowsByIdentity}),
        workflowRows                         = collectWorkflowReferences({projectRoot, scriptRowsByIdentity}),
        subprocess                           = collectSubprocessLaunches({projectRoot, scriptRowsByIdentity}),
        openerRows                           = collectPlaneOpeners({projectRoot, scriptRowsByIdentity}),
        configRows                           = collectConfigAuthorities({projectRoot}),
        allDerived                           = [
            ...scriptRows,
            ...closureRows,
            ...rootRows,
            ...workflowRows,
            ...subprocess.rows,
            ...openerRows,
            ...configRows
        ],
        reconciled                           = reconcileInventory(allDerived, registry, subprocess.parseFailures),
        sha                                  = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
        status                               = execFileSync(
            'git', ['-C', projectRoot, 'status', '--porcelain=v1', '--untracked-files=all'], {encoding: 'utf8'}
        ).trim(),
        capturedAt                           = execFileSync(
            'git', ['-C', projectRoot, 'show', '-s', '--format=%cI', 'HEAD'], {encoding: 'utf8'}
        ).trim(),
        counts                               = {};

    reconciled.errors.push(...runtimeProbeEligibility.errors);
    reconciled.errors.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
    reconciled.ok &&= runtimeProbeEligibility.ok;

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

    return {
        schemaVersion: 'agentos-extraction-inventory.v2',
        capturedAt,
        git          : {
            sha,
            clean     : !status,
            dirtyPaths: status ? status.split('\n').map(line => line.slice(3)).sort() : []
        },
        launchRoots: {
            total: launchRoots.length,
            byVia: Object.fromEntries(Object.entries(Object.groupBy(launchRoots, row => row.via))
                .map(([via, rows]) => [via, rows.length]))
        },
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

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    const report = buildInventory();

    console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 4) : formatInventory(report));
    process.exitCode = report.ok ? 0 : 1
}
