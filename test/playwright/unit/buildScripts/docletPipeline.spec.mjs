import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

test.describe('docs doclet pipeline — deterministic source order (#17499)', () => {
    let parse;

    test.beforeAll(async () => {
        ({parse} = await import(
            '../../../../buildScripts/docs/docletPipeline/index.mjs'
        ))
    });

    test('two discovery permutations generate the same doclets', async () => {
        const
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-doclet-order-')),
            alpha   = path.join(tempDir, 'Alpha.mjs'),
            beta    = path.join(tempDir, 'Beta.mjs');

        fs.writeFileSync(alpha, `/** @class Alpha */\nexport default class Alpha {}\n`);
        fs.writeFileSync(beta, `/** @class Beta @augments Alpha */\nexport default class Beta {}\n`);

        const
            forward  = [alpha, beta],
            reverse  = [beta, alpha],
            discover = files => async () => files.slice(),
            options  = {
                access        : 'all',
                files         : [path.join(tempDir, '*.mjs')],
                includePattern: '.+\\.(m)js(doc)?$',
                recurse       : true,
                undocumented  : false
            };

        try {
            // Observe the production list at the runner boundary. A parser version that happens to
            // normalize this tiny fixture internally must not make deletion of our order boundary
            // green.
            const observedOrders = [];
            const observeOrder   = async runnerOptions => {
                observedOrders.push(runnerOptions.files.slice());
                return []
            };

            await parse(options, {glob: discover(reverse), runJSDoc: observeOrder});
            await parse(options, {glob: discover(forward), runJSDoc: observeOrder});

            expect(observedOrders[0]).toEqual(observedOrders[1]);

            const
                first  = await parse(options, {glob: discover(reverse)}),
                second = await parse(options, {glob: discover(forward)});

            expect(first.length, 'non-vacuity: the fixture produced real JSDoc records')
                .toBeGreaterThan(0);
            expect(first).toEqual(second)
        } finally {
            fs.rmSync(tempDir, {recursive: true, force: true})
        }
    })
});
