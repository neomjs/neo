import {expect, test}   from '@playwright/test';
import {planSideBySide} from '../../e2e/utils/filmStage.mjs';

/**
 * @summary Unit coverage for the side-by-side stage planner.
 *
 * The planner was inline in one journey behind a film-take and macOS gate, so no ordinary run could
 * reach it and an arithmetic regression would have surfaced on a capture night or not at all. As a
 * module export it is a pure function over a measured envelope, which is what lets these arms exist.
 */

const roomy = {availHeight: 1084, availLeft: 0, availTop: 25, availWidth: 1669};

test('a display too narrow for two windows is refused, and the reason names what was measured', () => {
    const plan = planSideBySide({availHeight: 900, availLeft: 0, availTop: 0, availWidth: 1100});

    expect(plan.fits).toBe(false);
    expect(plan.main).toBeNull();
    expect(plan.target).toBeNull();
    expect(plan.reason, 'a refusal without its measurement sends the next reader to take it again')
        .toContain('1100×900')
});

test('a display too short for two windows is refused', () => {
    const plan = planSideBySide({availHeight: 600, availLeft: 0, availTop: 0, availWidth: 1900});

    expect(plan.fits).toBe(false);
    expect(plan.reason).toContain('1900×600')
});

test('a roomy display yields two rects that cannot overlap', () => {
    const {fits, main, target} = planSideBySide(roomy);

    expect(fits).toBe(true);
    expect(main.left + main.width, 'the target begins only after the main window ends')
        .toBeLessThanOrEqual(target.left)
});

test('the arrangement begins at the available origin rather than at zero', () => {
    const plan = planSideBySide({availHeight: 1084, availLeft: 1680, availTop: 25, availWidth: 1669});

    expect(plan.main.left, 'a second display starts where the first one ends').toBe(1700);
    expect(plan.main.top, 'the menu bar owns the top of the envelope').toBe(65)
});

test('both windows stay inside the envelope they were planned against', () => {
    const {main, target} = planSideBySide(roomy);

    expect(target.left + target.width).toBeLessThanOrEqual(roomy.availLeft + roomy.availWidth);
    expect(main.top   + main.height).toBeLessThanOrEqual(roomy.availTop  + roomy.availHeight);
    expect(target.top + target.height).toBeLessThanOrEqual(roomy.availTop + roomy.availHeight)
});

test('a caller may raise the floor, and a display clearing the default fails the stricter gate', () => {
    expect(planSideBySide(roomy).fits).toBe(true);
    expect(planSideBySide(roomy, {minWidth: 2560}).fits).toBe(false)
});

test('the gap belongs to the caller, and widening it moves the target further right', () => {
    const narrow = planSideBySide(roomy, {gap: 24}),
          wide   = planSideBySide(roomy, {gap: 120});

    expect(narrow.target.left - (narrow.main.left + narrow.main.width)).toBe(24);
    expect(wide.target.left   - (wide.main.left   + wide.main.width)).toBe(120)
});

test('a gap too wide for the display is refused rather than returned as a negative width', () => {
    // @neo-gpt-emmy's reproduction. The envelope clears BOTH floors, so the gate passes, and the
    // arithmetic then subtracts the caller's gap into a main width of -44 while the verdict still
    // says it fitted. Clearing the envelope floors is not the same as the arrangement fitting.
    const plan = planSideBySide({availHeight: 700, availLeft: 0, availTop: 0, availWidth: 1200}, {gap: 800});

    expect(plan.fits, 'an impossible arrangement is refused, not returned').toBe(false);
    expect(plan.main).toBeNull();
    expect(plan.target).toBeNull();
    expect(plan.reason, 'the refusal names the gap that caused it').toContain('800px gap');
    expect(plan.reason, 'and the measurement that failed').toContain('main width')
});

test('a gap that still leaves usable rects is honoured, so the guard refuses only the impossible', () => {
    const {fits, main, target} = planSideBySide(
        {availHeight: 700, availLeft: 0, availTop: 0, availWidth: 1200},
        {gap: 200}
    );

    expect(fits).toBe(true);
    expect(main.width,    'every returned rect is usable').toBeGreaterThan(0);
    expect(main.height).toBeGreaterThan(0);
    expect(target.width).toBeGreaterThan(0);
    expect(target.height).toBeGreaterThan(0);
    expect(main.left + main.width, 'and they are still apart').toBeLessThanOrEqual(target.left)
});
