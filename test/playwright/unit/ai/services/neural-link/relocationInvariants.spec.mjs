import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import path           from 'node:path';

/**
 * @summary The architectural invariants the Neural Link data relocation establishes, pinned so a later
 * change reds instead of silently undoing them.
 *
 * Every one is a source-shape assertion rather than a behavioural one, because every one is about what
 * the codebase may CONTAIN — an import, an operation, a dependency direction, a process-wide listener. A
 * behavioural test cannot observe the absence of a capability that was never added; only a scan of the
 * surface can.
 *
 * The last two arrived as REGRESSIONS this relocation introduced and review caught: a library module that
 * imported the framework root, and one that claimed process-wide rejections it could not prove were its
 * own. They are pinned here rather than fixed and forgotten, because both are the kind of thing the next
 * module in this directory would copy from its neighbour.
 *
 * **Every arm carries a positive control.** A grep-based invariant that finds nothing proves nothing
 * until the same pattern is shown finding something, and this file exists precisely to hold a set of
 * ZEROES. Without the controls, a typo'd path or a renamed directory would turn every arm green and
 * report the invariants as held while nothing was being checked.
 */
test.describe('Neural Link relocation invariants', () => {
    const rootDir = path.resolve(import.meta.dirname, '../../../../../..');

    /**
     * Reads every `.mjs` under one repo-relative directory.
     * @param {String} rel Repo-relative directory.
     * @returns {Object[]} `{file, source}` for each module found.
     */
    function readModules(rel) {
        const dir  = path.join(rootDir, rel),
              out  = [],
              walk = current => {
                  for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
                      const full = path.join(current, entry.name);

                      if (entry.isDirectory()) walk(full);
                      else if (entry.name.endsWith('.mjs')) out.push({file: path.relative(rootDir, full), source: fs.readFileSync(full, 'utf8')});
                  }
              };

        walk(dir);

        return out;
    }

    test('AC-2 — no host-resident Neural Link surface reaches SQLite, and the scan proves it can see one', () => {
        const nlModules = [...readModules('ai/services/neural-link'), ...readModules('ai/mcp/server/neural-link')],
              offenders = nlModules.filter(m => /better-sqlite3/.test(m.source)).map(m => m.file);

        expect(offenders).toEqual([]);

        // POSITIVE CONTROL. `ai/services.host.mjs` genuinely imports better-sqlite3, so the pattern and
        // the reader both work. Without this, a bad path would make the assertion above vacuous.
        const control = fs.readFileSync(path.join(rootDir, 'ai/services.host.mjs'), 'utf8');

        expect(/better-sqlite3/.test(control)).toBe(true);

        // And the scan actually read modules rather than an empty directory.
        expect(nlModules.length).toBeGreaterThan(3);
    });

    test('AC-4 — direction: nothing container-side imports the Neural Link surface', () => {
        // Host→container is an authenticated client call. Container→host would be remote code execution
        // on a developer machine, because Neural Link owns `patch_code`, `create_component` and
        // `simulate_event`. The relocation must not have quietly created a path in the wrong direction.
        const containerModules = [...readModules('ai/services/memory-core'), ...readModules('ai/mcp/server/memory-core')],
              offenders        = containerModules
                  .filter(m => /(services|server)\/neural-link/.test(m.source))
                  .map(m => m.file);

        expect(offenders).toEqual([]);

        // POSITIVE CONTROL: the same pattern finds the legitimate host-side importers.
        const hostImporter = fs.readFileSync(path.join(rootDir, 'ai/mcp/server/neural-link/toolService.mjs'), 'utf8');

        expect(/(services|server)\/neural-link/.test(hostImporter)).toBe(true);
        expect(containerModules.length).toBeGreaterThan(10);
    });

    test('AC-7 — the genesis aggregate proof survives, and its writer and reader name the same file', () => {
        // The OTHER half of AC-7, and the half a refusal test cannot cover. Genesis used to aggregate the
        // seat's local `nl_action_log`; the relocation removes that table, and a remote telemetry read is
        // refused by the arm below — so the proof is preserved by seat-local ephemeral accounting instead.
        // Writer and reader hold the filename as separate literals on purpose (importing the recorder
        // would drag the MCP client into a diagnostic script's closure), which makes them a drift pair.
        const recorder = fs.readFileSync(path.join(rootDir, 'ai/services/neural-link/RecorderService.mjs'), 'utf8'),
              probe    = fs.readFileSync(path.join(rootDir, 'ai/scripts/diagnostics/genesisProbe.mjs'), 'utf8'),
              nameOf   = source => source.match(/'(nl-action-aggregate\.json)'/)?.[1] ?? null;

        expect(nameOf(recorder)).toBe('nl-action-aggregate.json');
        expect(nameOf(probe)).toBe(nameOf(recorder));

        // And the probe still READS it — a constant nobody consumes would keep this arm green forever.
        expect(probe).toContain('readAggregateTelemetry(aggregatePath)');

        // POSITIVE CONTROL: the matcher returns null when the literal is genuinely absent, so the
        // agreement above is a comparison rather than two nulls agreeing with each other.
        expect(nameOf('const other = 1;')).toBeNull();
    });

    test('AC-7 — the telemetry channel stays WRITE-ONLY: no remote read operation exists', () => {
        const openapi      = fs.readFileSync(path.join(rootDir, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8'),
              nlOperations = [...openapi.matchAll(/operationId:\s*(\S*nl_\S*)/g)].map(m => m[1]).sort();

        // The archive's read is in-contract — replay is a host-initiated round trip and a response
        // carrying archive data is a reply. The TELEMETRY channel is the one with no read, and adding one
        // would contradict the direction invariant this relocation establishes.
        expect(nlOperations).toEqual([
            'admit_nl_actions',
            'get_nl_transaction',
            'mark_nl_transaction_replayed',
            'save_nl_transaction'
        ]);

        const telemetryReads = nlOperations.filter(id => /nl_action/.test(id) && !id.startsWith('admit_'));

        expect(telemetryReads).toEqual([]);

        // POSITIVE CONTROL: the matcher does find operations, so an empty telemetry-read list is a
        // measurement rather than a broken regex.
        expect(nlOperations.length).toBe(4);
    });

    test('no Neural Link service imports the framework root — that is an entrypoint\'s job', () => {
        // A process ENTRYPOINT imports `Neo` together with the core and boots the framework. Nothing in
        // this directory is one: every module here is loaded BY an entrypoint. A library that imports the
        // framework root alone declares a dependency it does not own — it half-states the boot — and reads
        // as license for the next module to do the same. The nine service classes here need `Neo` for
        // `setupClass` and none of them imports it; they reach it as the global their `src/core/Base.mjs`
        // import guarantees.
        const importsNeo = /^\s*import\s+[^;]*from\s+['"][^'"]*src\/Neo\.mjs['"]/m,
              scanned    = readModules('ai/services/neural-link'),
              offenders  = scanned.filter(m => importsNeo.test(m.source)).map(m => m.file);

        expect(offenders).toEqual([]);

        // The scan read a POPULATION. A renamed directory would empty it and report every module clean.
        expect(scanned.length).toBeGreaterThan(9);

        // POSITIVE CONTROL: a real entrypoint in the sibling tree, which imports the root AND the core
        // exactly as an entrypoint should. So the pattern finds this import when it is present, and the
        // empty list above is a measurement. Anchored to statement position, it also does not fire on the
        // several modules here that merely NAME `src/Neo.mjs` in a comment.
        const entrypoint = fs.readFileSync(path.join(rootDir, 'ai/mcp/server/neural-link/mcp-server.mjs'), 'utf8');

        expect(importsNeo.test(entrypoint)).toBe(true);
        expect(/from\s+'[^']*src\/core\/_export\.mjs'/.test(entrypoint)).toBe(true);
    });

    test('no Neural Link service claims process-wide rejections it cannot prove are its own', () => {
        // `Neo.create` awaits `initAsync` in a detached chain whose promise has no reject path, so an
        // async initialization failure reaches the process. Catching it with a process-level listener means
        // deciding ownership from timing — every unrelated subsystem failing inside the same window gets
        // claimed. `ArchiveMcpClient` overrides `initAsync` instead, which needs no ownership guess.
        //
        // This is the primary proof that an unrelated rejection stays unclaimed, and it is the stronger
        // one: claiming requires a REGISTRATION, so a directory with none cannot claim anything. Hence
        // every registration form, not just `on` — a zero that `prependListener` walks through is not a
        // zero. The behavioural half cannot be written: the harness installs its own listener for this
        // event, so any rejection reaching the process fails the surrounding test first.
        const installsListener = /^\s*process\.(on|once|addListener|prependListener|prependOnceListener)\(\s*['"]unhandledRejection/m,
              scanned          = readModules('ai/services/neural-link'),
              offenders        = scanned.filter(m => installsListener.test(m.source)).map(m => m.file);

        expect(offenders).toEqual([]);

        // Same guard: an empty scan would make this zero a statement about nothing.
        expect(scanned.length).toBeGreaterThan(9);

        // POSITIVE CONTROL: a module that legitimately owns one, because it IS the process — so the
        // pattern finds a real listener, and the zero above is a measurement rather than a regex that
        // matches nothing anywhere.
        const runner = fs.readFileSync(path.join(rootDir, 'ai/scripts/lifecycle/nightlyE2eRunner.mjs'), 'utf8');

        expect(installsListener.test(runner)).toBe(true);
    });
});
