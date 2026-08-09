import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * Guards the heap-observation channel's TRANSPORT.
 *
 * The channel is a file written by each MCP server about its own V8 heap and read by the
 * orchestrator's deployment-state bridge. Both ends resolve the identical expression —
 * `path.resolve(AiConfig.heapObservation.dir, `${serviceKey}.json`)` — so the code looks
 * symmetric and every in-process witness passes. It shipped anyway with **no shared mount**:
 * each container wrote into its own layer and the orchestrator read its own empty one, so
 * every observation surfaced as `unavailable/absent` on every containerized plane from the
 * day it merged.
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
 * from the servers that actually declare `getHeapObservationServiceKey()`.
 *
 * WHY static parsing rather than `docker compose config`: no agent sandbox has a reachable
 * Docker daemon, and the mount lines ARE the invariant. Reading them from source is a
 * complete test of the property, not a proxy for one.
 */

const
    repoRoot       = path.resolve(process.cwd()),
    composePath    = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    configBasePath = path.join(repoRoot, 'ai/configBase.mjs'),
    mcpServerRoot  = path.join(repoRoot, 'ai/mcp/server'),
    compose        = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    configBaseText = fs.readFileSync(configBasePath, 'utf8'),
    READER_SERVICE = 'orchestrator';

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
 * Service keys of every MCP server that reports an observation, derived from the source that
 * decides it. `BaseServer` returns null; a server opts in by overriding.
 * @returns {String[]}
 */
function readReportingServiceKeys() {
    const keys = [];

    for (const entry of fs.readdirSync(mcpServerRoot, {withFileTypes: true})) {
        if (!entry.isDirectory()) continue;

        const serverPath = path.join(mcpServerRoot, entry.name, 'Server.mjs');

        if (!fs.existsSync(serverPath)) continue;

        const match = fs.readFileSync(serverPath, 'utf8')
            .match(/getHeapObservationServiceKey\(\)\s*\{\s*return\s*'([^']+)'/);

        match && keys.push(match[1])
    }

    return keys.sort()
}

/**
 * Parses one service's `volumes:` entries into `{volume, target, readOnly}` triples.
 * @param {String} serviceKey
 * @returns {Object[]}
 */
function mountsOf(serviceKey) {
    return (compose.services?.[serviceKey]?.volumes || []).map(entry => {
        const [source, target, mode] = String(entry).split(':');

        return {volume: source, target, readOnly: mode === 'ro'}
    })
}

test.describe('the heap-observation channel crosses a container boundary', () => {
    test('every reporting server shares ONE named volume with the bridge that reads it', () => {
        const
            dirSegment    = readObservationDirSegment(),
            reportingKeys = readReportingServiceKeys(),
            mountTarget   = entry => entry.target?.endsWith(`/${dirSegment}`);

        // A roster that derived to nothing would make every assertion below vacuous.
        expect(reportingKeys.length, 'at least one MCP server declares getHeapObservationServiceKey()')
            .toBeGreaterThan(0);

        const readerMounts = mountsOf(READER_SERVICE).filter(mountTarget);

        expect(readerMounts, `${READER_SERVICE} mounts exactly one heap-observation volume`)
            .toHaveLength(1);

        const sharedVolume = readerMounts[0].volume;

        expect(compose.volumes, 'the channel volume is declared in the top-level volumes block')
            .toHaveProperty(sharedVolume);

        for (const serviceKey of reportingKeys) {
            const writerMounts = mountsOf(serviceKey).filter(mountTarget);

            expect(writerMounts, `${serviceKey} reports a heap observation, so it must mount the channel`)
                .toHaveLength(1);
            expect(writerMounts[0].volume, `${serviceKey} shares the bridge's volume — a private one delivers nothing`)
                .toBe(sharedVolume);
            expect(writerMounts[0].target, `${serviceKey} mounts the channel at the reader's path`)
                .toBe(readerMounts[0].target);
            expect(writerMounts[0].readOnly, `${serviceKey} WRITES its observation; a :ro mount is a silent no-op`)
                .toBe(false)
        }
    });

    test('the bridge reads the channel read-only — it may never author what it publishes as self-reported', () => {
        const
            dirSegment  = readObservationDirSegment(),
            readerMount = mountsOf(READER_SERVICE).find(entry => entry.target?.endsWith(`/${dirSegment}`));

        expect(readerMount, `${READER_SERVICE} mounts the heap-observation channel`).toBeTruthy();
        expect(readerMount.readOnly, 'the record carries provenance "self-reported"; the reader must not be able to write one')
            .toBe(true)
    })
});
