import {spawnSync}                               from 'node:child_process';
import fs                                        from 'node:fs';
import os                                        from 'node:os';
import path                                      from 'node:path';
import {fileURLToPath}                           from 'node:url';
import {test, expect}                            from '@playwright/test';
import {getBuildId, stampBuildId, stampDeferred} from '../../../../buildScripts/util/buildId.mjs';

/**
 * @summary Pins the build identity: one id per run, inherited by the steps it spawns, and published in a dist folder
 * only by the stamp that a successful build runs.
 */
test.describe('buildScripts/util/buildId', () => {
    test('a build run resolves one id, and the steps it spawns inherit it', () => {
        const original = process.env.NEO_BUILD_ID;

        delete process.env.NEO_BUILD_ID;

        try {
            const buildId = getBuildId();

            expect(buildId).toMatch(/^[0-9a-z]+$/);
            expect(getBuildId(), 'later steps of the run read the same id').toBe(buildId);
            expect(process.env.NEO_BUILD_ID, 'spawned steps inherit it through the environment').toBe(buildId)
        } finally {
            if (original === undefined) {
                delete process.env.NEO_BUILD_ID
            } else {
                process.env.NEO_BUILD_ID = original
            }
        }
    });

    test('a stamp publishes the id in every app config and worker script, and a later stamp replaces it', () => {
        const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-build-id-'));

        const write = (file, content) => {
            fs.mkdirSync(path.dirname(path.join(dist, file)), {recursive: true});
            fs.writeFileSync(path.join(dist, file), content)
        };

        const read = file => fs.readFileSync(path.join(dist, file), 'utf8');

        try {
            write('apps/portal/neo-config.json',  JSON.stringify({appPath: 'apps/portal/app.mjs'}));
            write('examples/grid/neo-config.json', JSON.stringify({appPath: 'examples/grid/app.mjs'}, null, 4));
            write('serviceworker.js',              'class e{static buildStamp="neo-build-id:"}');
            write('ServiceWorker.mjs',             'import ServiceBase from"./src/worker/ServiceBase.mjs";');
            write('src/worker/ServiceBase.mjs',    'class ServiceBase{static buildStamp="neo-build-id:"}');

            stampBuildId({buildId: 'b1', distPath: dist});

            expect(JSON.parse(read('apps/portal/neo-config.json')).buildId).toBe('b1');
            expect(read('apps/portal/neo-config.json'), 'a compact config stays compact').not.toContain('\n');
            expect(read('examples/grid/neo-config.json'), 'a readable config stays readable').toContain('\n    "buildId": "b1"');
            expect(read('serviceworker.js')).toContain('"neo-build-id:b1"');
            expect(read('src/worker/ServiceBase.mjs')).toContain('"neo-build-id:b1"');
            expect(read('ServiceWorker.mjs'), 'the ESM entry\'s own bytes change too').toContain('// neo-build-id:b1');

            // A later build, e.g. of one thread, publishes its own id, and finds the previous one whole
            stampBuildId({buildId: 'Rel_2-c', distPath: dist});
            stampBuildId({buildId: 'c2', distPath: dist});

            expect(JSON.parse(read('apps/portal/neo-config.json')).buildId).toBe('c2');
            expect(read('serviceworker.js')).toBe('class e{static buildStamp="neo-build-id:c2"}');
            expect(read('ServiceWorker.mjs').match(/neo-build-id:/g), 'one stamp comment, replaced').toHaveLength(1);
            expect(read('ServiceWorker.mjs')).toContain('// neo-build-id:c2')
        } finally {
            fs.rmSync(dist, {force: true, recursive: true})
        }
    });

    test('a stamp of a dist folder that does not exist does nothing', () => {
        expect(() => stampBuildId({buildId: 'b1', distPath: path.join(os.tmpdir(), 'neo-build-id-missing-dist')})).not.toThrow()
    });

    test('an id a URL or a later stamp could not carry whole is refused', () => {
        expect(() => stampBuildId({buildId: 'a b', distPath: os.tmpdir()})).toThrow(/may only hold/);
        expect(() => stampBuildId({buildId: 'a/b', distPath: os.tmpdir()})).toThrow(/may only hold/)
    });

    test('a step run with --no-stamp leaves the stamp to the build that runs it', () => {
        expect(stampDeferred(['node', 'esmodules.mjs', '--no-stamp'])).toBe(true);
        expect(stampDeferred(['node', 'esmodules.mjs'])).toBe(false)
    })
});

/**
 * @summary Pins who publishes the id: `buildThreads.mjs` run on its own, after its threads, and `all.mjs`, after its last
 * step. Each script runs for real with `child_process` stubbed, so no step builds anything and any one can fail.
 */
test.describe('buildScripts: a build publishes its id only once it succeeded', () => {
    const
        buildAllArgs = ['-e', 'all', '-n', '-l', 'no', '-t', 'no', '-p', 'no', '-w', 'yes'],
        distPaths    = ['dist/development', 'dist/production', 'dist/esm'],
        preload      = fileURLToPath(new URL('./fixtures/registerChildProcessStub.mjs', import.meta.url)),
        repoRoot     = fileURLToPath(new URL('../../../../', import.meta.url));

    let workspace;

    const run = (script, args, fail='') => {
        const log      = path.join(workspace, 'steps.log'),
              {status} = spawnSync(process.execPath, ['--import', preload, path.join(repoRoot, script), ...args], {
                  cwd     : workspace,
                  encoding: 'utf8',
                  env     : {...process.env, NEO_BUILD_ID: 'run1', NEO_STUB_FAIL: fail, NEO_STUB_LOG: log}
              });

        return {status, steps: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''}
    };

    const published = () => distPaths.map(dist =>
        JSON.parse(fs.readFileSync(path.join(workspace, dist, 'apps/demo/neo-config.json'), 'utf8')).buildId
    );

    test.beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-build-publish-'));

        const write = (file, content) => {
            fs.mkdirSync(path.dirname(path.join(workspace, file)), {recursive: true});
            fs.writeFileSync(path.join(workspace, file), content)
        };

        write('package.json', JSON.stringify({name: 'neo.mjs', version: '0.0.0'}));
        write('node_modules/webpack/package.json', JSON.stringify({name: 'webpack', version: '0.0.0', bin: {webpack: 'bin/webpack.js'}}));

        distPaths.forEach(dist => write(`${dist}/apps/demo/neo-config.json`, JSON.stringify({buildId: 'previous'})));
        write('dist/development/serviceworker.js',   'class e{static buildStamp="neo-build-id:previous"}');
        write('dist/production/serviceworker.js',    'class e{static buildStamp="neo-build-id:previous"}');
        write('dist/esm/src/worker/ServiceBase.mjs', 'class ServiceBase{static buildStamp="neo-build-id:previous"}')
    });

    test.afterEach(() => {
        fs.rmSync(workspace, {force: true, recursive: true})
    });

    test('build-all runs its build steps with --no-stamp and publishes its id after its last step', () => {
        const {status, steps} = run('buildScripts/build/all.mjs', buildAllArgs);

        expect(status).toBe(0);
        expect(steps).toMatch(/buildThreads\.mjs -e all -t all -n --no-stamp/);
        expect(steps).toMatch(/esmodules\.mjs --no-stamp/);
        expect(published()).toEqual(['run1', 'run1', 'run1']);
        expect(fs.readFileSync(path.join(workspace, 'dist/production/serviceworker.js'), 'utf8')).toContain('neo-build-id:run1');
        expect(fs.readFileSync(path.join(workspace, 'dist/esm/src/worker/ServiceBase.mjs'), 'utf8')).toContain('neo-build-id:run1')
    });

    test('an ESM-only build-all publishes only dist/esm', () => {
        const {status, steps} = run('buildScripts/build/all.mjs', ['-e', 'esm', ...buildAllArgs.slice(2)]);

        expect(status).toBe(0);
        expect(steps).not.toMatch(/buildThreads\.mjs/);
        expect(published()).toEqual(['previous', 'previous', 'run1'])
    });

    test('build-all copies the docs JSON into dist/esm after its steps, never inside them', () => {
        fs.mkdirSync(path.join(workspace, 'docs/output'), {recursive: true});
        fs.writeFileSync(path.join(workspace, 'docs/output/all.json'), '[]');

        const {status, steps} = run('buildScripts/build/all.mjs', buildAllArgs);

        expect(status).toBe(0);
        expect(steps, 'esmodules.mjs runs beside generate-docs-json and leaves the copy to build-all').toMatch(/esmodules\.mjs --no-stamp --no-docs-output/);
        expect(fs.readFileSync(path.join(workspace, 'dist/esm/docs/output/all.json'), 'utf8')).toBe('[]')
    });

    for (const step of ['esmodules.mjs', 'seo/copy.mjs']) {
        test(`a build-all whose ${step} step fails publishes nothing`, () => {
            expect(run('buildScripts/build/all.mjs', buildAllArgs, step).status).toBe(7);
            expect(published()).toEqual(['previous', 'previous', 'previous'])
        })
    }

    test('buildThreads on its own publishes after its threads, unless told not to, and never after a failed thread', () => {
        const script = 'buildScripts/webpack/buildThreads.mjs',
              args   = ['-e', 'all', '-n', '-t', 'canvas'];

        expect(run(script, [...args, '--no-stamp']).status).toBe(0);
        expect(published(), 'run by build-all, it leaves the stamp to the run').toEqual(['previous', 'previous', 'previous']);

        expect(run(script, args, 'worker=canvas').status).toBe(7);
        expect(published(), 'a failed thread publishes nothing').toEqual(['previous', 'previous', 'previous']);

        expect(run(script, args, 'production/webpack.config').status).toBe(7);
        expect(published(), 'a production thread that fails after development built publishes neither').toEqual(['previous', 'previous', 'previous']);

        expect(run(script, args).status).toBe(0);
        expect(published(), 'a partial build on its own publishes its id').toEqual(['run1', 'run1', 'previous'])
    })
});
