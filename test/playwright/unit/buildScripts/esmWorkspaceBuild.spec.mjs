import {spawnSync}    from 'child_process';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {test, expect} from '@playwright/test';

/**
 * Drives the real `buildScripts/build/esmodules.mjs` over a synthetic greenfield workspace.
 *
 * The sibling spec pins the transforms in isolation; this one exists because every defect it covers
 * was a *composition* failure. Each transform looked reasonable on its own — the build finished, it
 * printed success, and it exited 0. What was broken was the relationship between what the build
 * copied and what the emitted code asked for, and only running the script end to end over a workspace
 * layout can observe that.
 *
 * The workspace shape is the one that broke: an app importing the engine from `node_modules/neo.mjs`
 * with house-style single quotes, plus a component library in a root-level tree outside the four
 * hardcoded roots.
 *
 * BOUNDS: this asserts the build produces a tree whose every import resolves. It does NOT boot the
 * output in a browser — see the ticket's AC-4, which remains open for the headless boot arm.
 *
 * @see https://github.com/neomjs/neo/issues/17921
 */
test.describe('esmodules.mjs — a greenfield workspace build', () => {
    const
        engineRoot = path.resolve(import.meta.dirname, '../../../..'),
        buildPath  = path.join(engineRoot, 'buildScripts/build/esmodules.mjs');

    let workspace, external;

    /**
     * Writes the minimum workspace that reproduces the shipped failure. The engine copy is a stub
     * rather than the real `src/`: the defect is about path arithmetic and copy sets, so a real
     * engine would add minutes of Terser work without adding a single observation.
     */
    const createWorkspace = ({computedFamily, declareExtraRoot, engineReExport, sourceRoots}) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-ws-'));

        fs.outputJsonSync(path.join(root, 'package.json'), {
            name   : 'my-workspace',
            version: '1.0.0',
            ...(sourceRoots ? {neo: {esmSourceRoots: sourceRoots}} : {}),
            ...(declareExtraRoot ? {neo: {esmSourceRoots: ['components']}} : {})
        });

        // A re-export of the engine. The rewrite matched `import` only, so this specifier used to
        // survive into the output and address the workspace's own engine from inside dist/esm.
        if (engineReExport) {
            fs.outputFileSync(path.join(root, 'components/engine.mjs'),
                "export {default as Base} from '../node_modules/neo.mjs/src/core/Base.mjs';\n")
        }

        // A lazily-loaded family whose directory the output tree does not have. The module itself is
        // emitted and every literal specifier in it resolves; only the interpolated root is absent,
        // which is the shape the engine's own optional branches take (`examples/`, `docs/app/`, `WS/`
        // addons) and which no consuming workspace can supply. See #17971.
        if (computedFamily) {
            fs.outputFileSync(path.join(root, 'components/Lazy.mjs'),
                'export const load = name => import(`../plugins/${name}.mjs`);\n')
        }

        // The engine, as a workspace consumes it.
        fs.outputFileSync(path.join(root, 'node_modules/neo.mjs/src/core/Base.mjs'),
            'export default class Base {}\n');

        // The component library that lives outside the four hardcoded roots.
        fs.outputFileSync(path.join(root, 'components/Button.mjs'),
            "import Base from '../node_modules/neo.mjs/src/core/Base.mjs';\nexport default class Button extends Base {}\n");

        // The app. Single-quoted, which is the house style the rewrite used not to match.
        fs.outputFileSync(path.join(root, 'apps/myapp/view/Viewport.mjs'),
            "import Base   from '../../../node_modules/neo.mjs/src/core/Base.mjs';\n" +
            "import Button from '../../../components/Button.mjs';\n" +
            'export default class Viewport extends Base {static button = Button}\n');

        fs.outputJsonSync(path.join(root, 'apps/myapp/neo-config.json'), {
            appPath : '../../apps/myapp/app.mjs',
            basePath: '../../'
        });

        return root
    };

    /**
     * Runs the build in the workspace, returning `{status, output}` rather than throwing.
     *
     * Both streams, on every exit code. The previous shape returned `execFileSync`'s stdout when the
     * build succeeded and only reached stderr through the throw path — which made a diagnostic that
     * does NOT fail the build unobservable to a spec, exactly the shape of the warning arm below.
     */
    const runBuild = cwd => {
        const {status, stdout, stderr} = spawnSync('node', [buildPath], {cwd, encoding: 'utf8'});

        return {status, output: `${stdout || ''}${stderr || ''}`}
    };

    test.afterEach(() => {
        workspace && fs.removeSync(workspace);
        external && fs.removeSync(external);
        workspace = external = null
    });

    test('a configured workspace builds a tree whose every import resolves', () => {
        workspace = createWorkspace({declareExtraRoot: true});

        const {status, output} = runBuild(workspace);

        expect(status, `build failed:\n${output}`).toBe(0);

        // The extra root was copied at all — the silent-drop defect.
        expect(fs.existsSync(path.join(workspace, 'dist/esm/components/Button.mjs'))).toBe(true);

        // The engine was flattened out of node_modules, and the app's single-quoted specifier was
        // rewritten to reach it. Asserted through the emitted code, which is what the browser reads.
        const emitted = fs.readFileSync(path.join(workspace, 'dist/esm/apps/myapp/view/Viewport.mjs'), 'utf8');

        expect(emitted).not.toContain('node_modules');
        expect(fs.existsSync(path.join(workspace, 'dist/esm/src/core/Base.mjs'))).toBe(true);

        // The config's relative basePath still gains the output-tree offset.
        expect(fs.readJsonSync(path.join(workspace, 'dist/esm/apps/myapp/neo-config.json')).basePath)
            .toBe('../../../../')
    });

    /**
     * The decisive arm. Before this change the same workspace built "successfully" and exited 0 while
     * emitting an app that imports a component tree nobody copied — the app worker then died on
     * `Failed to fetch dynamically imported module`, with nothing in the build output to explain it.
     */
    test('an undeclared source root fails the build and names the file and specifier', () => {
        workspace = createWorkspace({declareExtraRoot: false});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have failed, output:\n${output}`).toBe(1);
        expect(output).toContain('do not resolve inside the output tree');
        expect(output).toContain('apps/myapp/view/Viewport.mjs');
        expect(output).toContain('components/Button.mjs');
        expect(output).toContain('neo.esmSourceRoots')
    });

    /**
     * The counterpart arm, and the reason the two are worth reading together: an absent directory is
     * a defect when a LITERAL specifier names it (above) and merely a diagnostic when only a computed
     * family reads it (here). This stage cannot tell an uncopied source root from a branch the
     * workspace never takes, and inside this repository the second reading never applies — every
     * default root exists — so the arm shipped fatal and no build here ever noticed. Every consuming
     * workspace failed on it. See #17971.
     */
    test('a computed family whose root is absent warns and leaves the build green', () => {
        workspace = createWorkspace({computedFamily: true, declareExtraRoot: true});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have stayed green, output:\n${output}`).toBe(0);

        // The diagnostic still reaches the developer, naming the module and the absent directory.
        expect(output).toContain('computed import(s) read from a directory the output tree does not have');
        expect(output).toContain('components/Lazy.mjs');

        // Both readings are offered. Asserting the wording is the point: the old text asserted the
        // uncopied-root reading as fact, which is what made a warning look like a build error.
        expect(output).toContain('the branch that reads it is one this workspace never takes');

        // Non-vacuity: the module carrying the computed specifier was really emitted, so the arm
        // cannot pass by the build having skipped the file altogether.
        expect(fs.existsSync(path.join(workspace, 'dist/esm/components/Lazy.mjs'))).toBe(true)
    });

    /**
     * The third arm's exit gate, pinned end to end because narrowing `computed-root` narrowed the
     * expression all three share. `esmDistTransforms.spec.mjs` proves `findUnresolvableImports`
     * still CLASSIFIES this as `engine-identity`; only a real build proves the classification still
     * reaches `process.exit(1)`.
     *
     * The specifier is deliberately root-relative rather than a shape house style produces. The
     * rewrite drops the `node_modules/neo.mjs/` segment only from a specifier containing it with a
     * leading slash; without one it takes the other branch, gains `../../`, and arrives in the output
     * tree still addressing the workspace's own engine. Contrived as authorship, exact as a probe:
     * the point is a surviving engine-identity residual, and this is the cheapest way to get one.
     */
    test('an emitted specifier that still reaches the workspace engine fails the build', () => {
        workspace = createWorkspace({declareExtraRoot: true});

        fs.outputFileSync(path.join(workspace, 'components/Second.mjs'),
            "export {default} from 'node_modules/neo.mjs/src/core/Base.mjs';\n");

        const {status, output} = runBuild(workspace);

        expect(status, `build should have failed, output:\n${output}`).toBe(1);
        expect(output).toContain('still address the workspace engine at node_modules/neo.mjs');
        expect(output).toContain('two engine graphs cannot share a class registry')
    });

    /**
     * The declared root decides where the build WRITES, so an unvalidated one is an overwrite
     * primitive rather than a copy list. `path.resolve` discards every earlier segment once it meets
     * an absolute one, which collapses the build's input and output onto the same external directory:
     * the tree is read, minified, and written back over itself, outside the workspace entirely.
     *
     * The sentinel is the point of the arm. Asserting only the exit code would pass against a build
     * that refused for some unrelated reason while still having touched the directory.
     */
    test('an absolute declared root is refused and the external tree is left byte-identical', () => {
        external = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-external-'));

        const
            sentinelPath = path.join(external, 'keep.mjs'),
            sentinel     = '// not the build\'s to touch\nexport default class Keep {}\n';

        fs.outputFileSync(sentinelPath, sentinel);

        workspace = createWorkspace({sourceRoots: [external]});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have refused, output:\n${output}`).toBe(1);
        expect(output).toContain('esmSourceRoots');
        expect(fs.readFileSync(sentinelPath, 'utf8')).toBe(sentinel);
        expect(fs.existsSync(path.join(external, 'dist'))).toBe(false)
    });

    /** The traversing spelling of the same request: it must not emit beside the output tree. */
    test('a traversing declared root is refused before anything is written', () => {
        workspace = createWorkspace({sourceRoots: ['../../outside']});

        const {status, output} = runBuild(workspace);

        expect(status, `build should have refused, output:\n${output}`).toBe(1);
        expect(output).toContain('esmSourceRoots');
        expect(fs.existsSync(path.join(workspace, 'dist'))).toBe(false)
    });

    /**
     * The re-export arm. `export … from` was not part of the rewrite pattern, so this specifier
     * reached the output unchanged — and there it either dangles or, worse, resolves back to the
     * workspace's own engine source and boots a second module graph. Either way the build used to
     * exit 0.
     */
    test('a re-export of the engine is rewritten to the flattened copy', () => {
        workspace = createWorkspace({declareExtraRoot: true, engineReExport: true});

        const {status, output} = runBuild(workspace);

        expect(status, `build failed:\n${output}`).toBe(0);

        const emitted = fs.readFileSync(path.join(workspace, 'dist/esm/components/engine.mjs'), 'utf8');

        expect(emitted).not.toContain('node_modules');
        expect(emitted).toContain('../src/core/Base.mjs')
    });

    /** An absolute mount must survive the config rewrite; `../..//mount/` resolves nowhere. */
    test('an absolute basePath passes through the emitted neo-config', () => {
        workspace = createWorkspace({declareExtraRoot: true});
        fs.outputJsonSync(path.join(workspace, 'apps/myapp/neo-config.json'), {
            appPath : '../../apps/myapp/app.mjs',
            basePath: '/mount/'
        });

        const {status, output} = runBuild(workspace);

        expect(status, `build failed:\n${output}`).toBe(0);

        const config = fs.readJsonSync(path.join(workspace, 'dist/esm/apps/myapp/neo-config.json'));

        expect(config.basePath).toBe('/mount/');
        expect(config.workerBasePath).toBe('/mount/src/worker/')
    })
});
