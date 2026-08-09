import {test, expect}     from '@playwright/test';
import * as acorn         from 'acorn';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

import {resolvePlaneDataRoot} from '../../../../../ai/planeConfig.mjs';

/**
 * Guards the heap-observation channel's TRANSPORT, per deployment profile.
 *
 * The channel is a file written by each MCP server about its own V8 heap and read by the
 * orchestrator's deployment-state bridge. Both ends resolve the identical expression —
 * `path.resolve(AiConfig.heapObservation.dir, `${serviceKey}.json`)` — so the code looks
 * symmetric and every in-process witness passes. It shipped anyway with **no shared mount**:
 * each container wrote into its own layer and the orchestrator read its own empty one, so
 * every observation surfaced as `unavailable/absent` on planes deployed from the canonical
 * compose file from the day the channel merged.
 *
 * WHY no existing test could see it. Every witness for this channel runs in ONE process on
 * ONE filesystem, so the write and the read were always the same directory. The failure is
 * not expressible in a fixture that does not cross a container boundary — the property is a
 * topology fact, and the topology lives here.
 *
 * WHY it failed silently rather than loudly. The reporter is deliberately total: a write
 * failure returns `false` rather than escaping, because a service must not die because it
 * could not describe its own heap. But the write did not fail — writing into the container's
 * own layer SUCCEEDS. A successful local write and a delivered one are indistinguishable from
 * the writer's side, so the fail-closed metric (`unavailable/absent`) was published while the
 * envelope reported a healthy reporter.
 *
 * WHY the writer roster is DERIVED, identity-preserving, and never listed. A hardcoded pair
 * silently excludes the third server someone adds next; a key-unpreserving roster cannot tell
 * which SERVER declared which label, so a sibling-attributed key (`knowledge-base` returning
 * `'mc-server'`) would mount the wrong service and pass. Discovery therefore pairs every
 * declaring server directory with its literal key, refuses any override shape it cannot
 * resolve (an indirect or non-plain-method producer must red, never vanish), and binds each
 * declaration to the compose service whose `TARGET_SERVER` build arg names that directory.
 *
 * WHY targets bind EXACTLY, across two independent authorities. A shared final path segment
 * proves nothing: swapping every mount target to a coordinated wrong path leaves a suffix
 * check green. The expected target is built from the config-authoritative chain — the
 * `heapObservation.dir` leaf's own resolve expression (anchor name AND segment, so moving
 * the anchor reds) crossed against `planeConfig`'s relative root — and the compose file's
 * declared in-container plane root (read off a sibling channel's mount). The two must agree,
 * so a mutation on EITHER side fails: config-anchor move, relative-root rename, or a
 * coordinated compose-only target shift.
 *
 * WHY static parsing rather than only `docker compose config`: the mount lines ARE the
 * invariant, and reading them from source is a complete hermetic test of the property. The
 * rendered-config probe is the per-profile complement the repair cycle used; it is not a
 * CI-runnable guard, which is what this file is.
 */

const
    repoRoot        = path.resolve(process.cwd()),
    composePath     = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    devComposePath  = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    configBasePath  = path.join(repoRoot, 'ai/configBase.mjs'),
    planeConfigPath = path.join(repoRoot, 'ai/planeConfig.mjs'),
    mcpServerRoot   = path.join(repoRoot, 'ai/mcp/server'),
    compose         = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    devCompose      = yamlLoad(fs.readFileSync(devComposePath, 'utf8')),
    configBaseText  = fs.readFileSync(configBasePath, 'utf8'),
    planeConfigText = fs.readFileSync(planeConfigPath, 'utf8'),
    READER_SERVICE  = 'orchestrator',
    PARITY_VOLUME   = 'parity-heap-observation';

/**
 * The config-authoritative channel path pieces, proved to definition level: the
 * `heapObservation.dir` leaf's resolve expression (anchor name AND segment), the anchor's
 * DEFINITION (a name-pin alone stays green when the definition moves the runtime path — the
 * cycle-3 residual), the `neoRootDir` definition beneath it, and `planeConfig`'s relative root.
 * Every link fails closed.
 * @returns {{dirSegment: String, dataRootRelative: String}}
 */
function readChannelPathAuthorities() {
    const dirExpr = configBaseText.match(/heapObservation:\s*\{[\s\S]*?dir\s*:\s*leaf\(path\.resolve\(([A-Za-z]+),\s*'([^']+)'\)/);

    // Fail closed: an unmatched regex must not silently assert nothing.
    expect(dirExpr, 'ai/configBase.mjs still declares heapObservation.dir as a leaf(path.resolve(anchor, segment))').toBeTruthy();
    expect(
        dirExpr[1],
        'the heapObservation.dir leaf still anchors on planeDataRootDefault — an anchor move changes the runtime path and must red here'
    ).toBe('planeDataRootDefault');

    expect(
        /const planeDataRootDefault\s*=\s*resolvePlaneDataRoot\(\{rootDir:\s*neoRootDir\}\)/.test(configBaseText),
        'planeDataRootDefault is still DEFINED as resolvePlaneDataRoot({rootDir: neoRootDir}) — a definition-level move changes the runtime path and must red here'
    ).toBe(true);
    expect(
        /const neoRootDir\s*=\s*path\.resolve\(__dirname,\s*'\.\.\/?'\)/.test(configBaseText),
        'neoRootDir is still defined as the configBase-relative repository root'
    ).toBe(true);

    const relative = planeConfigText.match(/dataRootRelative:\s*'([^']+)'/);

    expect(relative, 'ai/planeConfig.mjs still declares PLANE_DEFAULTS.dataRootRelative').toBeTruthy();

    return {dirSegment: dirExpr[2], dataRootRelative: relative[1]}
}

/**
 * The in-container plane root as the COMPOSE file declares it, read off a sibling channel's
 * mount (the orchestrator's `shared-deployment-state-data` target minus its last segment) —
 * never restated here. Cross-asserted against the config-side relative root by the caller, so
 * neither side can drift alone.
 * @param {Object} composeDoc
 * @returns {String}
 */
function readComposePlaneRoot(composeDoc) {
    const anchor = mountsOf(composeDoc, READER_SERVICE).find(entry => entry.volume === 'shared-deployment-state-data');

    expect(anchor, 'the orchestrator still mounts shared-deployment-state-data — the compose-side plane-root anchor').toBeTruthy();

    return anchor.target.replace(/\/[^/]+$/, '')
}

/**
 * Every MCP-server override of `getHeapObservationServiceKey()`, as `{serverDir, key}` pairs —
 * identity-preserving by construction, enumerated STRUCTURALLY (acorn), never by regex shape.
 * A regex recognizes the spelling it expects and silently drops or miscounts every other valid
 * spelling (a space before `()`, a `static async` modifier stack); a class-body walk recognizes
 * the ELEMENT and can refuse its shape. Discovery rules, all fail-closed:
 *
 * - the elected convention is a plain public, non-static, non-async, non-generator, non-computed
 *   instance method whose body is one direct literal `return '<service-label>'`;
 * - every class element whose semantic name matches in ANY other shape (static / async /
 *   generator / getter / setter / private / computed / class-field / multi-statement body) reds
 *   with a named reason — it is never silently counted OR silently skipped;
 * - a comment mention is not a class element and does not count.
 *
 * `BaseServer` (the null default) lives outside the per-server directories and is not scanned.
 * @returns {Array<{serverDir: String, key: String}>}
 */
function readReportingRoster() {
    const roster = [];

    for (const entry of fs.readdirSync(mcpServerRoot, {withFileTypes: true})) {
        if (!entry.isDirectory()) continue;

        const serverPath = path.join(mcpServerRoot, entry.name, 'Server.mjs');

        if (!fs.existsSync(serverPath)) continue;

        const ast = acorn.parse(fs.readFileSync(serverPath, 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'});

        for (const classBody of collectClassBodies(ast)) {
            for (const element of classBody.body) {
                const name = element.key?.type === 'PrivateIdentifier'
                    ? `#${element.key.name}`
                    : element.computed
                        ? (element.key?.type === 'Literal' ? element.key.value : null)
                        : (element.key?.name ?? element.key?.value);

                if (name !== 'getHeapObservationServiceKey' && name !== '#getHeapObservationServiceKey') continue;

                const isElectedShape =
                    element.type === 'MethodDefinition' &&
                    element.kind === 'method' &&
                    element.static === false &&
                    element.computed === false &&
                    element.value?.type === 'FunctionExpression' &&
                    element.value.async === false &&
                    element.value.generator === false;

                expect(
                    isElectedShape,
                    `${entry.name} defines getHeapObservationServiceKey in a non-elected shape (static/async/generator/accessor/private/computed/class-field) — ` +
                    'the census refuses it rather than guessing its semantics'
                ).toBe(true);

                const statements = element.value.body.body,
                      isLiteralReturn =
                          statements.length === 1 &&
                          statements[0].type === 'ReturnStatement' &&
                          statements[0].argument?.type === 'Literal' &&
                          typeof statements[0].argument.value === 'string';

                expect(
                    isLiteralReturn,
                    `${entry.name} overrides getHeapObservationServiceKey() without a direct literal return — ` +
                    'an unresolvable producer must red, not vanish'
                ).toBe(true);

                roster.push({serverDir: entry.name, key: statements[0].argument.value})
            }
        }
    }

    return roster
}

/**
 * Yields every ClassBody in an AST (declarations, expressions, default exports, call arguments).
 * @param {*} node
 * @returns {Generator<Object>}
 */
function* collectClassBodies(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'ClassBody') {
        yield node;
        return // a class body does not nest another class body outside its elements' values
    }

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item && typeof item === 'object' && item.type) {
                    yield* collectClassBodies(item)
                }
            }
        } else if (value && typeof value === 'object' && value.type) {
            yield* collectClassBodies(value)
        }
    }
}

/**
 * The compose-side producer identity map: service label → the server directory its image builds
 * (`build.args.TARGET_SERVER`). This is what makes a declared key checkable against the DECLARING
 * server's own compose label instead of any label that happens to exist.
 * @param {Object} composeDoc
 * @returns {Object<String, String>}
 */
function readServerLabels(composeDoc) {
    const map = {};

    for (const [label, service] of Object.entries(composeDoc.services || {})) {
        const target = service.build?.args?.TARGET_SERVER;

        if (target) {
            expect(
                Object.values(map).includes(target),
                `two compose services build the same server directory ${target} — the identity census cannot attribute a declaration`
            ).toBe(false);

            map[label] = target
        }
    }

    return map
}

/**
 * Parses one service's `volumes:` entries into `{volume, target, readOnly}` triples. Short-syntax
 * strings and long-syntax objects both resolve; anything else fails closed upstream.
 * @param {Object} composeDoc
 * @param {String} serviceKey
 * @returns {Object[]}
 */
function mountsOf(composeDoc, serviceKey) {
    return (composeDoc.services?.[serviceKey]?.volumes || []).map(entry => {
        if (typeof entry === 'string') {
            const [source, target, mode] = entry.split(':');

            return {volume: source, target, readOnly: mode === 'ro'}
        }

        return {volume: entry.source, target: entry.target, readOnly: entry.read_only === true}
    })
}

test.describe('the heap-observation channel crosses a container boundary', () => {
    test('every reporting server shares ONE named volume with the bridge that reads it, at the config-authoritative path', () => {
        const
            {dirSegment, dataRootRelative} = readChannelPathAuthorities(),
            composePlaneRoot               = readComposePlaneRoot(compose);

        // The cross-domain coherence assertion: the compose-declared in-container root and the
        // config-declared relative root must agree — a rename on EITHER side reds here, even when
        // every mount inside one file stays mutually consistent.
        expect(composePlaneRoot.endsWith(`/${dataRootRelative}`),
            `the compose plane root (${composePlaneRoot}) still ends at the config-declared ${dataRootRelative}`
        ).toBe(true);

        // Definition-level authority: run the compose-declared container root through the REAL
        // resolver the config itself uses — the expected path is computed by the substrate, not
        // re-derived by the guard, so a resolver-behavior change reds here too.
        const containerRoot = composePlaneRoot.slice(0, -(dataRootRelative.length + 1));

        expect(
            resolvePlaneDataRoot({rootDir: containerRoot}),
            'the compose-declared plane root must equal the config resolver applied to the container root'
        ).toBe(composePlaneRoot);

        const
            expectedTarget = `${composePlaneRoot}/${dirSegment}`,
            roster         = readReportingRoster(),
            serverLabels   = readServerLabels(compose);

        // A roster that derived to nothing would make every assertion below vacuous.
        expect(roster.length, 'at least one MCP server declares getHeapObservationServiceKey()')
            .toBeGreaterThan(0);

        // One key, one service, one mount: keys unique, each naming a real compose service, and
        // each declared by the server directory THAT service builds — sibling attribution reds.
        expect(new Set(roster.map(entry => entry.key)).size, 'reporting service keys are unique')
            .toBe(roster.length);

        for (const {serverDir, key} of roster) {
            expect(compose.services, `${key} names a service in the canonical compose file`).toHaveProperty(key);

            const declaringLabel = Object.keys(serverLabels).find(label => serverLabels[label] === serverDir);

            expect(declaringLabel, `${serverDir} is built by exactly one compose service (TARGET_SERVER)`).toBeTruthy();
            expect(
                key,
                `${serverDir}/Server.mjs declares '${key}' but runs as '${declaringLabel}' — a reporter must declare its OWN compose label; sibling attribution misattributes the observation`
            ).toBe(declaringLabel)
        }

        const readerMounts = mountsOf(compose, READER_SERVICE).filter(entry => entry.target === expectedTarget);

        expect(readerMounts, `${READER_SERVICE} mounts exactly one heap-observation volume at ${expectedTarget}`)
            .toHaveLength(1);

        const sharedVolume = readerMounts[0].volume;

        expect(compose.volumes, 'the channel volume is declared in the top-level volumes block')
            .toHaveProperty(sharedVolume);

        for (const {key} of roster) {
            const writerMounts = mountsOf(compose, key).filter(entry => entry.target === expectedTarget);

            expect(writerMounts, `${key} reports a heap observation, so it must mount the channel at the resolved path`)
                .toHaveLength(1);
            expect(writerMounts[0].volume, `${key} shares the bridge's volume — a private one delivers nothing`)
                .toBe(sharedVolume);
            expect(writerMounts[0].readOnly, `${key} WRITES its observation; a :ro mount is a silent no-op`)
                .toBe(false)
        }
    });

    test('the bridge reads the channel read-only — it may never author what it publishes as self-reported', () => {
        const
            {dirSegment}   = readChannelPathAuthorities(),
            expectedTarget = `${readComposePlaneRoot(compose)}/${dirSegment}`,
            readerMount    = mountsOf(compose, READER_SERVICE).find(entry => entry.target === expectedTarget);

        expect(readerMount, `${READER_SERVICE} mounts the heap-observation channel`).toBeTruthy();
        expect(readerMount.readOnly, 'the record carries provenance "self-reported"; the reader must not be able to write one')
            .toBe(true)
    });

    test('the parity profile carries the same invariant at its pinned path — writers rw, reader :ro', () => {
        const
            {dirSegment} = readChannelPathAuthorities(),
            roster       = readReportingRoster(),
            // The parity profile relocates the channel by env pin, so its target is authoritative
            // from the profile file — never the base literal. Fail closed when the pin vanishes.
            parityDir    = devCompose['x-plane-env']?.NEO_HEAP_OBSERVATION_DIR;

        expect(parityDir, 'docker-compose.dev.yml still pins NEO_HEAP_OBSERVATION_DIR in x-plane-env').toBeTruthy();
        expect(parityDir.endsWith(`/${dirSegment}`), 'the parity pin ends at the same leaf directory segment')
            .toBe(true);

        expect(devCompose.volumes, 'the parity channel volume is declared').toHaveProperty(PARITY_VOLUME);

        // The parity participants also inherit the base-path mount through Compose merge; nothing
        // reads it on this profile (the env pin moved the dir), so it is inert — the LIVE path is
        // the pinned one, and that is the one this arm constrains.
        for (const key of [...roster.map(entry => entry.key), READER_SERVICE]) {
            const mounts = mountsOf(devCompose, key).filter(entry => entry.target === parityDir);

            expect(mounts, `${key} runs the parity profile, so it must mount the channel at the pinned path`)
                .toHaveLength(1);
            expect(mounts[0].volume, `${key} shares the one parity channel volume`)
                .toBe(PARITY_VOLUME);
            expect(
                mounts[0].readOnly,
                key === READER_SERVICE
                    ? 'the parity reader is read-only too — a rw plane root must not leave the bridge able to author a self-reported record'
                    : `${key} WRITES its observation on parity as well`
            ).toBe(key === READER_SERVICE)
        }
    })
});
