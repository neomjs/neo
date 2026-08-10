import {expect, test}                                             from '@playwright/test';
import {createEmbeddingIdentityWindow, fingerprintEmbeddingInput} from '../../../../../../ai/services/shared/embeddingIdentityWindow.mjs';

/**
 * @summary Coverage for the re-embed ratio window.
 *
 * The ratio is the discriminator between "the loop does not converge" and "the load is legitimate".
 * The tests that matter are the ones proving it cannot be read as an alarm on its own: a clean run
 * holds at exactly 1, honest duplication raises it, and an unobserved window reports `null` rather
 * than the value of a clean run.
 */
test.describe('ai/services/shared embeddingIdentityWindow', () => {
    test('a clean run holds the ratio at exactly 1 (#16780 AC-3)', () => {
        const w = createEmbeddingIdentityWindow({now: () => 1000});

        w.recordSubmissions(['alpha', 'beta', 'gamma', 'delta']);

        const window = w.getWindow();

        expect(window.submissions).toBe(4);
        expect(window.distinct).toBe(4);
        expect(window.ratio, 'every input embedded once — this is what convergence looks like').toBe(1);
        expect(window.truncated).toBe(false);
    });

    test('repeated content moves the ratio ABOVE 1 (#16780 AC-3)', () => {
        const w = createEmbeddingIdentityWindow({now: () => 1000});

        // Two sweeps re-embedding the identical set — the non-convergence shape.
        w.recordSubmissions(['alpha', 'beta']);
        w.recordSubmissions(['alpha', 'beta']);

        const window = w.getWindow();

        expect(window.submissions).toBe(4);
        expect(window.distinct, 'the same two texts, whatever the sweep count').toBe(2);
        expect(window.ratio, 'four submissions for two distinct inputs').toBe(2);
    });

    test('a ratio above 1 is NOT by itself a defect — the negative control (#16780 AC-6)', () => {
        // A legitimately large ingestion with honest duplication: two guides quoting one snippet.
        // This test exists to pin that the module reports the ratio and reaches NO verdict, because
        // an alarm keyed on `ratio > 1` fires here — on correct work — and is disabled within a week.
        const w = createEmbeddingIdentityWindow({now: () => 1000});

        w.recordSubmissions(Array.from({length: 500}, (_, i) => `unique body ${i}`));
        w.recordSubmissions(['the shared snippet', 'the shared snippet']);

        const window = w.getWindow();

        expect(window.ratio, 'genuinely duplicated corpus content raises the ratio').toBeGreaterThan(1);
        expect(window.ratio, 'but barely — the shape of honest duplication, not of a loop').toBeLessThan(1.01);
        expect(Object.keys(window), 'the window reports; it must not adjudicate')
            .toEqual(['coverageStartedAt', 'distinct', 'ratio', 'submissions', 'truncated']);
    });

    test('an UNOBSERVED window reports null, never the value of a clean run (#16780 AC-3)', () => {
        // The false-zero guard. Returning 1 here would tell an operator "no repetition" for a process
        // that has not looked — indistinguishable from a converging sweep, which is the exact
        // conflation the WAL drain receipt already had to fix one layer down.
        const w = createEmbeddingIdentityWindow({now: () => 5000});

        expect(w.getWindow().ratio, 'nothing observed is not the same fact as nothing repeated').toBeNull();
        expect(w.getWindow().coverageStartedAt, 'and the boundary is on the surface').toBe(5000);
    });

    test('eviction is reported, so a bounded window cannot claim a total (#16780 AC-3)', () => {
        const w = createEmbeddingIdentityWindow({limit: 4, now: () => 1000});

        w.recordSubmissions(['a', 'b', 'c', 'd', 'e', 'f']);

        const window = w.getWindow();

        expect(window.submissions, 'only the retained tail is counted').toBe(4);
        expect(window.truncated, 'earlier submissions left the window — the ratio is partial').toBe(true);
    });

    test('a window that never evicted is NOT truncated — the bound on the flag (#16780 AC-3)', () => {
        // Without this, "always truncated" satisfies the test above and the flag carries no signal.
        const w = createEmbeddingIdentityWindow({limit: 4, now: () => 1000});

        w.recordSubmissions(['a', 'b']);

        expect(w.getWindow().truncated).toBe(false);
    });

    test('identity is content, not position or object (#16780 AC-3)', () => {
        // The fingerprint must collapse equal text regardless of where it came from, or two sweeps
        // over the same corpus read as distinct work and the ratio stays at 1 while looping forever.
        expect(fingerprintEmbeddingInput('same body')).toBe(fingerprintEmbeddingInput('same body'));
        expect(fingerprintEmbeddingInput('same body')).not.toBe(fingerprintEmbeddingInput('other body'));
    });
});
