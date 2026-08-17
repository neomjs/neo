import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import * as yaml      from 'js-yaml';
import path           from 'node:path';

import {SCAN_SURFACE as BOUNDARY_SURFACE}        from '../../../../../../buildScripts/util/check-engine-brain-boundary.mjs';
import {SCAN_SURFACE as CONFIG_TEMPLATE_SURFACE} from '../../../../../../ai/scripts/lint/lint-config-template-ssot.mjs';
import {SCAN_SURFACE as ENTRYPOINT_SURFACE}      from '../../../../../../ai/scripts/lint/lint-npm-script-entrypoints.mjs';
import {SCAN_SURFACE as FIXED_SLEEP_SURFACE}     from '../../../../../../buildScripts/util/check-fixed-sleeps.mjs';
import {SCAN_SURFACE as GUARD_CI_PARITY_SURFACE} from '../../../../../../ai/scripts/lint/lint-guard-ci-parity.mjs';
import {SCAN_SURFACE as MCP_LOCATION_SURFACE}    from '../../../../../../ai/scripts/lint/lint-mcp-test-locations.mjs';
import {SCAN_SURFACE as SCRIPT_PLANE_SURFACE}    from '../../../../../../ai/scripts/lint/lint-script-plane.mjs';
import {SCAN_SURFACE as RETRY_BOUND_SURFACE}     from '../../../../../../ai/scripts/lint/lint-retry-bounds.mjs';
import {DEFAULT_SCAN_PATHS as ARCHAEOLOGY_PATHS} from '../../../../../../buildScripts/util/check-ticket-archaeology.mjs';

/**
 * @summary The scanned ⊆ watched invariant for path-filtered lint workflows, as a mechanical fact.
 *
 * Every path-filtered lint workflow and the lint it runs are two hand-maintained copies of one
 * fact: which files can change the lint's verdict. When they diverge, nothing red exists at the
 * moment of divergence — an introducing PR lands ungated and the NEXT unrelated run turns red
 * (late, misattributed enforcement: the guard present, correct, and never run). This spec is the
 * always-on tooth: the unit lane runs on every PR, so the divergence itself becomes the red.
 *
 * Enforcement model:
 * - `imported` registry entries take the lint's own exported scan surface as SSOT — a lint that
 *   gains a scan root widens its exported surface in the same edit, and an unwidened workflow
 *   filter fails here without any registry change.
 * - `declared` entries carry the surface as reviewed constants beside the workflow name, verified
 *   against the lint's source at registration; converting them to `imported` is the follow-up path.
 * - The completeness walk derives the workflow set from `.github/workflows/*-lint.yml`: a new
 *   path-filtered lint workflow must register here or this spec fails; a registry entry whose
 *   workflow disappeared fails as stale.
 * - Coverage is asserted on representative sample paths generated from each surface glob (deep and
 *   shallow), matched against the workflow's patterns per trigger with GitHub-Actions glob
 *   semantics ('**' spans zero or more segments). A trigger without a `paths` filter is covered by
 *   construction — it always runs.
 * - Reproducibility inputs are part of the surface: every registered workflow must also watch its
 *   own lint script and its own workflow file.
 */

const ROOT_DIR      = path.resolve(process.cwd());
const WORKFLOWS_DIR = path.join(ROOT_DIR, '.github/workflows');

/**
 * The registry: one entry per path-filtered lint workflow.
 *
 * `surface` lists every glob (or literal file) whose changes can change the lint's verdict.
 * `scriptRel` is the lint implementation the workflow executes (a verdict input by definition).
 * `source` marks whether the surface is imported from the lint (SSOT) or declared here.
 */
const REGISTRY = Object.freeze({
    'adr-seam-table-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-adr-seam-table.mjs',
        source   : 'declared',
        surface  : ['learn/agentos/decisions/**']
    },
    'aiconfig-antipattern-lint.yml': {
        scriptRel: 'buildScripts/util/check-aiconfig-antipatterns.mjs',
        source   : 'declared',
        surface  : ['ai/**/*.mjs']
    },
    'aiconfig-test-mutation-lint.yml': {
        scriptRel: 'buildScripts/util/check-aiconfig-test-mutation.mjs',
        source   : 'declared',
        surface  : ['test/**/*.mjs']
    },
    'atomic-write-shape-lint.yml': {
        scriptRel: 'buildScripts/util/check-atomic-write-shape.mjs',
        source   : 'declared',
        surface  : ['ai/**/*.mjs']
    },
    'script-plane-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-script-plane.mjs',
        source   : 'imported',
        surface  : SCRIPT_PLANE_SURFACE
    },
    'spec-retirement-lint.yml': {
        scriptRel: 'buildScripts/util/check-spec-retirement.mjs',
        source   : 'declared',
        surface  : ['test/playwright/unit/**']
    },
    // Whole-tree by construction: the guard answers "does every `src/` package have values in BOTH
    // neo themes, or a baselined justification", which is a property of the tree rather than of a
    // diff. A package reaches zero coverage on the commit that adds its structure sheet, and that
    // commit may touch no theme file at all — so the surface is the whole SCSS tree, not the
    // theme directories the guard's verdict happens to be about.
    'theme-coverage-lint.yml': {
        scriptRel: 'buildScripts/util/check-theme-coverage.mjs',
        source   : 'declared',
        surface  : ['resources/scss/**/*.scss']
    },
    'config-template-ssot-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-config-template-ssot.mjs',
        source   : 'imported',
        surface  : CONFIG_TEMPLATE_SURFACE
    },
    'engine-brain-boundary-lint.yml': {
        scriptRel: 'buildScripts/util/check-engine-brain-boundary.mjs',
        source   : 'imported',
        surface  : BOUNDARY_SURFACE
    },
    'npm-script-entrypoint-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-npm-script-entrypoints.mjs',
        source   : 'imported',
        surface  : ENTRYPOINT_SURFACE
    },
    'content-logical-identity-lint.yml': {
        scriptRel: 'buildScripts/util/check-content-logical-identity.mjs',
        source   : 'declared',
        surface  : ['resources/content/archive/**']
    },
    'fixed-sleep-lint.yml': {
        scriptRel: 'buildScripts/util/check-fixed-sleeps.mjs',
        source   : 'imported',
        surface  : FIXED_SLEEP_SURFACE
    },
    'guard-ci-parity-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-guard-ci-parity.mjs',
        source   : 'imported',
        surface  : GUARD_CI_PARITY_SURFACE
    },
    'identity-engine-coherence-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-identity-engine-coherence.mjs',
        source   : 'declared',
        surface  : [
            'ai/graph/identityRoots.mjs',
            'ai/scripts/fleet/deriveFleetRoster.mjs',
            'learn/agentos/ModelStats.md'
        ]
    },
    'identity-vocabulary-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-identity-vocabulary.mjs',
        source   : 'declared',
        surface  : ['ai/mcp/server/*/openapi.yaml']
    },
    'jsdoc-type-lint.yml': {
        scriptRel: 'buildScripts/util/check-jsdoc-types.mjs',
        source   : 'declared',
        surface  : [
            'ai/**/*.mjs',
            'apps/**/*.mjs',
            'docs/app/**/*.mjs',
            'examples/**/*.mjs',
            'src/**/*.mjs'
        ]
    },
    'mcp-test-location-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-mcp-test-locations.mjs',
        source   : 'imported',
        surface  : MCP_LOCATION_SURFACE
    },
    'openapi-service-parity-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-openapi-service-parity.mjs',
        source   : 'declared',
        surface  : [
            'ai/mcp/ToolService.mjs',
            'ai/mcp/server/**/*.mjs',
            'ai/mcp/server/**/openapi.yaml',
            'ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs',
            'ai/services.mjs',
            'ai/services/**/*.mjs'
        ]
    },
    'retry-bound-classification-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-retry-bounds.mjs',
        source   : 'imported',
        surface  : RETRY_BOUND_SURFACE
    },
    'skill-manifest-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-skill-manifest.mjs',
        source   : 'declared',
        surface  : ['.agents/skills/**', '.claude/skills/**']
    },
    'ticket-archaeology-lint.yml': {
        scriptRel: 'buildScripts/util/check-ticket-archaeology.mjs',
        source   : 'imported',
        surface  : ARCHAEOLOGY_PATHS.map(entry =>
            entry.includes('.') ? entry : `${entry}/**/*.mjs`)
    },
    'tree-json-lint.yml': {
        scriptRel: 'ai/scripts/lint/lint-tree-json.mjs',
        source   : 'declared',
        surface  : ['apps/portal/llms.txt', 'apps/portal/sitemap.xml', 'learn/**']
    }
});

/**
 * Converts a GitHub-Actions path-filter glob into an anchored RegExp.
 * '**' spans zero or more path segments; '*' spans within one segment.
 * @param {String} glob Path-filter pattern
 * @returns {RegExp}
 */
function globToRegExp(glob) {
    const segments = glob.split('/');
    let   out      = '^';

    segments.forEach((segment, index) => {
        const last = index === segments.length - 1;

        if (segment === '**') {
            out += last ? '.*' : '(?:[^/]+/)*'
        } else {
            out += segment
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '[^/]*');
            last || (out += '/')
        }
    });

    return new RegExp(`${out}$`)
}

/**
 * Generates representative concrete paths a surface glob would scan — one deep, one shallow —
 * so coverage is asserted on files, not on glob-subsumption theory.
 * @param {String} glob Surface pattern (or literal file path)
 * @returns {String[]}
 */
function samplesFromGlob(glob) {
    if (!glob.includes('*')) return [glob];

    // Path filters match FILES: a trailing '**' must sample concrete files under the
    // directory, never the directory path itself.
    if (glob.endsWith('/**')) {
        const base = glob.slice(0, -3);

        return [`${base}/deep/nested/sample.txt`, `${base}/sample.txt`]
    }

    const deep    = glob.replace(/\*\*/g, 'deep/nested').replace(/\*/g, 'sample');
    const shallow = glob.replace(/\/\*\*\//g, '/').replace(/\/\*\*/g, '').replace(/\*\*\//g, '').replace(/\*/g, 'sample');

    return [...new Set([deep, shallow])]
}

/**
 * Names every surface sample a trigger's watch patterns fail to match.
 * A trigger without a paths filter watches everything — no gaps by construction.
 * @param {String[]} surface Surface globs
 * @param {String[]|null} watched Trigger paths filter, or null when unfiltered
 * @returns {String[]} Unmatched sample paths
 */
function coverageGaps(surface, watched) {
    if (!watched) return [];

    const matchers = watched.map(globToRegExp);

    return surface
        .flatMap(samplesFromGlob)
        .filter(sample => !matchers.some(matcher => matcher.test(sample)))
}

/**
 * Reads a workflow's per-trigger paths filters. YAML parses the `on:` key as boolean true,
 * so both spellings are consulted.
 * @param {String} workflowName File name under .github/workflows
 * @returns {Object} {pull_request: String[]|null, push: String[]|null}
 */
function readWorkflowPaths(workflowName) {
    const doc      = yaml.load(fs.readFileSync(path.join(WORKFLOWS_DIR, workflowName), 'utf8'));
    const triggers = doc.on ?? doc[true] ?? {};

    return {
        pull_request: triggers.pull_request?.paths ?? null,
        push        : triggers.push?.paths ?? null
    }
}

test.describe('lint workflow scan-root parity (scanned ⊆ watched, mechanically)', () => {
    const lintWorkflows = fs.readdirSync(WORKFLOWS_DIR).filter(name => /-lint\.ya?ml$/.test(name));

    test('completeness: every path-filtered lint workflow is registered; no registry entry is stale', () => {
        const pathFiltered = lintWorkflows.filter(name => {
            const {pull_request, push} = readWorkflowPaths(name);

            return Boolean(pull_request || push)
        });

        const unregistered = pathFiltered.filter(name => !REGISTRY[name]);
        const stale        = Object.keys(REGISTRY).filter(name => !lintWorkflows.includes(name));

        expect(unregistered, 'a new path-filtered lint workflow must register its scan surface here '
            + '(imported from the lint where possible, declared otherwise)').toEqual([]);
        expect(stale, 'a registry entry must not outlive its workflow').toEqual([]);
    });

    test('registered surfaces are non-empty lists', () => {
        for (const [name, entry] of Object.entries(REGISTRY)) {
            expect(Array.isArray(entry.surface) && entry.surface.length > 0,
                `${name}: the scan surface must be a non-empty list`).toBe(true)
        }
    });

    for (const [workflowName, entry] of Object.entries(REGISTRY)) {
        test(`${workflowName}: every scan surface sample is watched on both triggers`, () => {
            const triggerPaths = readWorkflowPaths(workflowName);

            for (const trigger of ['pull_request', 'push']) {
                const gaps = coverageGaps(entry.surface, triggerPaths[trigger]);

                expect(gaps, `${workflowName} ${trigger}: these scanned paths would not re-run the lint — `
                    + `the introducing PR lands ungated and the next unrelated run turns red`).toEqual([])
            }
        });

        test(`${workflowName}: watches its own lint script and itself`, () => {
            const triggerPaths = readWorkflowPaths(workflowName);
            const selfInputs   = [entry.scriptRel, `.github/workflows/${workflowName}`];

            expect(fs.existsSync(path.join(ROOT_DIR, entry.scriptRel)),
                `${workflowName}: registered lint script must exist`).toBe(true);

            for (const trigger of ['pull_request', 'push']) {
                const gaps = coverageGaps(selfInputs, triggerPaths[trigger]);

                expect(gaps, `${workflowName} ${trigger}: the lint's own implementation and workflow `
                    + `are verdict inputs and must re-run it`).toEqual([])
            }
        })
    }

    // ---- the guard can go red: synthetic fixtures drive both failure directions ----

    test('red direction: an unwatched scan root is reported as a gap', () => {
        const gaps = coverageGaps(['ai/**/*.mjs', 'docs/**/*.md'], ['ai/**/*.mjs']);

        expect(gaps).toEqual(['docs/deep/nested/sample.md', 'docs/sample.md'])
    });

    test('red direction: removing a watch pattern surfaces the orphaned samples', () => {
        const surface = ['ai/**/*.mjs', 'test/**/*.mjs'];
        const covered = coverageGaps(surface, ['ai/**/*.mjs', 'test/**/*.mjs']);
        const removed = coverageGaps(surface, ['ai/**/*.mjs']);

        expect(covered).toEqual([]);
        expect(removed).toEqual(['test/deep/nested/sample.mjs', 'test/sample.mjs'])
    });

    test('glob semantics: ** spans zero segments, * stays within one', () => {
        expect(globToRegExp('ai/**/*.mjs').test('ai/direct.mjs')).toBe(true);
        expect(globToRegExp('ai/**/*.mjs').test('ai/a/b/c/deep.mjs')).toBe(true);
        expect(globToRegExp('ai/**/*.mjs').test('src/other.mjs')).toBe(false);
        expect(globToRegExp('ai/mcp/server/*/openapi.yaml').test('ai/mcp/server/kb/openapi.yaml')).toBe(true);
        expect(globToRegExp('ai/mcp/server/*/openapi.yaml').test('ai/mcp/server/a/b/openapi.yaml')).toBe(false);
        expect(globToRegExp('learn/**').test('learn/tree.json')).toBe(true);
        expect(globToRegExp('learn/**').test('learn/a/b/deep.md')).toBe(true)
    });

    test('an unfiltered trigger is covered by construction', () => {
        expect(coverageGaps(['anything/**'], null)).toEqual([])
    })
});
