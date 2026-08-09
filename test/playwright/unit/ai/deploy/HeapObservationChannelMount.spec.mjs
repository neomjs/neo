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
    configBaseAst   = acorn.parse(configBaseText,  {ecmaVersion: 'latest', sourceType: 'module'}),
    planeConfigAst  = acorn.parse(planeConfigText, {ecmaVersion: 'latest', sourceType: 'module'}),
    READER_SERVICE  = 'orchestrator',
    PARITY_VOLUME   = 'parity-heap-observation';

/**
 * Collects every AST node of a given type (recursive walk over the structural tree).
 * @param {*} node
 * @param {String} type
 * @param {Object[]} [hits]
 * @returns {Object[]}
 */
function collectByType(node, type, hits=[]) {
    if (!node || typeof node !== 'object') return hits;

    if (node.type === type) {
        hits.push(node)
    }

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            value.forEach(item => { item?.type && collectByType(item, type, hits) })
        } else if (value?.type) {
            collectByType(value, type, hits)
        }
    }

    return hits
}

/**
 * Finds a module-scope `const <name> = …` declarator.
 * @param {Object} ast
 * @param {String} name
 * @returns {Object|undefined}
 */
function findModuleConst(ast, name) {
    for (const node of ast.body) {
        if (node.type === 'VariableDeclaration') {
            const declarator = node.declarations.find(d => d.id?.name === name);

            if (declarator) return declarator
        }
    }

    return undefined
}

/**
 * True when the node is `path.resolve(__dirname, '../')` (the repo-root anchor).
 * @param {*} node
 * @returns {Boolean}
 */
function isPathResolveDirnameParent(node) {
    return node?.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.object?.name === 'path' &&
        node.callee.property?.name === 'resolve' &&
        node.arguments.length === 2 &&
        node.arguments[0].type === 'Identifier' && node.arguments[0].name === '__dirname' &&
        node.arguments[1].type === 'Literal' && /^'\.\.\/?'$/.test(node.arguments[1].raw || '') // '../' or '..'
}

/**
 * The config-authoritative channel path pieces, proved STRUCTURALLY to binding level: a regex
 * pins a spelling, but a substituted import binding (`import {resolvePlaneDataRoot as X}` plus a
 * local shadow) keeps every spelling while moving the runtime path — so the chain is verified in
 * the AST: the unaliased import from `./planeConfig.mjs`, no module-scope shadow, the anchor's
 * definition, the repo-root definition, and the leaf's call shape. Every link fails closed.
 * @returns {{dirSegment: String, dataRootRelative: String}}
 */
function readChannelPathAuthorities() {
    // 1. The resolver binding: imported from ./planeConfig.mjs, unaliased, unshadowed.
    const importDecl = configBaseAst.body.find(
        node => node.type === 'ImportDeclaration' && node.source.value === './planeConfig.mjs'
    );

    expect(importDecl, 'ai/configBase.mjs still imports from ./planeConfig.mjs').toBeTruthy();

    const specifier = importDecl.specifiers.find(
        s => s.type === 'ImportSpecifier' && s.imported?.name === 'resolvePlaneDataRoot'
    );

    expect(
        specifier?.local?.name === 'resolvePlaneDataRoot',
        'resolvePlaneDataRoot is imported UNALIASED — an alias plus a local shadow would move the runtime path behind an unchanged call spelling'
    ).toBe(true);

    const shadow = configBaseAst.body.find(node =>
        (node.type === 'VariableDeclaration' && node.declarations.some(d => d.id?.name === 'resolvePlaneDataRoot')) ||
        (node.type === 'FunctionDeclaration' && node.id?.name === 'resolvePlaneDataRoot')
    );

    expect(shadow, 'no module-scope shadow of the imported resolver').toBeFalsy();

    // 2. The anchor's definition: planeDataRootDefault = resolvePlaneDataRoot({rootDir: neoRootDir}).
    const anchorDef = findModuleConst(configBaseAst, 'planeDataRootDefault'),
          init      = anchorDef?.init;

    expect(
        init?.type === 'CallExpression' &&
        init.callee?.type === 'Identifier' && init.callee.name === 'resolvePlaneDataRoot' &&
        init.arguments.length === 1 &&
        init.arguments[0].type === 'ObjectExpression' &&
        init.arguments[0].properties.some(p =>
            p.key?.name === 'rootDir' && p.value?.type === 'Identifier' && p.value.name === 'neoRootDir'
        ),
        'planeDataRootDefault is still DEFINED as resolvePlaneDataRoot({rootDir: neoRootDir}) — a definition-level move changes the runtime path and must red here'
    ).toBe(true);

    // 3. The repo-root definition beneath it.
    expect(
        isPathResolveDirnameParent(findModuleConst(configBaseAst, 'neoRootDir')?.init),
        'neoRootDir is still defined as the configBase-relative repository root'
    ).toBe(true);

    // 4. The leaf call itself: dir = leaf(path.resolve(planeDataRootDefault, '<segment>'), …).
    const heapProperty = collectByType(configBaseAst, 'Property').find(p => p.key?.name === 'heapObservation'),
          dirProperty  = heapProperty?.value?.properties?.find(p => p.key?.name === 'dir'),
          leafCall     = dirProperty?.value;

    expect(
        leafCall?.type === 'CallExpression' && leafCall.callee?.name === 'leaf',
        'heapObservation.dir is still a leaf(…) declaration'
    ).toBe(true);

    const resolveCall = leafCall.arguments[0];

    expect(
        resolveCall?.type === 'CallExpression' &&
        resolveCall.callee?.type === 'MemberExpression' &&
        resolveCall.callee.object?.name === 'path' && resolveCall.callee.property?.name === 'resolve' &&
        resolveCall.arguments[0]?.type === 'Identifier' && resolveCall.arguments[0].name === 'planeDataRootDefault' &&
        resolveCall.arguments[1]?.type === 'Literal' && typeof resolveCall.arguments[1].value === 'string',
        'the dir leaf still resolves path.resolve(planeDataRootDefault, \'<segment>\') — anchor and segment are bound, not assumed'
    ).toBe(true);

    // 5. planeConfig's relative root, structurally.
    const relativeProperty = collectByType(planeConfigAst, 'Property').find(p => p.key?.name === 'dataRootRelative');

    expect(
        relativeProperty?.value?.type === 'Literal' && typeof relativeProperty.value.value === 'string',
        'ai/planeConfig.mjs still declares PLANE_DEFAULTS.dataRootRelative'
    ).toBe(true);

    return {dirSegment: resolveCall.arguments[1].value, dataRootRelative: relativeProperty.value.value}
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
 * Classifies one class element's key: public exact name, private name, or unresolvable computed.
 * A computed key is resolvable only as a string Literal or a no-expression TemplateLiteral —
 * anything else means the census cannot prove the element is not a producer, so it must red.
 * @param {Object} element
 * @returns {{name: String|null, pub: Boolean|null}}
 */
function classifyElementKey(element) {
    const key = element.key;

    if (element.computed) {
        if (key?.type === 'Literal' && typeof key.value === 'string') {
            return {name: key.value, pub: true}
        }

        if (key?.type === 'TemplateLiteral' && key.expressions.length === 0 && key.quasis.length === 1) {
            return {name: key.quasis[0].value.cooked, pub: true}
        }

        return {name: null, pub: null} // unresolvable — fail closed upstream
    }

    if (key?.type === 'PrivateIdentifier') {
        return {name: `#${key.name}`, pub: false}
    }

    if (key?.type === 'Identifier') {
        return {name: key.name, pub: true}
    }

    if (key?.type === 'Literal' && typeof key.value === 'string') {
        return {name: key.value, pub: true} // quoted member name — public
    }

    return {name: null, pub: null}
}

/**
 * Every MCP-server override of `getHeapObservationServiceKey()`, as `{serverDir, key}` pairs —
 * identity-preserving by construction, enumerated STRUCTURALLY (acorn), never by regex shape.
 * A regex recognizes the spelling it expects and silently drops or miscounts every other valid
 * spelling (a space before `()`, a modifier stack); a class-body walk recognizes the ELEMENT and
 * can refuse its shape. Discovery rules, all fail-closed:
 *
 * - the elected convention is a plain public, non-static, non-async, non-generator instance
 *   method whose body is one direct literal `return '<service-label>'`;
 * - a PRIVATE same-named method is never an override (the public BaseServer default still
 *   answers `null`) — it reds as a shadow-trap, it does not count;
 * - a computed element whose key cannot be structurally resolved reds — the census cannot prove
 *   it is not a producer;
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
                const keyInfo = classifyElementKey(element);

                expect(
                    keyInfo.pub !== null,
                    `${entry.name}/Server.mjs carries a computed class element whose key cannot be structurally resolved — ` +
                    'the census cannot prove it is not a getHeapObservationServiceKey producer; resolve it literally or remove it'
                ).toBe(true);

                if (keyInfo.name === '#getHeapObservationServiceKey') {
                    expect(
                        false,
                        `${entry.name} defines a PRIVATE #getHeapObservationServiceKey — a private method never overrides the public ` +
                        'BaseServer default (which still returns null), so this shape reports nothing while looking like a producer'
                    ).toBe(true)
                }

                if (keyInfo.name !== 'getHeapObservationServiceKey') continue;

                const isElectedShape =
                    element.type === 'MethodDefinition' &&
                    element.kind === 'method' &&
                    element.static === false &&
                    element.value?.type === 'FunctionExpression' &&
                    element.value.async === false &&
                    element.value.generator === false;

                expect(
                    isElectedShape,
                    `${entry.name} defines getHeapObservationServiceKey in a non-elected shape (static/async/generator/accessor/class-field) — ` +
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
