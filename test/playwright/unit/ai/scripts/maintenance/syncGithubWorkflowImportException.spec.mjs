import {test, expect}     from '@playwright/test';
import {readFileSync}     from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath}    from 'node:url';

const
    // maintenance -> scripts -> ai -> unit -> playwright -> test -> repo root
    REPO_ROOT      = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
    BARREL         = resolve(REPO_ROOT, 'ai/services.mjs'),
    EXCEPTION_SITE = resolve(REPO_ROOT, 'ai/scripts/maintenance/syncGithubWorkflow.mjs'),
    OPENAPI        = resolve(REPO_ROOT, 'ai/mcp/server/github-workflow/openapi.yaml');

/**
 * @summary Walks static `import` specifiers from an entry module and reports whether a bare package
 * is reachable.
 *
 * Static rather than executed: the property under test is what module RESOLUTION pulls in, which is
 * exactly what fails before any code runs. Importing the barrel to find out would fail the suite in
 * the same environments this is protecting.
 *
 * @param {String} entry Absolute path.
 * @param {String} barePackage
 * @returns {{reached: Boolean, chain: String[], walked: Number}}
 */
function reachesPackage(entry, barePackage) {
    const seen = new Set();
    let   hit  = null;

    const walk = (file, chain) => {
        if (hit || seen.has(file) || seen.size > 5000) {
            return
        }

        seen.add(file);

        let source;

        try {
            source = readFileSync(file, 'utf8')
        } catch {
            return
        }

        for (const match of source.matchAll(/(?:^|\n)\s*import[^'"]*['"]([^'"]+)['"]/g)) {
            const specifier = match[1];

            if (!specifier.startsWith('.')) {
                if (specifier === barePackage) {
                    hit = [...chain, file, barePackage];
                    return
                }
                continue
            }

            let resolved = resolve(dirname(file), specifier);

            if (!resolved.endsWith('.mjs') && !resolved.endsWith('.js')) {
                resolved += '.mjs'
            }

            walk(resolved, [...chain, file]);
        }
    };

    walk(entry, []);

    return {
        chain  : (hit ?? []).map(entryPath => entryPath.replace(`${REPO_ROOT}/`, '')),
        reached: hit !== null,
        walked : seen.size
    }
}

/**
 * @summary The mechanical sunset for the SDK-boundary exception in `syncGithubWorkflow.mjs`.
 *
 * A retirement trigger keyed to an event nothing observes can never fire, and it reads as coverage
 * while providing none — `// TODO: remove when #N lands` is observed by nobody. So the exception's
 * expiry is a test that goes RED on its own the moment the exception stops being necessary.
 *
 * Every assertion here is phrased so that FAILURE means "delete the exception" or "the exception no
 * longer holds what it promised" — never "add more exception".
 */
test.describe('syncGithubWorkflow SDK-boundary exception — self-expiring', () => {
    test('SUNSET: the barrel still reaches chromadb; when it stops, DELETE the exception', () => {
        const {reached, chain, walked} = reachesPackage(BARREL, 'chromadb');

        expect(walked).toBeGreaterThan(50);   // the walk ran; a zero-walk "not reached" proves nothing

        expect(
            reached,
            'ai/services.mjs NO LONGER reaches chromadb, so the Body tier can import the barrel again. ' +
            'The SDK-boundary exception at the top of ai/scripts/maintenance/syncGithubWorkflow.mjs is ' +
            'now unnecessary: restore `import {GH_Config, GH_SyncService} from "../../services.mjs"`, ' +
            'drop the Neo bootstrap and the syncOnStartup override the barrel supplies, and delete ' +
            'this spec. This failure is the exception expiring on schedule, not a regression.'
        ).toBe(true);

        // Recorded so the path is legible when it does expire, rather than requiring a re-derivation.
        expect(chain.at(-1)).toBe('chromadb');
    });

    test('the exception still carries BOTH guarantees the barrel used to supply', () => {
        // Half-deleting the exception is the quiet failure: an import cleanup that removes the
        // bootstrap or the override leaves a script that either throws on Neo or silently gains a
        // bi-directional sync. Neither is visible in a diff that only looks like it tidied imports.
        const source = readFileSync(EXCEPTION_SITE, 'utf8');

        // Matched on symbol + path rather than exact text: the block-alignment lint owns the spacing
        // between them, so an assertion pinned to today's padding would fail on a pure realignment
        // and teach the next reader that this guard is noise.
        expect(source, 'Neo namespace bootstrap missing — the barrel supplied it and no longer does')
            .toMatch(/import\s+Neo\s+from\s+'\.\.\/\.\.\/\.\.\/src\/Neo\.mjs'/);

        expect(source, 'core/_export augmentation missing — Neo globals will be absent at setupClass time')
            .toMatch(/import\s+\*\s+as\s+core\s+from\s+'\.\.\/\.\.\/\.\.\/src\/core\/_export\.mjs'/);

        expect(
            source,
            'syncOnStartup override missing. The config leaf defaults to false, but this is a FORCED ' +
            'override that holds regardless of env or overlay, and SyncService branches on it. Without ' +
            'it an overlay can turn a read-only emission run into a bi-directional sync.'
        ).toContain('GH_Config.data.syncOnStartup = false;');

        // The exception must stay narrow: it exists for this one barrel-avoidance, not as licence.
        expect(source).not.toContain("from '../../services.mjs'");
    });

    test('makeSafe is still a no-op for the two methods this script calls', () => {
        // The barrel wraps services in `makeSafe`, which validates and marshals against the OpenAPI
        // spec. That is currently harmless to lose here because neither called method is an operation
        // in the spec. If someone ADDS one, the direct import silently drops validation — so this
        // fails and says so rather than letting the exception quietly widen its cost.
        const spec = readFileSync(OPENAPI, 'utf8');

        for (const method of ['emitGeneratedContentAndDerive', 'runFullSync', 'emit_generated_content', 'run_full_sync']) {
            expect(
                spec.includes(method),
                `${method} is now in the github-workflow OpenAPI spec, so makeSafe would validate or ` +
                'marshal it. The direct import in syncGithubWorkflow.mjs bypasses that wrapper — the ' +
                'exception now costs real validation and must be revisited.'
            ).toBe(false);
        }
    });
});
