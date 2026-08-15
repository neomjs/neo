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
    const rendered = renderIdentityAnchorHookMjs({memoryDir: '/x/memory', canonicalRoot: '/x/canonical'});

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

    test('the canonical boot set is baked as a live canonicalRoot read, after the seat files (#17147)', () => {
        expect(rendered).toContain('const CANONICAL_ROOT  = "/x/canonical";');
        expect(rendered).toContain('const CANONICAL_FILES = ["NOW.md"];');
        // Canonical reads guard on existence — a missing NOW.md skips silently (fail-open).
        expect(rendered).toContain('path.join(CANONICAL_ROOT, file)');
        expect(rendered).toContain('(canonical)');
        // Seat files first, canonical after — self first, then now; both inside the wrapper.
        expect(rendered.indexOf('path.join(MEMORY_DIR, file)')).toBeLessThan(rendered.indexOf('path.join(CANONICAL_ROOT, file)'));
        expect(rendered.indexOf('path.join(CANONICAL_ROOT, file)')).toBeLessThan(rendered.indexOf("sections.push('</seat-memory-layer>')"));
    });

    test('renderer guards: memoryDir and canonicalRoot are both required by name', () => {
        expect(() => renderIdentityAnchorHookMjs()).toThrow(/'memoryDir' must be a non-empty string/);
        expect(() => renderIdentityAnchorHookMjs({memoryDir: '/x/memory'})).toThrow(/'canonicalRoot' must be a non-empty string/);
    });

    test('behavioral: the canonical NOW block joins the boot injection when present, skips when absent', () => {
        const tmpRoot      = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-canonical-')),
              canonicalDir = path.join(tmpRoot, 'canonical'),
              kimiHome     = path.join(tmpRoot, 'kimi-home'),
              hookFile     = path.join(tmpRoot, 'hook.mjs');

        try {
            fs.mkdirSync(canonicalDir, {recursive: true});
            fs.mkdirSync(kimiHome,     {recursive: true});
            fs.writeFileSync(path.join(canonicalDir, 'NOW.md'), '# NOW — spec fixture\n');
            fs.writeFileSync(hookFile, renderIdentityAnchorHookMjs({memoryDir: '/x/memory', canonicalRoot: canonicalDir}));

            const payload = JSON.stringify({hook_event_name: 'UserPromptSubmit', session_id: `spec-${process.pid}`, cwd: repoRoot}),
                  run     = home => execFileSync('node', [hookFile], {
                      encoding: 'utf8',
                      env     : {...process.env, KIMI_CODE_HOME: home},
                      input   : payload
                  });

            const withNow = run(path.join(tmpRoot, 'home-a'));

            expect(withNow).toContain('<!-- NOW.md (canonical) -->');
            expect(withNow).toContain('# NOW — spec fixture');
            // The canonical block lands INSIDE the seat-memory-layer wrapper.
            expect(withNow.indexOf('<!-- NOW.md (canonical) -->')).toBeLessThan(withNow.indexOf('</seat-memory-layer>'));

            // Absent canonical file: the marker vanishes, the wrapper still emits (fail-open).
            fs.rmSync(path.join(canonicalDir, 'NOW.md'));

            const withoutNow = run(path.join(tmpRoot, 'home-b'));

            expect(withoutNow).not.toContain('(canonical)');
            expect(withoutNow).toContain('<seat-memory-layer');
        } finally {
            fs.rmSync(tmpRoot, {recursive: true, force: true})
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
