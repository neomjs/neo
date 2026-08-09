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
 * WHY the writer roster is DERIVED and never listed. A hardcoded pair silently excludes the
 * third server someone adds next — which is the same defect one layer out. The roster comes
 * from the servers that actually declare `getHeapObservationServiceKey()`, and discovery
 * REFUSES an override it cannot resolve: an indirect producer (`const key = 'x'; return key`)
 * must red here, never sail past the regex into an unasserted mount.
 *
 * WHY targets bind EXACTLY, per profile. A shared final path segment proves nothing: swapping
 * every mount target to a coordinated wrong path leaves a suffix-check green. The expected
 * base target is derived from two independent authorities — the compose file's own plane-root
 * convention (read off the deployment-state mount) and the config leaf's directory segment —
 * and the parity profile's target comes from its `NEO_HEAP_OBSERVATION_DIR` pin, because the
 * resolved path differs per profile by design.
 *
 * WHY static parsing rather than only `docker compose config`: the mount lines ARE the
 * invariant, and reading them from source is a complete hermetic test of the property. The
 * rendered-config probe is the per-profile complement the repair cycle used; it is not a
 * CI-runnable guard, which is what this file is.
 */

const
    repoRoot       = path.resolve(process.cwd()),
    composePath    = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    devComposePath = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    configBasePath = path.join(repoRoot, 'ai/configBase.mjs'),
    mcpServerRoot  = path.join(repoRoot, 'ai/mcp/server'),
    compose        = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    devCompose     = yamlLoad(fs.readFileSync(devComposePath, 'utf8')),
    configBaseText = fs.readFileSync(configBasePath, 'utf8'),
    READER_SERVICE = 'orchestrator',
    PARITY_VOLUME  = 'parity-heap-observation';

/**
 * The directory segment `AiConfig.heapObservation.dir` appends to the plane data root. Read from
 * the config source rather than restated, so renaming the leaf reds this spec instead of silently
 * leaving the mount pointing at a directory nothing writes.
 * @returns {String}
 */
function readObservationDirSegment() {
    const match = configBaseText.match(/heapObservation:\s*\{[\s\S]*?dir\s*:\s*leaf\(path\.resolve\([^,]+,\s*'([^']+)'\)/);

    // Fail closed: an unmatched regex must not silently assert nothing.
    expect(match, 'ai/configBase.mjs still declares heapObservation.dir as a plane-root-relative leaf').toBeTruthy();

    return match[1]
}

/**
 * The canonical plane root as the COMPOSE file holds it, derived from a sibling channel's mount
 * rather than restated: the orchestrator's `shared-deployment-state-data` target minus its last
 * segment. A coordinated wrong-target mutation on the heap channel cannot move this anchor, so
 * exact binding against it is what a suffix check could never prove.
 * @returns {String}
 */
function readBasePlaneRoot() {
    const anchor = mountsOf(compose, READER_SERVICE).find(entry => entry.volume === 'shared-deployment-state-data');

    expect(anchor, 'the orchestrator still mounts shared-deployment-state-data — the plane-root anchor').toBeTruthy();

    return anchor.target.replace(/\/[^/]+$/, '')
}

/**
 * Service keys of every MCP server that reports an observation, derived from the source that
 * decides it — and hardened against the two census failure modes: an override written in a shape
 * this guard cannot resolve (refused, not skipped) and a duplicate key (a second reporter
 * impersonating an existing one). `BaseServer` returns null; a server opts in by overriding.
 * @returns {String[]}
 */
function readReportingServiceKeys() {
    const keys = [];

    for (const entry of fs.readdirSync(mcpServerRoot, {withFileTypes: true})) {
        if (!entry.isDirectory()) continue;

        const serverPath = path.join(mcpServerRoot, entry.name, 'Server.mjs');

        if (!fs.existsSync(serverPath)) continue;

        const override = fs.readFileSync(serverPath, 'utf8')
            .match(/getHeapObservationServiceKey\(\)\s*\{([\s\S]*?)\}/);

        if (!override) continue; // no override — the BaseServer null default stands

        const literal = override[1].match(/return\s*'([^']+)'/);

        expect(
            literal,
            `${entry.name} overrides getHeapObservationServiceKey() in a shape this guard cannot resolve — ` +
            'use a direct literal return or extend the resolver; an unresolvable producer must red, not vanish'
        ).toBeTruthy();

        keys.push(literal[1])
    }

    return keys.sort()
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
    test('every reporting server shares ONE named volume with the bridge that reads it, at the exact resolved path', () => {
        const
            dirSegment     = readObservationDirSegment(),
            expectedTarget = `${readBasePlaneRoot()}/${dirSegment}`,
            reportingKeys  = readReportingServiceKeys();

        // A roster that derived to nothing would make every assertion below vacuous.
        expect(reportingKeys.length, 'at least one MCP server declares getHeapObservationServiceKey()')
            .toBeGreaterThan(0);

        // One key, one service, one mount: a duplicate key means a second reporter impersonates an
        // existing one and its own service never gets a mount — the roster must be a set, and every
        // key must name a real Compose service.
        expect(new Set(reportingKeys).size, 'reporting service keys are unique').toBe(reportingKeys.length);

        for (const serviceKey of reportingKeys) {
            expect(compose.services, `${serviceKey} names a service in the canonical compose file`)
                .toHaveProperty(serviceKey)
        }

        const readerMounts = mountsOf(compose, READER_SERVICE).filter(entry => entry.target === expectedTarget);

        expect(readerMounts, `${READER_SERVICE} mounts exactly one heap-observation volume at ${expectedTarget}`)
            .toHaveLength(1);

        const sharedVolume = readerMounts[0].volume;

        expect(compose.volumes, 'the channel volume is declared in the top-level volumes block')
            .toHaveProperty(sharedVolume);

        for (const serviceKey of reportingKeys) {
            const writerMounts = mountsOf(compose, serviceKey).filter(entry => entry.target === expectedTarget);

            expect(writerMounts, `${serviceKey} reports a heap observation, so it must mount the channel at the resolved path`)
                .toHaveLength(1);
            expect(writerMounts[0].volume, `${serviceKey} shares the bridge's volume — a private one delivers nothing`)
                .toBe(sharedVolume);
            expect(writerMounts[0].readOnly, `${serviceKey} WRITES its observation; a :ro mount is a silent no-op`)
                .toBe(false)
        }
    });

    test('the bridge reads the channel read-only — it may never author what it publishes as self-reported', () => {
        const
            expectedTarget = `${readBasePlaneRoot()}/${readObservationDirSegment()}`,
            readerMount    = mountsOf(compose, READER_SERVICE).find(entry => entry.target === expectedTarget);

        expect(readerMount, `${READER_SERVICE} mounts the heap-observation channel`).toBeTruthy();
        expect(readerMount.readOnly, 'the record carries provenance "self-reported"; the reader must not be able to write one')
            .toBe(true)
    });

    test('the parity profile carries the same invariant at its pinned path — writers rw, reader :ro', () => {
        const
            dirSegment    = readObservationDirSegment(),
            reportingKeys = readReportingServiceKeys(),
            // The parity profile relocates the channel by env pin, so its target is authoritative
            // from the profile file — never the base literal. Fail closed when the pin vanishes.
            parityDir     = devCompose['x-plane-env']?.NEO_HEAP_OBSERVATION_DIR;

        expect(parityDir, 'docker-compose.dev.yml still pins NEO_HEAP_OBSERVATION_DIR in x-plane-env').toBeTruthy();
        expect(parityDir.endsWith(`/${dirSegment}`), 'the parity pin ends at the same leaf directory segment')
            .toBe(true);

        expect(devCompose.volumes, 'the parity channel volume is declared').toHaveProperty(PARITY_VOLUME);

        // The parity participants also inherit the base-path mount through Compose merge; nothing
        // reads it on this profile (the env pin moved the dir), so it is inert — the LIVE path is
        // the pinned one, and that is the one this arm constrains.
        for (const serviceKey of [...reportingKeys, READER_SERVICE]) {
            const mounts = mountsOf(devCompose, serviceKey).filter(entry => entry.target === parityDir);

            expect(mounts, `${serviceKey} runs the parity profile, so it must mount the channel at the pinned path`)
                .toHaveLength(1);
            expect(mounts[0].volume, `${serviceKey} shares the one parity channel volume`)
                .toBe(PARITY_VOLUME);
            expect(
                mounts[0].readOnly,
                serviceKey === READER_SERVICE
                    ? 'the parity reader is read-only too — a rw plane root must not leave the bridge able to author a self-reported record'
                    : `${serviceKey} WRITES its observation on parity as well`
            ).toBe(serviceKey === READER_SERVICE)
        }
    })
});
