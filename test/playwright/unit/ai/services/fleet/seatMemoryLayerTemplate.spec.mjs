import {test, expect}                from '@playwright/test';
import {execFileSync}                from 'node:child_process';
import fs                            from 'node:fs';
import os                            from 'node:os';
import path                          from 'node:path';
import {renderIdentityAnchorHookMjs} from '../../../../../../ai/services/fleet/seatMemoryLayerTemplate.mjs';

const repoRoot = process.cwd();

/**
 * @summary Pins the identity-anchor hook renderer and its wake-route appendix.
 *
 * The rendered hook is a fail-open injector: any error exits 0 with NO output, so "nothing to
 * emit" and "the emitter threw" are indistinguishable by behavior. The wake-route appendix (the
 * session-scoped poll's re-registration reminder) rides that injection for seats carrying the
 * pull-bridge wake route. A broken render must therefore be a red test, not a silent absence —
 * the fail-open contract means this suite is the only layer where the failure is observable.
 */
test.describe('seatMemoryLayerTemplate — identity-anchor hook renderer', () => {
    const rendered = renderIdentityAnchorHookMjs({memoryDir: '/x/memory'});

    test('the rendered source contains the wake-route appendix push and its envelope guard', () => {
        expect(rendered).toContain('<!-- wake-route -->');
        expect(rendered).toContain("wake-envelope.json");
        // The guard is conditional on the route's own artifact — non-route seats pay nothing.
        expect(rendered).toMatch(/existsSync\(path\.join\([^\)]*wake-envelope\.json/);
        // The appendix lands INSIDE the seat-memory-layer block, not after it.
        expect(rendered.indexOf('<!-- wake-route -->')).toBeLessThan(rendered.indexOf("sections.push('</seat-memory-layer>')"));
        // The rendered hook is itself valid JavaScript.
        const tmp = path.join(os.tmpdir(), `identity-anchor-render-${process.pid}.mjs`);

        try {
            fs.writeFileSync(tmp, rendered);
            const check = execFileSync('node', ['--check', tmp], {encoding: 'utf8', stdio: 'pipe'});
            expect(check).toBe('')
        } finally {
            fs.rmSync(tmp, {force: true})
        }
    });

    test('behavioral: the emitted hook appends the appendix only when the envelope exists', () => {
        const tmpRoot  = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-hook-')),
              hookFile = path.join(tmpRoot, 'hook.mjs'),
              withEnv  = path.join(tmpRoot, 'with-envelope'),
              bareEnv  = path.join(tmpRoot, 'bare');

        try {
            fs.writeFileSync(hookFile, rendered);
            fs.mkdirSync(withEnv, {recursive: true});
            fs.mkdirSync(bareEnv, {recursive: true});
            fs.writeFileSync(path.join(withEnv, 'wake-envelope.json'), '{}');

            const payload = JSON.stringify({hook_event_name: 'UserPromptSubmit', session_id: `spec-${process.pid}`, cwd: repoRoot}),
                  run     = home => execFileSync('node', [hookFile], {
                      encoding: 'utf8',
                      env     : {...process.env, KIMI_CODE_HOME: home},
                      input   : payload
                  });

            const withOutput = run(withEnv),
                  bareOutput = run(bareEnv);

            expect(withOutput).toContain('<!-- wake-route -->');
            expect(withOutput).toContain('Wake poll is session-scoped');
            expect(bareOutput).not.toContain('<!-- wake-route -->');
            expect(bareOutput).toContain('<seat-memory-layer')
        } finally {
            fs.rmSync(tmpRoot, {recursive: true, force: true})
        }
    });
});
