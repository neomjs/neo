import {expect, test}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';

// A fresh realm selects each module-time scheduler without polluting other specs' Neo singleton or timer globals.
for (const scheduler of ['timeout', 'raf']) {
    for (const scenario of ['pause-resume', 'motion', 'retire', 'refresh', 'direct-render', 'still-input', 'paused-input', 'resume-control']) {
        test(`${scheduler}: ${scenario} keeps one draw owner`, () => {
            const output = execFileSync(process.execPath, [
                fileURLToPath(new URL('./fixtures/roundTableLoop.mjs', import.meta.url)), scheduler, scenario
            ], {cwd: new URL('../../../../', import.meta.url), encoding: 'utf8', timeout: 10000}),
                  result = JSON.parse(output.trim().split('\n').at(-1)),
                  stopped = ['still-input', 'paused-input'].includes(scenario);

            expect(result.suspended, 'no queued callback survives suspension or graph retirement').toEqual(result.suspended.map(() => 0));
            expect(result.pending).toEqual(result.pending.map(() => stopped ? 0 : 1));
            expect(result.draws, 'five scheduler ticks never become two or more draw chains').toEqual(Array(5).fill(stopped ? 0 : 1));
            expect(result.remaining).toBe(stopped ? 0 : 1);
            if (!stopped) expect(result.clockAdvanced, 'successive frames still advance the replay').toBe(true);
            if (scenario === 'refresh') expect(result.inputDraws, 'a moving scene waits for its pending frame, even with handle zero').toBe(0);
            if (scenario === 'still-input') expect(result.inputDraws, 'a still scene can repaint an input change').toBe(1);
            if (scenario === 'paused-input') expect(result.inputDraws).toBe(0)
        })
    }
}
