/**
 * @module ai/scripts/lint/lint-fleet-vocabulary-parity
 * @summary The mechanical binding between the Brain-side FM vocabulary AUTHORITIES and the
 * cockpit's operable-cold TWINS — the enforcement half of the src/ai/fleet dissolution.
 *
 * The realms deliberately share NO imports: `apps/agentos/config/*` twins render/form with the
 * same vocabulary the `ai/services/fleet/*` authorities validate, and THIS lint is what makes the
 * duplication safe — every live namespace export is dispositioned as paired data, paired helper,
 * or a reasoned realm-only member. Constants are deep-equaled and shared pure helpers execute over
 * drift-sensitive fixtures on both sides. A divergence or unclassified export names its surface
 * and reddens CI; silent export growth (the convention-without-a-lint failure class) cannot exist.
 *
 * Consumed three ways: lint-staged (pre-commit, vocabulary globs), the CI lint job, and the unit
 * spec `test/playwright/unit/apps/agentos/config/fleetVocabularyParity.spec.mjs` — which also
 * red-proves the comparator against an induced drift, so the mechanism itself is witnessed.
 */

import * as authorityCockpit from '../../services/fleet/fleetCockpitStatus.mjs';
import * as authorityHarness from '../../services/fleet/harnessTypes.mjs';
import * as authorityMcp     from '../../services/fleet/mcpServers.mjs';
import * as authorityWire    from '../../services/fleet/fleetWireMethods.mjs';

import * as twinHarness from '../../../apps/agentos/config/harnessTypes.mjs';
import * as twinMcp     from '../../../apps/agentos/config/mcpServers.mjs';
import * as twinSources from '../../../apps/agentos/config/cockpitSources.mjs';
import * as twinWire    from '../../../apps/agentos/config/fleetWireMethods.mjs';

import process         from 'node:process';
import {fileURLToPath} from 'node:url';

/**
 * @summary Stable deep-equality via canonical JSON — sufficient for the frozen data + plain
 * helper outputs this vocabulary consists of (no functions, dates, or cycles cross this seam).
 * @param {*} a
 * @param {*} b
 * @returns {Boolean}
 * @private
 */
function sameShape(a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * @summary Run one helper on both sides, capturing value or thrown message — parity holds only
 * when BOTH the outcome class and its content agree.
 * @param {Function} fn
 * @param {Array} args
 * @returns {{threw: Boolean, value: *}}
 * @private
 */
function outcome(fn, args) {
    try {
        return {threw: false, value: fn(...args)}
    } catch (error) {
        return {threw: true, value: error.message}
    }
}

/**
 * @summary Verifies that every live namespace export has exactly one declared disposition and
 * every declared disposition still names a live export.
 * @param {Object} options
 * @param {Object} options.namespaces Namespace pairs keyed by stable surface name.
 * @param {Array} options.dataPairs Registered deep-equality pairs.
 * @param {Array} options.helperCases Registered behavior-parity pairs.
 * @param {Array} options.realmOnlyExports Reasoned one-sided exports.
 * @returns {String[]}
 * @private
 */
function censusExportDispositions({namespaces, dataPairs, helperCases, realmOnlyExports}) {
    const
        dispositions   = new Map(),
        violations     = [],
        addDisposition = (surface, side, name, kind, reason = null) => {
            const key     = `${surface}:${side}:${name}`;
            const entries = dispositions.get(key) || [];

            entries.push({kind, reason});
            dispositions.set(key, entries)
        };

    dataPairs.forEach(([surface, name]) => {
        addDisposition(surface, 'authority', name, 'data-pair');
        addDisposition(surface, 'twin', name, 'data-pair')
    });

    helperCases.forEach(([surface, name]) => {
        addDisposition(surface, 'authority', name, 'helper-pair');
        addDisposition(surface, 'twin', name, 'helper-pair')
    });

    realmOnlyExports.forEach(([surface, side, name, reason]) => {
        addDisposition(surface, side, name, 'realm-only', reason);

        if (typeof reason !== 'string' || !reason.trim()) {
            violations.push(`${surface}.${side}.${name}: realm-only disposition requires a reason`)
        }
    });

    Object.entries(namespaces).forEach(([surface, sides]) => {
        ['authority', 'twin'].forEach(side => {
            const namespace = sides[side] || {};

            Object.keys(namespace).forEach(name => {
                const entries = dispositions.get(`${surface}:${side}:${name}`) || [];

                if (entries.length === 0) {
                    violations.push(`${surface}.${side}.${name}: export is unclassified`)
                } else if (entries.length > 1) {
                    violations.push(`${surface}.${side}.${name}: export has ${entries.length} dispositions`)
                }
            });

            for (const [key, entries] of dispositions) {
                const [entrySurface, entrySide, name] = key.split(':');

                if (entrySurface === surface && entrySide === side && !Object.hasOwn(namespace, name)) {
                    violations.push(`${surface}.${side}.${name}: ${entries[0].kind} disposition names a missing export`)
                }
            }
        })
    });

    return violations
}

/**
 * @summary Compare the full FM vocabulary between authority and twin namespaces.
 * @param {Object} sides
 * @param {Object} sides.authority `{mcp, harness, wire, cockpit}` — the Brain-side namespaces.
 * @param {Object} sides.twin `{mcp, harness, wire, sources}` — the app-side namespaces.
 * @returns {String[]} Violations, one named surface each; empty = parity holds.
 */
export function compareFleetVocabulary({authority, twin}) {
    const
        violations = [],
        namespaces = {
            mcp    : {authority: authority.mcp,     twin: twin.mcp},
            harness: {authority: authority.harness, twin: twin.harness},
            wire   : {authority: authority.wire,    twin: twin.wire},
            cockpit: {authority: authority.cockpit, twin: twin.sources}
        };

    // REMOTE_MCP_CREDENTIAL_ENV_VAR is deliberately absent: credential env-var vocabulary is
    // Brain-only (no app consumer exists; the App Worker reads no process environment).
    const dataPairs = [
        ['mcp',     'MCP_SERVERS',              authority.mcp.MCP_SERVERS,               twin.mcp.MCP_SERVERS],
        ['mcp',     'TENANT_MCP_HARNESS_TYPES', authority.mcp.TENANT_MCP_HARNESS_TYPES,  twin.mcp.TENANT_MCP_HARNESS_TYPES],
        ['harness', 'HARNESS_TYPES',            authority.harness.HARNESS_TYPES,         twin.harness.HARNESS_TYPES],
        ['wire',    'FLEET_WIRE_METHODS',       authority.wire.FLEET_WIRE_METHODS,       twin.wire.FLEET_WIRE_METHODS],
        ['wire',    'FLEET_CREDENTIAL_METHODS', authority.wire.FLEET_CREDENTIAL_METHODS, twin.wire.FLEET_CREDENTIAL_METHODS],
        ['wire',    'FLEET_WIRE_PROTOCOL_VERSIONS', authority.wire.FLEET_WIRE_PROTOCOL_VERSIONS, twin.wire.FLEET_WIRE_PROTOCOL_VERSIONS],
        ['wire',    'FLEET_WIRE_CAPABILITIES', authority.wire.FLEET_WIRE_CAPABILITIES, twin.wire.FLEET_WIRE_CAPABILITIES],
        ['wire',    'FLEET_WIRE_REQUIRED_CAPABILITIES', authority.wire.FLEET_WIRE_REQUIRED_CAPABILITIES, twin.wire.FLEET_WIRE_REQUIRED_CAPABILITIES],
        ['wire',    'FLEET_WIRE_RESPONSE_STATES', authority.wire.FLEET_WIRE_RESPONSE_STATES, twin.wire.FLEET_WIRE_RESPONSE_STATES],
        ['wire',    'FLEET_WIRE_ENVELOPE_SCHEMA', authority.wire.FLEET_WIRE_ENVELOPE_SCHEMA, twin.wire.FLEET_WIRE_ENVELOPE_SCHEMA],
        ['cockpit', 'FLEET_COCKPIT_SOURCES',    authority.cockpit.FLEET_COCKPIT_SOURCES, twin.sources.FLEET_COCKPIT_SOURCES]
    ];

    dataPairs.forEach(([, name, authorityValue, twinValue]) => {
        if (!sameShape(authorityValue, twinValue)) {
            violations.push(`${name}: authority and twin diverge`)
        }
    });

    // Helper-behavior parity over drift-sensitive fixtures: same inputs, same outcome class, same
    // content — a fork in validation or projection logic reddens here even when the data agrees.
    const helperCases = [
        ['mcp', 'listMcpServers',                  authority.mcp.listMcpServers,          twin.mcp.listMcpServers,          [[]]],
        ['mcp', 'defaultMcpMatrix',                authority.mcp.defaultMcpMatrix,        twin.mcp.defaultMcpMatrix,        [[]]],
        ['mcp', 'resolveMcpMatrix',                authority.mcp.resolveMcpMatrix,        twin.mcp.resolveMcpMatrix,        [
            [null],
            [{'github-workflow': true}],
            [{'retired-server': true}],
            [{'memory-core': 'truthy-legacy'}]
        ]],
        ['mcp', 'normalizeMcpOverrides',           authority.mcp.normalizeMcpOverrides,   twin.mcp.normalizeMcpOverrides,   [
            [null],
            [{}],
            [{'memory-core': true}],
            [{'github-workflow': true, 'memory-core': true}],
            [{'unknown-server': true}],
            [{'memory-core': 1}],
            [['not-an-object']]
        ]],
        ['mcp', 'supportsTenantMcpTarget',         authority.mcp.supportsTenantMcpTarget, twin.mcp.supportsTenantMcpTarget, [
            ...authority.harness.HARNESS_TYPES.map(entry => [entry.type]),
            ['unregistered-harness']
        ]],
        ['harness', 'listHarnessTypes',            authority.harness.listHarnessTypes,    twin.harness.listHarnessTypes,    [[]]],
        ['harness', 'resolveHarnessType',          authority.harness.resolveHarnessType,  twin.harness.resolveHarnessType,  [
            ...authority.harness.HARNESS_TYPES.map(entry => [entry.type]),
            ['unregistered-harness']
        ]],
        ['wire', 'createFleetWireOffer',           authority.wire.createFleetWireOffer, twin.wire.createFleetWireOffer, [
            []
        ]],
        ['wire', 'createFleetWireProtocolStamp',  authority.wire.createFleetWireProtocolStamp, twin.wire.createFleetWireProtocolStamp, [
            [],
            [1, ['method-schema-v1']]
        ]],
        ['wire', 'selectFleetWireContract',       authority.wire.selectFleetWireContract, twin.wire.selectFleetWireContract, [
            [authority.wire.createFleetWireOffer()],
            [{versions: [0], capabilities: [...authority.wire.FLEET_WIRE_CAPABILITIES]}],
            [{versions: [1], capabilities: []}],
            [{versions: '1', capabilities: []}]
        ]],
        ['wire', 'createFleetWireRequest',        authority.wire.createFleetWireRequest, twin.wire.createFleetWireRequest, [
            ['listAgents', undefined],
            ['listAgents', {page: 1}, {versions: [1], capabilities: [...authority.wire.FLEET_WIRE_CAPABILITIES]}],
            ['getManager', null]
        ]],
        ['wire', 'createFleetWireResponse',       authority.wire.createFleetWireResponse, twin.wire.createFleetWireResponse, [
            [authority.wire.FLEET_WIRE_RESPONSE_STATES.ok, {result: []}],
            [authority.wire.FLEET_WIRE_RESPONSE_STATES.ok, {}],
            [authority.wire.FLEET_WIRE_RESPONSE_STATES.unsupportedProtocol, {error: 'fleet: unsupported wire protocol'}],
            ['invented-state', {}]
        ]],
        ['wire', 'inspectFleetWireResponse',      authority.wire.inspectFleetWireResponse, twin.wire.inspectFleetWireResponse, [
            [authority.wire.createFleetWireResponse(
                authority.wire.FLEET_WIRE_RESPONSE_STATES.ok,
                {result: []}
            )],
            [{ok: true, state: 'invented', protocol: {version: 1, capabilities: []}}],
            [{
                ok      : true,
                protocol: authority.wire.createFleetWireProtocolStamp(),
                state   : authority.wire.FLEET_WIRE_RESPONSE_STATES.ok
            }],
            [authority.wire.createFleetWireResponse(authority.wire.FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: authority.wire.createFleetWireProtocolStamp(2),
                result  : []
            }), authority.wire.createFleetWireOffer()],
            [authority.wire.createFleetWireResponse(authority.wire.FLEET_WIRE_RESPONSE_STATES.ok, {
                protocol: authority.wire.createFleetWireProtocolStamp(1, [
                    ...authority.wire.FLEET_WIRE_CAPABILITIES,
                    'server-only'
                ]),
                result: []
            }), authority.wire.createFleetWireOffer()],
            [{
                ...authority.wire.createFleetWireResponse(
                    authority.wire.FLEET_WIRE_RESPONSE_STATES.ok,
                    {result: []}
                ),
                protocol: {
                    ...authority.wire.createFleetWireProtocolStamp(),
                    ownerPrincipal: 'must-never-cross'
                }
            }, authority.wire.createFleetWireOffer()]
        ]]
    ];

    const realmOnlyExports = [
        ['mcp', 'authority', 'REMOTE_MCP_CREDENTIAL_ENV_VAR', 'deployment credential vocabulary; the App Worker reads no process environment'],
        ['mcp', 'authority', 'normalizeMcpTarget', 'registry-owned target validation; the app emits intent and the Brain is the gate'],
        ['mcp', 'authority', 'default', 'Brain-side aggregate for server consumers; the operable-cold app twin uses named exports'],
        ['harness', 'authority', 'default', 'Brain-side aggregate for server consumers; the operable-cold app twin uses named exports'],
        ['cockpit', 'authority', 'FLEET_COCKPIT_EVENT_TYPES', 'Brain-owned event validation vocabulary; the app twin only names sources'],
        ['cockpit', 'authority', 'boundReason', 'Brain-owned status sanitization; the app twin only names sources'],
        ['cockpit', 'authority', 'createFleetCockpitEvent', 'Brain-owned event assembler; the app twin only names sources'],
        ['cockpit', 'authority', 'createFleetCockpitEventId', 'Brain-owned event identity assembler; the app consumes ids but never mints producer events'],
        ['cockpit', 'authority', 'createFleetCockpitStatus', 'Brain-owned status assembler; the app twin only names sources'],
        ['cockpit', 'authority', 'createNotWiredCapability', 'Brain-owned capability assembler; the app twin only names sources']
    ];

    violations.push(...censusExportDispositions({namespaces, dataPairs, helperCases, realmOnlyExports}));

    helperCases.forEach(([, name, authorityFn, twinFn, argSets]) => {
        if (typeof authorityFn !== 'function' || typeof twinFn !== 'function') {
            violations.push(`${name}: helper missing on ${typeof authorityFn === 'function' ? 'twin' : 'authority'}`);
            return
        }

        argSets.forEach(args => {
            const
                authorityOutcome = outcome(authorityFn, args),
                twinOutcome      = outcome(twinFn, args);

            if (authorityOutcome.threw !== twinOutcome.threw || !sameShape(authorityOutcome.value, twinOutcome.value)) {
                violations.push(`${name} with ${JSON.stringify(args)}: outcomes diverge`)
            }
        })
    });

    return violations
}

/**
 * @summary CLI entry: compare the live modules and exit non-zero on any divergence.
 * @private
 */
function main() {
    const violations = compareFleetVocabulary({
        authority: {mcp: authorityMcp, harness: authorityHarness, wire: authorityWire, cockpit: authorityCockpit},
        twin     : {mcp: twinMcp, harness: twinHarness, wire: twinWire, sources: twinSources}
    });

    if (violations.length > 0) {
        console.error('[lint-fleet-vocabulary-parity] FM vocabulary parity FAILED');
        violations.forEach(violation => console.error(`  - ${violation}`));
        console.error('\nThe cockpit twin (apps/agentos/config/) must mirror the Brain authority (ai/services/fleet/)');
        console.error('in the SAME commit — one registration, two surfaces, zero drift.');
        process.exit(1)
    }

    console.log('[lint-fleet-vocabulary-parity] OK — every export dispositioned; paired data + helper behavior identical across the realm boundary.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
}
