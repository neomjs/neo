#!/usr/bin/env node
/**
 * @summary Bans mechanical ADR-19 AiConfig SSOT antipatterns: inline `process.env`
 * reads inside `leaf(...)` default expressions in `config.template.mjs`, plus
 * implementation-file config pass-throughs, hidden defaults, type coercions, exports,
 * and defensive optional chaining around `AiConfig`.
 *
 * ## The rule
 *
 * `config.template.mjs` is the declarative configuration SSOT: every value is
 * `leaf(default, envVarName, type)`, where the environment override is named by the
 * string-literal `envVarName` argument and resolved by the config system. A `default`
 * expression that itself reads `process.env` (typically an inline
 * `process.env.UNIT_TEST_MODE === 'true' ? test : prod` branch) leaks imperative
 * env-resolution into the canonical config — the same root the `resolveAiDataRoot`
 * over-engineering hit. Env-resolution belongs at the env/test layer, not baked into
 * the SSOT, so this guard makes the antipattern un-mergeable rather than "review harder".
 *
 * ## What this catches
 *
 * Any single-line `leaf( ... process.env ... )` default across every `config.template.mjs`
 * under `ai/`. Env access must flow through the leaf env-var-name argument; a test
 * override belongs in the test layer (the `test-unit` npm script shell env), not an
 * inline branch.
 *
 * Scope: single-line leaf defaults (the established idiom — the realistic regression
 * copies that shape). Multi-line leaf bodies are not parsed. The gitignored `config.mjs`
 * overlays are out of scope by design: they are generated from these templates, so the
 * template is the SSOT fix site.
 *
 * ## Baseline + burndown
 *
 * The known pre-existing instances live in `BASELINE` so this lint lands enforcing
 * (blocks NEW antipattern instances) without failing the build on the historical debt.
 * Each reshape that removes an instance must also drop its `BASELINE` row — a row that no
 * longer matches a live violation fails the lint, keeping the burndown honest.
 *
 * @see learn/agentos/decisions  The AiConfig reactive Provider SSOT decision record.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

const CONFIG_TEMPLATE_BASENAME = 'config.template.mjs';
const CONFIG_OVERLAY_BASENAME  = 'config.mjs';
const SCAN_ROOT_REL            = 'ai';
const SELF_REL_FILE            = 'ai/scripts/lint/lint-config-template-ssot.mjs';

/**
 * Pre-existing inline-env leaf defaults, keyed by `<file>::<envVar>`. Each entry is a
 * burndown row for the declarative-config reshape: dropping the inline branch from the
 * template must also drop the matching row here. `reshape` records the verified fix shape.
 * @type {ReadonlyArray<{file: String, env: String, ticket: String, reshape: String}>}
 */
export const BASELINE = Object.freeze([
    // EMPTY — all config.template inline-`process.env` leaf defaults have been reshaped to the
    // declarative toggle+formula shape. The lint is now FULLY ENFORCING: any NEW inline-`process.env`
    // leaf default is a fresh violation (no grandfathered instances remain).
]);

/**
 * Pre-existing implementation-level ADR-19 B2/B3/B5 guard hits. These rows are not
 * permission to add more; they keep this lint fail-build for NEW regressions while the
 * broader AiConfig cleanup retires existing boundaries one by one.
 * @type {ReadonlyArray<{file: String, kind: String, text: String, ticket: String, reason: String}>}
 */
export const AI_CONFIG_IMPLEMENTATION_BASELINE = Object.freeze([
    {
        file  : 'ai/daemons/orchestrator/Orchestrator.mjs',
        kind  : 'config-pass-through',
        text  : 'runtimeAccessConfig: AiConfig.orchestrator.deploymentRuntimeAccess,',
        ticket: '#13939',
        reason: 'Existing bootstrap handoff; cleanup belongs to the #12456 fan-out.'
    },
    {
        file  : 'ai/daemons/orchestrator/Orchestrator.mjs',
        kind  : 'config-pass-through',
        text  : 'actuatorConfig                : AiConfig.orchestrator.recoveryActuator',
        ticket: '#13939',
        reason: 'Existing bootstrap handoff; cleanup belongs to the #12456 fan-out.'
    },
    {
        file  : 'ai/daemons/orchestrator/daemon.mjs',
        kind  : 'config-pass-through',
        text  : 'primaryDevSyncRootsConfig: AiConfig.orchestrator.devSyncRoots,',
        ticket: '#13939',
        reason: 'Existing entrypoint injection boundary; cleanup belongs to the #12456 fan-out.'
    },
    {
        file  : 'ai/daemons/orchestrator/services/TenantRepoSyncService.mjs',
        kind  : 'config-parameter-default',
        text  : 'async resolveTenantReposConfig({tier1MirrorRoot, orchestratorConfig = AiConfig.orchestrator, env = process.env, ingestionService} = {}) {',
        ticket: '#13939',
        reason: 'Existing test seam; cleanup belongs to the #12456 fan-out.'
    }
]);

/**
 * Existing module-scope AiConfig leaf captures that are classified as non-self-heal P1 debt.
 * These rows are not permission to add more captures: they document the residual #14239 audit
 * and keep the lint fail-build for any NEW module-load Provider leaf capture, especially in
 * self-heal / repair paths where stale values can block runtime healing.
 * @type {ReadonlyArray<{file: String, kind: String, text: String, ticket: String, reason: String}>}
 */
export const AI_CONFIG_MODULE_SCOPE_BASELINE = Object.freeze([
    {
        file  : 'ai/scripts/diagnostics/analyzeNlTelemetry.mjs',
        kind  : 'module-scope-capture',
        text  : 'const DB_PATH = aiConfig.storagePaths.graph;',
        ticket: '#14239',
        reason: 'One-shot diagnostic CLI path capture; not a self-heal runtime consumer.'
    },
    {
        file  : 'ai/scripts/diagnostics/analyzeNlTelemetry.mjs',
        kind  : 'module-scope-capture',
        text  : 'const RLAIF_PATH = aiConfig.datasets.rlaif.trajectories;',
        ticket: '#14239',
        reason: 'One-shot diagnostic CLI output path capture; not a self-heal runtime consumer.'
    },
    {
        file  : 'ai/services/github-workflow/sync/DiscussionSyncer.mjs',
        kind  : 'module-scope-capture',
        text  : 'const issueSyncConfig = aiConfig.issueSync;',
        ticket: '#14239',
        reason: 'GitHub mirror sync P1 config capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/github-workflow/sync/IssueSyncer.mjs',
        kind  : 'module-scope-capture',
        text  : 'const issueSyncConfig = aiConfig.issueSync;',
        ticket: '#14239',
        reason: 'GitHub mirror sync P1 config capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/github-workflow/sync/MetadataManager.mjs',
        kind  : 'module-scope-capture',
        text  : 'const issueSyncConfig = aiConfig.issueSync;',
        ticket: '#14239',
        reason: 'GitHub mirror metadata P1 config capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/github-workflow/sync/PullRequestSyncer.mjs',
        kind  : 'module-scope-capture',
        text  : 'const issueSyncConfig = aiConfig.issueSync;',
        ticket: '#14239',
        reason: 'GitHub mirror sync P1 config capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/github-workflow/sync/PullRequestSyncer.mjs',
        kind  : 'module-scope-capture',
        text  : 'const pullRequestConfig = aiConfig.pullRequest;',
        ticket: '#14239',
        reason: 'GitHub PR mirror P1 config capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/github-workflow/sync/ReleaseNotesSyncer.mjs',
        kind  : 'module-scope-capture',
        text  : 'const issueSyncConfig = aiConfig.issueSync;',
        ticket: '#14239',
        reason: 'Release-note mirror sync P1 config capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/knowledge-base/DatabaseService.mjs',
        kind  : 'module-scope-capture',
        text  : 'const cwd       = aiConfig.neoRootDir;',
        ticket: '#14239',
        reason: 'Knowledge Base startup path P1 capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/knowledge-base/QueryService.mjs',
        kind  : 'module-scope-capture',
        text  : 'const {queryScoreWeights} = aiConfig;',
        ticket: '#14239',
        reason: 'Knowledge Base scoring-weight P1 capture; not a self-heal repair/actuator path.'
    },
    {
        file  : 'ai/services/knowledge-base/QueryService.mjs',
        kind  : 'module-scope-capture',
        text  : 'const cwd       = aiConfig.neoRootDir;',
        ticket: '#14239',
        reason: 'Knowledge Base startup path P1 capture; not a self-heal repair/actuator path.'
    }
]);

/**
 * @summary Normalizes paths for deterministic lint keys.
 * @param {String} file Path to normalize.
 * @returns {String}
 */
function normalizeFile(file) {
    return file.split(path.sep).join('/');
}

/**
 * @summary Recursively collects `config.template.mjs` files under a directory.
 * @param {String} dir Absolute directory to walk.
 * @returns {String[]} Absolute file paths, sorted.
 */
function walkConfigTemplates(dir) {
    if (!fs.existsSync(dir)) return [];

    const out = [];

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...walkConfigTemplates(full));
        } else if (entry.name === CONFIG_TEMPLATE_BASENAME) {
            out.push(full);
        }
    }

    return out.sort();
}

/**
 * @summary Recursively collects `.mjs` files under a directory.
 * @param {String} dir Absolute directory to walk.
 * @returns {String[]} Absolute file paths, sorted.
 */
function walkMjsFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    const out = [];

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...walkMjsFiles(full));
        } else if (entry.name.endsWith('.mjs')) {
            out.push(full);
        }
    }

    return out.sort();
}

/**
 * @summary Filters files to the `ai/` implementation scope for ADR-19 implementation linting.
 * @param {String} file Repo-relative path.
 * @returns {Boolean}
 */
function shouldScanAiConfigImplementation(file) {
    const normalized = normalizeFile(file),
          basename   = path.basename(normalized);

    return normalized.startsWith(`${SCAN_ROOT_REL}/`) &&
        normalized.endsWith('.mjs') &&
        normalized !== SELF_REL_FILE &&
        basename !== CONFIG_TEMPLATE_BASENAME &&
        basename !== CONFIG_OVERLAY_BASENAME;
}

/**
 * @summary Detects single-line `leaf(...)` defaults that read `process.env` inline.
 *
 * Pure: operates on source text, so it is unit-testable without touching disk. Env access
 * in a declarative leaf must flow through the env-var-name argument, never an inline
 * `process.env` read in the default expression.
 * @param {String} source File contents.
 * @returns {Array<{line: Number, env: (String|null), key: (String|null), text: String}>}
 */
export function detectInlineEnvLeaves(source) {
    const violations = [],
          lines      = source.split('\n');

    lines.forEach((text, index) => {
        if (!/\bleaf\s*\(/.test(text))      return;
        if (!/\bprocess\.env\b/.test(text)) return;

        const env = (text.match(/'([A-Z][A-Z0-9_]{2,})'/) || [])[1] || null,
              key = (text.match(/(\w+)\s*:\s*leaf\s*\(/)   || [])[1] || null;

        violations.push({line: index + 1, env, key, text: text.trim()});
    });

    return violations;
}

/**
 * @summary Detects mechanical ADR-19 implementation violations around `AiConfig`.
 *
 * The detector is intentionally conservative: it catches the recurrence shapes that
 * review keeps missing without parsing every legitimate direct leaf read. Nuanced
 * sanctioned boundaries stay review-owned, and local Provider subtree variables are
 * allowed. New config-shaped pass-throughs, parameter defaults, exports, hidden
 * defaults, type coercions, and defensive optional chains fail early.
 * @param {String} source File contents.
 * @returns {Array<{line: Number, kind: String, text: String}>}
 */
export function detectAiConfigImplementationViolations(source) {
    const violations = [],
          lines      = source.split('\n');

    lines.forEach((text, index) => {
        const trimmed = text.trim();

        if (!trimmed) return;
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) return;
        if (!/\bAiConfig(?:\?\.|\.)/.test(trimmed)) return;

        const push = kind => violations.push({line: index + 1, kind, text: trimmed});

        if (/\bexport\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('export');
        }

        if (/\b[A-Za-z_$][\w$]*Config[\w$]*\s*:\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('config-pass-through');
        }

        if (/[({,]\s*[A-Za-z_$][\w$]*Config[\w$]*\s*=\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('config-parameter-default');
        }

        if (/\bAiConfig\?\.|\bAiConfig(?:\.[A-Za-z_$][\w$]*)+\?\./.test(trimmed)) {
            push('defensive-optional-chain');
        }

        if (/\b(?:Number|Boolean)\s*\(\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('type-coercion');
        }

        if (/\bAiConfig(?:\?\.|\.[A-Za-z_$][\w$]*)[^;\n]*(?:\?\?|\|\|)/.test(trimmed)) {
            push('hidden-default');
        }
    });

    return violations;
}

/**
 * @summary Detects module-load AiConfig leaf captures (`const x = aiConfig.y` / destructuring).
 *
 * Direct use-site reads remain valid. This detector specifically targets values frozen at module
 * evaluation time, the #14239 failure mode where a runtime self-heal config mutation can be ignored
 * by a stale closure. Function bodies and module-scope functions that read AiConfig when invoked are
 * intentionally out of scope.
 * @param {String} source File contents.
 * @returns {Array<{line: Number, kind: String, text: String}>}
 */
export function detectModuleScopeAiConfigCaptures(source) {
    const violations = [];
    let   depth      = 0;

    source.split('\n').forEach((text, index) => {
        const trimmed = text.trim(),
              before  = depth;

        if (before === 0 &&
            !trimmed.startsWith('//') &&
            !trimmed.startsWith('*') &&
            !trimmed.startsWith('/*') &&
            !trimmed.startsWith('*/') &&
            /\b(?:const|let|var)\b/.test(trimmed) &&
            (
                /\b(?:const|let|var)\s*\{[^}]+\}\s*=\s*(?:aiConfig|AiConfig|KB_Config|Memory_Config)\b/.test(trimmed) ||
                /=\s*(?:aiConfig|AiConfig|KB_Config|Memory_Config)(?:\?\.|\.)/.test(trimmed)
            )
        ) {
            violations.push({line: index + 1, kind: 'module-scope-capture', text: trimmed});
        }

        const code = stripStringsAndLineComment(text);
        for (const ch of code) {
            if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth = Math.max(0, depth - 1);
            }
        }
    });

    return violations;
}

/**
 * @summary Removes quoted strings and line comments for brace-depth scanning.
 * @param {String} line Source line.
 * @returns {String}
 */
function stripStringsAndLineComment(line) {
    let out     = '',
        quote   = null,
        escaped = false;

    for (let i = 0; i < line.length; i++) {
        const ch   = line[i],
              next = line[i + 1];

        if (!quote && ch === '/' && next === '/') {
            break;
        }

        if (quote) {
            out += ' ';
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === '\'' || ch === '`') {
            quote = ch;
            out += ' ';
            continue;
        }

        out += ch;
    }

    return out;
}

/**
 * @summary Core lint: scans config templates and partitions inline-env leaf defaults into
 * baselined, new (unbaselined), and stale-baseline sets.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected file records (test seam).
 * @param {ReadonlyArray<Object>} [options.baseline] Baseline rows.
 * @returns {{violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function lintConfigTemplateSsot({rootDir = ROOT_DIR, files, baseline = BASELINE} = {}) {
    const records = files || walkConfigTemplates(path.join(rootDir, SCAN_ROOT_REL)).map(abs => ({
        file  : path.relative(rootDir, abs).split(path.sep).join('/'),
        source: fs.readFileSync(abs, 'utf8')
    }));

    const violations = [];

    for (const {file, source} of records) {
        for (const hit of detectInlineEnvLeaves(source)) {
            violations.push({file, ...hit});
        }
    }

    const keyOf         = row => `${row.file}::${row.env}`,
          baselineKeys  = new Set(baseline.map(keyOf)),
          violationKeys = new Set(violations.map(keyOf));

    return {
        violations,
        newViolations: violations.filter(v => !baselineKeys.has(keyOf(v))),
        staleBaseline: baseline.filter(b => !violationKeys.has(keyOf(b)))
    };
}

/**
 * @summary Scans `ai/` implementation files for mechanical ADR-19 AiConfig SSOT hits.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected file records (test seam).
 * @param {ReadonlyArray<Object>} [options.baseline] Baseline rows.
 * @returns {{violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function lintAiConfigImplementationSsot({
    rootDir  = ROOT_DIR,
    files,
    baseline = AI_CONFIG_IMPLEMENTATION_BASELINE
} = {}) {
    const records = files || walkMjsFiles(path.join(rootDir, SCAN_ROOT_REL))
        .map(abs => ({
            file  : normalizeFile(path.relative(rootDir, abs)),
            source: fs.readFileSync(abs, 'utf8')
        }))
        .filter(({file}) => shouldScanAiConfigImplementation(file));

    const violations = [];

    for (const {file, source} of records) {
        if (!shouldScanAiConfigImplementation(file)) continue;

        for (const hit of detectAiConfigImplementationViolations(source)) {
            violations.push({file, ...hit});
        }
    }

    const keyOf         = row => `${row.file}::${row.kind}::${row.text}`,
          baselineKeys  = new Set(baseline.map(keyOf)),
          violationKeys = new Set(violations.map(keyOf));

    return {
        violations,
        newViolations: violations.filter(v => !baselineKeys.has(keyOf(v))),
        staleBaseline: baseline.filter(b => !violationKeys.has(keyOf(b)))
    };
}

/**
 * @summary Scans `ai/` implementation files for module-scope AiConfig leaf captures.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected file records (test seam).
 * @param {ReadonlyArray<Object>} [options.baseline] Baseline rows.
 * @returns {{violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function lintAiConfigModuleScopeCaptures({
    rootDir  = ROOT_DIR,
    files,
    baseline = AI_CONFIG_MODULE_SCOPE_BASELINE
} = {}) {
    const records = files || walkMjsFiles(path.join(rootDir, SCAN_ROOT_REL))
        .map(abs => ({
            file  : normalizeFile(path.relative(rootDir, abs)),
            source: fs.readFileSync(abs, 'utf8')
        }))
        .filter(({file}) => shouldScanAiConfigImplementation(file));

    const violations = [];

    for (const {file, source} of records) {
        if (!shouldScanAiConfigImplementation(file)) continue;

        for (const hit of detectModuleScopeAiConfigCaptures(source)) {
            violations.push({file, ...hit});
        }
    }

    const keyOf         = row => `${row.file}::${row.kind}::${row.text}`,
          baselineKeys  = new Set(baseline.map(keyOf)),
          violationKeys = new Set(violations.map(keyOf));

    return {
        violations,
        newViolations: violations.filter(v => !baselineKeys.has(keyOf(v))),
        staleBaseline: baseline.filter(b => !violationKeys.has(keyOf(b)))
    };
}

const FIX_HINT = 'Move env access into the leaf env-var-name argument — leaf(default, \'ENV_VAR\', type) — ' +
    'and relocate any UNIT_TEST_MODE branch to the test layer (the test-unit npm script shell env). ' +
    'Authority: the AiConfig reactive Provider SSOT decision record (issue #12451).';
const AI_CONFIG_FIX_HINT = 'Read resolved AiConfig leaves inline at the use site; local Provider subtree references are OK. ' +
    'Do not export config values, pass config-shaped objects through consumers, add hidden defaults/type coercions, ' +
    'or add defensive optional chaining unless the code names an ADR-19-sanctioned boundary. Authority: ADR 0019.';
const AI_CONFIG_MODULE_SCOPE_FIX_HINT = 'Do not freeze Provider leaves at module load. Read AiConfig at the use site, ' +
    'or document an existing non-self-heal P1 capture in AI_CONFIG_MODULE_SCOPE_BASELINE as a burndown row. ' +
    'New self-heal / repair / actuator captures must be converted, not baselined. Authority: #14239 + ADR 0019.';

/**
 * @summary CLI wrapper. Returns an exit code (0 clean, 1 on new violations or stale baseline rows).
 * @param {Object} [options] Forwarded to {@link lintConfigTemplateSsot}.
 * @returns {{exitCode: Number, violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function runLint(options = {}) {
    const {
              rootDir                = ROOT_DIR,
              files,
              baseline               = BASELINE,
              implementationFiles,
              implementationBaseline = AI_CONFIG_IMPLEMENTATION_BASELINE,
              moduleScopeFiles,
              moduleScopeBaseline    = AI_CONFIG_MODULE_SCOPE_BASELINE
          } = options,
          result               = lintConfigTemplateSsot({rootDir, files, baseline}),
          implementationResult = lintAiConfigImplementationSsot({
              rootDir,
              files   : implementationFiles,
              baseline: implementationBaseline
          }),
          moduleScopeResult = lintAiConfigModuleScopeCaptures({
              rootDir,
              files   : moduleScopeFiles,
              baseline: moduleScopeBaseline
          }),
          {violations, newViolations, staleBaseline} = result,
          hasImplementationFailures = implementationResult.newViolations.length > 0 ||
              implementationResult.staleBaseline.length > 0,
          hasModuleScopeFailures = moduleScopeResult.newViolations.length > 0 ||
              moduleScopeResult.staleBaseline.length > 0;

    if (newViolations.length === 0 && staleBaseline.length === 0 && !hasImplementationFailures && !hasModuleScopeFailures) {
        console.log(`[lint-config-template-ssot] OK - ${violations.length} inline-env leaf default(s), ${implementationResult.violations.length} AiConfig implementation SSOT hit(s), ${moduleScopeResult.violations.length} module-scope AiConfig capture(s), all baselined.`);
        return {exitCode: 0, ...result, implementation: implementationResult, moduleScope: moduleScopeResult};
    }

    if (newViolations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${newViolations.length} new inline process.env read(s) in a leaf default:\n`);

        for (const v of newViolations) {
            console.error(`- ${v.file}:${v.line}${v.env ? `  (${v.env})` : ''}`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${FIX_HINT}\n`);
    }

    if (staleBaseline.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${staleBaseline.length} baseline row(s) no longer match a live violation (reshape landed — remove the row):\n`);

        for (const b of staleBaseline) {
            console.error(`- ${b.file}::${b.env}  (${b.ticket})`);
        }

        console.error('');
    }

    if (implementationResult.newViolations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${implementationResult.newViolations.length} new AiConfig implementation SSOT violation(s):\n`);

        for (const v of implementationResult.newViolations) {
            console.error(`- ${v.file}:${v.line}  (${v.kind})`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${AI_CONFIG_FIX_HINT}\n`);
    }

    if (implementationResult.staleBaseline.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${implementationResult.staleBaseline.length} AiConfig implementation baseline row(s) no longer match live code (cleanup landed — remove the row):\n`);

        for (const b of implementationResult.staleBaseline) {
            console.error(`- ${b.file}::${b.kind}::${b.text}  (${b.ticket})`);
        }

        console.error('');
    }

    if (moduleScopeResult.newViolations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${moduleScopeResult.newViolations.length} new module-scope AiConfig capture(s):\n`);

        for (const v of moduleScopeResult.newViolations) {
            console.error(`- ${v.file}:${v.line}  (${v.kind})`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${AI_CONFIG_MODULE_SCOPE_FIX_HINT}\n`);
    }

    if (moduleScopeResult.staleBaseline.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${moduleScopeResult.staleBaseline.length} module-scope AiConfig baseline row(s) no longer match live code (cleanup landed — remove the row):\n`);

        for (const b of moduleScopeResult.staleBaseline) {
            console.error(`- ${b.file}::${b.kind}::${b.text}  (${b.ticket})`);
        }

        console.error('');
    }

    return {exitCode: 1, ...result, implementation: implementationResult, moduleScope: moduleScopeResult};
}

function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-config-template-ssot.mjs');
        console.log('');
        console.log('Fails when a config.template.mjs leaf default reads process.env inline');
        console.log('(outside the BASELINE), when a BASELINE row no longer matches a violation,');
        console.log('when ai/ implementation code adds mechanical ADR-19 AiConfig SSOT violations,');
        console.log('or when ai/ implementation code adds module-scope AiConfig leaf captures.');
        process.exit(0);
    }

    const {exitCode} = runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}
