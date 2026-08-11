import {test, expect}      from '@playwright/test';
import fs                  from 'node:fs';
import path                from 'node:path';
import process             from 'node:process';
import {load as yamlLoad}  from 'js-yaml';
import Neo                 from '../../../../../src/Neo.mjs';
import * as core           from '../../../../../src/core/_export.mjs';
import KnowledgeBaseServer from '../../../../../ai/mcp/server/knowledge-base/Server.mjs';
import MemoryCoreServer    from '../../../../../ai/mcp/server/memory-core/Server.mjs';

/**
 * Guards the heap-observation channel's mount topology in both deployment profiles.
 *
 * The channel is one shared volume: the MCP servers that report their own V8 heap mount it
 * read-write, and the orchestrator — which only reads what they wrote — mounts it `:ro`. That
 * shape is the whole mechanism; nothing else makes a reporter's record reach the bridge.
 *
 * WHY this spec exists rather than a comment in the Compose file. The reporter is deliberately
 * total: `HeapObservationReporterService.start()` must never fail a server's boot because it could
 * not describe its own heap, and the bridge publishes an absent observation as `null` rather than
 * as zero usage. Both behaviours are correct on their own, and together they mean a broken mount
 * degrades the channel with **nothing going unhealthy** — no failed boot, no error record, no
 * degraded service. The topology is therefore a decision whose correctness no runtime surface can
 * report, which is exactly the class that needs a static guard.
 *
 * Three legal one-line Compose edits silently remove the channel:
 *
 *   - dropping a reporter's volume entry            -> that service's records never leave its container
 *   - adding `:ro` to a reporter's entry            -> the writer cannot write
 *   - removing `:ro` from the orchestrator's entry  -> the reader can now corrupt what it observes
 *
 * WHY the roster is imported rather than parsed. An earlier attempt at this guard inferred producer
 * identity from the source text — accepting any same-named declaration and attributing any class
 * body in a server's file to that server — so a renamed hook beside an unrelated decoy class read
 * as a correctly bound reporter. The repair is not more syntax cases: it is asking the code. Each
 * roster entry calls the hook on the class the module actually **exports**, so a decoy class cannot
 * supply an identity (it is not the default export) and a renamed hook yields `BaseServer`'s `null`
 * (the opt-out default) rather than a stale name.
 *
 * That import is also why the two directions below are BOTH asserted. A renamed hook shrinks the
 * roster, so "every reporter mounts read-write" would pass vacuously on a roster that lost the
 * service. Set equality is what makes the roster's own failure visible: Compose still names
 * `kb-server`, the roster no longer does, and the sets diverge.
 *
 * WHY static rather than a `docker compose config` run: no agent sandbox has a reachable Docker
 * daemon, and the volume entries ARE the property under test — reading them from the source is a
 * complete test of the invariant, not a proxy for one.
 */

const
    repoRoot       = path.resolve(process.cwd()),
    canonicalPath  = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    parityPath     = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    READER_SERVICE = 'orchestrator';

/**
 * The reporter roster, sourced from production rather than restated here.
 *
 * `getHeapObservationServiceKey` is a prototype method with no instance state on either server, so
 * it is callable against the prototype without booting a server. A module whose hook is renamed or
 * removed inherits `BaseServer`'s `null` and drops out of the roster — which the set-equality
 * assertions then convict, rather than silently shrinking the population under test.
 */
const reporterRoster = [KnowledgeBaseServer, MemoryCoreServer]
    .map(ServerClass => ServerClass.prototype.getHeapObservationServiceKey.call(ServerClass.prototype))
    .filter(Boolean)
    .sort();

/**
 * @summary Classifies every service mounting `volumeName` as a writer or a read-only reader.
 * @param {Object} compose Parsed Compose document.
 * @param {String} volumeName Volume key as declared in the `volumes:` section.
 * @returns {{readOnly: String[], readWrite: String[]}} Service keys, sorted.
 */
function classifyMounts(compose, volumeName) {
    const
        readOnly  = [],
        readWrite = [];

    Object.entries(compose.services || {}).forEach(([serviceKey, definition]) => {
        (definition?.volumes || []).forEach(entry => {
            // Short form only — `source:target[:mode]`. The long form (`type:`/`source:` mapping)
            // is not used for this channel in either profile; if it ever is, these lists lose the
            // service and the set-equality assertions redden rather than passing on a partial read.
            if (typeof entry !== 'string') return;

            const [source, , mode] = entry.split(':');

            if (source !== volumeName) return;

            (mode === 'ro' ? readOnly : readWrite).push(serviceKey);
        });
    });

    return {readOnly: readOnly.sort(), readWrite: readWrite.sort()};
}

const profiles = [
    {label: 'canonical', composePath: canonicalPath, volumeName: 'shared-heap-observation-data'},
    {label: 'parity',    composePath: parityPath,    volumeName: 'parity-heap-observation'}
];

test.describe('heap-observation channel topology (#16838)', () => {
    test('the production roster is non-empty and sourced from the exported server classes', () => {
        // A roster that silently emptied would make every per-profile assertion below vacuous, so
        // this is the guard on the guard. It also pins the identities themselves: a hook renamed on
        // one server drops exactly one key here, before any Compose document is read.
        expect(reporterRoster).toEqual(['kb-server', 'mc-server']);
    });

    profiles.forEach(({label, composePath, volumeName}) => {
        test(`${label}: every reporter mounts the channel read-write, and only reporters do`, () => {
            const
                compose     = yamlLoad(fs.readFileSync(composePath, 'utf8')),
                {readWrite} = classifyMounts(compose, volumeName);

            // Set EQUALITY, both directions at once. Inclusion in either direction alone is
            // satisfiable by a defect: a shrunken roster passes "every reporter mounts", and a
            // dropped mount passes "every mount is a reporter".
            expect(readWrite).toEqual(reporterRoster);
        });

        test(`${label}: the reader mounts the channel read-only`, () => {
            const
                compose               = yamlLoad(fs.readFileSync(composePath, 'utf8')),
                {readOnly, readWrite} = classifyMounts(compose, volumeName);

            expect(readOnly).toEqual([READER_SERVICE]);

            // Stated separately because `:ro` is what makes the observer safe: an observer able to
            // write the channel it reads can corrupt the evidence it exists to report.
            expect(readWrite).not.toContain(READER_SERVICE);
        });

        test(`${label}: the channel volume is declared`, () => {
            const compose = yamlLoad(fs.readFileSync(composePath, 'utf8'));

            expect(Object.hasOwn(compose.volumes || {}, volumeName)).toBe(true);
        });
    });
});
