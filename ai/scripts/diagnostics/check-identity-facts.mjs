#!/usr/bin/env node

/**
 * @plane in-plane
 */
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/diagnostics/check-identity-facts.mjs`
 * matches the sibling pattern of `ai/scripts/diagnostics/check-retired-primitives.mjs` and
 * `ai/scripts/diagnostics/check-substrate-size.mjs` in `ai/scripts/diagnostics/`;
 * all are mechanical enforcement scripts for Agent OS / identity substrate validation;
 * sibling-file-lift applies; no novel directory choice.
 *
 * @summary Checks single-valued Neo identity FACT mirrors against their source surfaces.
 * @see learn/agentos/decisions/0018-neo-identity-source-of-truth-model.md
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

const SERVER_POLICIES = {
    'knowledge-base': {
        label   : 'Knowledge Base',
        frontier: true
    },
    'memory-core': {
        label   : 'Memory Core',
        frontier: true
    },
    'github-workflow': {
        label   : 'GitHub Workflow',
        frontier: true
    },
    'neural-link': {
        label   : 'Neural Link',
        frontier: true
    },
    'file-system': {
        label    : 'File System',
        frontier : false,
        rationale: 'frontier harnesses already provide native file tools; file-system is for Neo.ai.Agent local loops'
    }
};

const DISPLAY_ORDER = [
    'knowledge-base',
    'memory-core',
    'github-workflow',
    'neural-link',
    'file-system'
];

const CONFIG_TEMPLATE_POLICIES = [
    {
        file    : '.codex/config.template.toml',
        audience: 'frontier harness template',
        expected: 'frontier'
    }
];

const NODE_MIRRORS = [
    {
        file       : 'learn/agentos/cloud-deployment/Day0Tutorial.md',
        expectation: ({nodeMajor}) => `Node.js ${nodeMajor}+`
    }
];

const MCP_FACT_MIRRORS = [
    {
        file        : '.agents/skills/neo-identity-update/references/facts-ledger.md',
        expectations: context => [
            `functional = ${context.functionalServers.length}`,
            `Frontier-harness defaults expose ${context.frontierServers.length}`,
            ...context.functionalServers.map(server => server.id)
        ]
    },
    {
        file        : 'README.md',
        expectations: context => context.functionalServers.map(server => `${server.label} MCP server`)
    },
    {
        file        : 'learn/benefits/body/ApplicationEngine.md',
        expectations: context => [
            `${toWord(context.frontierServers.length)} frontier-harness`,
            ...context.frontierServers.map(server => server.label),
            ...context.internalOnlyServers.map(server => `${server.label} MCP server`)
        ]
    },
    {
        file        : 'apps/portal/index.html',
        expectations: context => [
            joinLabels(context.frontierServers),
            ...context.internalOnlyServers.map(server => `${server.label} MCP server`)
        ]
    },
    {
        file        : 'buildScripts/docs/seo/generate.mjs',
        expectations: context => [
            joinLabels(context.frontierServers),
            ...context.internalOnlyServers.map(server => server.label)
        ]
    }
];

/**
 * Reads a repository file as UTF-8.
 * @param {String} root Repository root.
 * @param {String} relPath Repository-relative path.
 * @returns {String}
 */
function readText(root, relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8')
}

/**
 * Reads and parses a repository JSON file.
 * @param {String} root Repository root.
 * @param {String} relPath Repository-relative path.
 * @returns {Object}
 */
function readJson(root, relPath) {
    return JSON.parse(readText(root, relPath))
}

/**
 * Converts a small positive integer to the prose form used by public mirrors.
 * @param {Number} value Integer value.
 * @returns {String}
 */
function toWord(value) {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

    return words[value] || String(value)
}

/**
 * @param {Array<{label: String}>} servers Ordered server policy entries.
 * @returns {String}
 */
function joinLabels(servers) {
    const labels = servers.map(server => server.label);

    if (labels.length <= 2) {
        return labels.join(' and ')
    }

    return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

/**
 * Sorts server IDs by the identity ledger's display order, with unknowns last.
 * @param {String[]} ids Server IDs.
 * @returns {String[]}
 */
function sortServerIds(ids) {
    return [...ids].sort((a, b) => {
        const ai = DISPLAY_ORDER.indexOf(a);
        const bi = DISPLAY_ORDER.indexOf(b);

        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;

        return ai - bi
    })
}

/**
 * @param {Object} packageJson Parsed package.json.
 * @returns {Array<{id: String, script: String, command: String, label: String, frontier: Boolean, rationale: String}>} `rationale` only present on frontier servers.
 */
function deriveMcpServers(packageJson) {
    const scripts = packageJson.scripts || {};
    const prefix  = 'ai:mcp-server-';

    return sortServerIds(Object.keys(scripts)
        .filter(script => script.startsWith(prefix))
        .map(script => script.slice(prefix.length)))
        .map(id => {
            const policy = SERVER_POLICIES[id];

            return {
                id,
                script : `${prefix}${id}`,
                command: scripts[`${prefix}${id}`],
                ...policy
            }
        })
}

/**
 * Extracts every `ai:mcp-server-*` command referenced by a config template.
 * @param {String} text File contents.
 * @returns {String[]}
 */
function extractTemplateMcpServers(text) {
    return sortServerIds([...text.matchAll(/ai:mcp-server-([a-z0-9-]+)/g)].map(match => match[1]))
}

/**
 * Pushes a failure record.
 * @param {Array<Object>} failures Mutable failure list.
 * @param {String} surface Stale surface.
 * @param {String} message Human-readable failure.
 * @param {String} source Source-of-truth pointer.
 */
function fail(failures, surface, message, source) {
    failures.push({surface, message, source})
}

/**
 * Compares two server ID sets.
 * @param {Object} options
 * @param {String[]} options.actual Actual IDs.
 * @param {String[]} options.expected Expected IDs.
 * @returns {{missing: String[], unexpected: String[]}}
 */
function diffSets({actual, expected}) {
    return {
        missing   : expected.filter(id => !actual.includes(id)),
        unexpected: actual.filter(id => !expected.includes(id))
    }
}

/**
 * @param {String[]} ids Server IDs.
 * @returns {String}
 */
function formatIds(ids) {
    return ids.length ? ids.join(', ') : '(none)'
}

/**
 * Validates the package script manifest itself before using it as a source surface.
 * @param {Array<Object>} failures Mutable failure list.
 * @param {Array<Object>} servers Derived server entries.
 */
function checkServerPolicies(failures, servers) {
    for (const server of servers) {
        if (!server.label) {
            fail(
                failures,
                'package.json',
                `script ${server.script} has no identity policy; add its label and audience split to check-identity-facts.mjs.`,
                'package.json scripts matching ai:mcp-server-* plus SERVER_POLICIES'
            );
            continue;
        }

        const expectedPath = `./ai/mcp/server/${server.id}/mcp-server.mjs`;
        if (!server.command.includes(expectedPath)) {
            fail(
                failures,
                'package.json',
                `${server.script} points to "${server.command}", expected it to reference ${expectedPath}.`,
                'package.json scripts matching ai:mcp-server-*'
            );
        }
    }
}

/**
 * @param {Array<Object>} failures Mutable failure list.
 * @param {Object} context Derived identity context.
 */
function checkNodeFacts(failures, context) {
    const {root, packageJson} = context;
    const nodeFloor           = packageJson.engines?.node;

    if (!nodeFloor) {
        fail(failures, 'package.json', 'missing engines.node.', 'package.json engines.node');
        return;
    }

    const nodeMajor = nodeFloor.match(/>=\s*(\d+)\./)?.[1];
    if (!nodeMajor) {
        fail(
            failures,
            'package.json',
            `engines.node "${nodeFloor}" does not expose a parseable >=<major>.x floor.`,
            'package.json engines.node'
        );
        return;
    }

    const packageLock   = readJson(root, 'package-lock.json');
    const lockNodeFloor = packageLock.packages?.['']?.engines?.node;

    if (lockNodeFloor !== nodeFloor) {
        fail(
            failures,
            'package-lock.json',
            `root package engines.node is "${lockNodeFloor || '<missing>'}", expected "${nodeFloor}".`,
            'package.json engines.node'
        );
    }

    for (const mirror of NODE_MIRRORS) {
        const expected = mirror.expectation({nodeFloor, nodeMajor});
        const text     = readText(root, mirror.file);

        if (!text.includes(expected)) {
            fail(
                failures,
                mirror.file,
                `missing Node floor mirror "${expected}".`,
                'package.json engines.node'
            );
        }
    }

    const portalIndex = readText(root, 'apps/portal/index.html');
    if (portalIndex.includes('softwareRequirements') && !portalIndex.includes(nodeMajor)) {
        fail(
            failures,
            'apps/portal/index.html',
            `softwareRequirements is present but does not include the Node major "${nodeMajor}" from "${nodeFloor}".`,
            'package.json engines.node'
        );
    }

    context.nodeFloor = nodeFloor;
    context.nodeMajor = nodeMajor;
}

/**
 * @param {Array<Object>} failures Mutable failure list.
 * @param {Object} context Derived identity context.
 */
function checkMcpTemplateFacts(failures, context) {
    const expectedFrontierIds = context.frontierServers.map(server => server.id);

    for (const template of CONFIG_TEMPLATE_POLICIES) {
        const actualIds  = extractTemplateMcpServers(readText(context.root, template.file));
        const expected   = template.expected === 'frontier' ? expectedFrontierIds : context.functionalServers.map(server => server.id);
        const diff       = diffSets({actual: actualIds, expected});
        const hasFailure = diff.missing.length || diff.unexpected.length;

        if (!hasFailure) continue;

        fail(
            failures,
            template.file,
            `${template.audience} MCP set drift. Missing: ${formatIds(diff.missing)}. Unexpected: ${formatIds(diff.unexpected)}. Expected: ${formatIds(expected)}.`,
            'package.json ai:mcp-server-* scripts + facts-ledger frontier-harness audience split'
        );
    }
}

/**
 * @param {Array<Object>} failures Mutable failure list.
 * @param {Object} context Derived identity context.
 */
function checkMcpMirrorFacts(failures, context) {
    for (const mirror of MCP_FACT_MIRRORS) {
        const text         = readText(context.root, mirror.file);
        const expectations = mirror.expectations(context);

        for (const expected of expectations) {
            if (!expected || text.includes(expected)) continue;

            fail(
                failures,
                mirror.file,
                `missing MCP fact mirror "${expected}".`,
                'package.json ai:mcp-server-* scripts + SERVER_POLICIES audience split'
            );
        }
    }
}

/**
 * Checks identity facts and returns a report without exiting.
 * @param {{root: String}} [options] `root` optional (defaults to the repo root).
 * @returns {{failures: Array<Object>, context: Object}}
 */
export function runCheck({root = ROOT_DIR} = {}) {
    const packageJson         = readJson(root, 'package.json');
    const failures            = [];
    const functionalServers   = deriveMcpServers(packageJson);
    const frontierServers     = functionalServers.filter(server => server.frontier);
    const internalOnlyServers = functionalServers.filter(server => !server.frontier);
    const context             = {
        root,
        packageJson,
        functionalServers,
        frontierServers,
        internalOnlyServers
    };

    checkServerPolicies(failures, functionalServers);
    checkNodeFacts(failures, context);
    checkMcpTemplateFacts(failures, context);
    checkMcpMirrorFacts(failures, context);

    return {failures, context}
}

/**
 * @param {Array<Object>} failures Failure records.
 */
function printFailures(failures) {
    console.error('[check-identity-facts] FAIL: identity FACT drift detected.\n');

    for (const failure of failures) {
        console.error(`- ${failure.surface}: ${failure.message}`);
        console.error(`  Source of truth: ${failure.source}\n`);
    }
}

/**
 * @param {Object} context Derived identity context.
 */
function printSuccess(context) {
    console.log('[check-identity-facts] OK');
    console.log(`- Node floor: ${context.nodeFloor} (package.json -> package-lock.json + known docs mirrors)`);
    console.log(`- Functional MCP servers: ${context.functionalServers.length} (${formatIds(context.functionalServers.map(server => server.id))})`);
    console.log(`- Frontier harness templates: ${context.frontierServers.length} (${formatIds(context.frontierServers.map(server => server.id))})`);
    if (context.internalOnlyServers.length) {
        const notes = context.internalOnlyServers.map(server => `${server.id} (${server.rationale})`).join('; ');
        console.log(`- Internal-only MCP servers: ${notes}`);
    }
}

function main() {
    const rootIndex = process.argv.indexOf('--root');
    if (rootIndex !== -1 && !process.argv[rootIndex + 1]) {
        console.error('[check-identity-facts] --root requires a path argument.');
        process.exit(2);
    }

    const root = rootIndex === -1 ? ROOT_DIR : path.resolve(process.argv[rootIndex + 1]);

    const {failures, context} = runCheck({root});

    if (failures.length) {
        printFailures(failures);
        process.exit(1);
    }

    printSuccess(context);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
