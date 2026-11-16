import fs                         from 'node:fs';
import os                         from 'node:os';
import path                       from 'node:path';
import {test, expect}             from '@playwright/test';
import {getBuildId, stampBuildId} from '../../../../buildScripts/util/buildId.mjs';

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
    })
});
