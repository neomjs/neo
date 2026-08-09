import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

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
 * The config-authoritative channel path pieces: the `heapObservation.dir` leaf's resolve
 * expression (anchor name AND segment — moving the anchor must red, not silently re-derive)
 * crossed with `planeConfig`'s relative root.
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
 * identity-preserving by construction. Discovery rules, all fail-closed:
 *
 * - the elected convention is a PLAIN instance method with a direct literal return;
 * - any other definitional shape (static / async / generator / getter / private / computed /
 *   class-field) reds with a named reason — it is never silently counted OR silently skipped;
 * - a comment mention is not a definition and does not count.
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

        const text  = fs.readFileSync(serverPath, 'utf8'),
              plain = text.match(/^ {4}getHeapObservationServiceKey\(\)\s*\{([\s\S]*?)\}/m);

        if (plain) {
            const literal = plain[1].match(/return\s*'([^']+)'/);

            expect(
                literal,
                `${entry.name} overrides getHeapObservationServiceKey() without a direct literal return — ` +
                'an unresolvable producer must red, not vanish'
            ).toBeTruthy();

            roster.push({serverDir: entry.name, key: literal[1]});
            continue
        }

        const variant = text.match(/^ *(?:static|async)\s+getHeapObservationServiceKey|^ *\*\s*getHeapObservationServiceKey|^ *get\s+getHeapObservationServiceKey|^ *#getHeapObservationServiceKey|^ *\[['"]getHeapObservationServiceKey['"]\]\s*\(|^ *getHeapObservationServiceKey\s*=/m);

        expect(
            variant,
            `${entry.name} defines getHeapObservationServiceKey in a non-plain shape (static/async/generator/getter/private/computed/class-field) — ` +
            'that is not the elected override convention and this guard refuses it rather than guessing its semantics'
        ).toBeNull()
    }

    return roster
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
