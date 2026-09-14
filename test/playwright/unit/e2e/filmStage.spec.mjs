import {expect, test}                                                from '@playwright/test';
import {placeBesideSource, planBeside, planSideBySide, rectsOverlap} from '../../e2e/utils/filmStage.mjs';

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

test('rects that sit apart do not overlap, and rects that merely touch do not either', () => {
    const left  = {height: 100, left: 0,   top: 0, width: 100},
          apart = {height: 100, left: 200, top: 0, width: 100},
          flush = {height: 100, left: 100, top: 0, width: 100};

    expect(rectsOverlap(left, apart), 'a clear gap is not an overlap').toBe(false);
    expect(rectsOverlap(left, flush), 'sharing an edge is not sharing an area').toBe(false)
});

test('rects that share area overlap, including one wholly inside the other', () => {
    const outer   = {height: 100, left: 0,  top: 0,  width: 100},
          partial = {height: 100, left: 50, top: 50, width: 100},
          inside  = {height: 10,  left: 40, top: 40, width: 10};

    expect(rectsOverlap(outer, partial)).toBe(true);
    expect(rectsOverlap(outer, inside), 'containment is the extreme case of overlap').toBe(true)
});

test('a target is planned to the right of its source when the room is there', () => {
    const plan = planBeside(
        {height: 700, left: 20, top: 40, width: 800},
        {height: 400, width: 460},
        roomy
    );

    expect(plan.fits).toBe(true);
    expect(plan.bounds.left, 'source right edge plus the default gap').toBe(860);
    expect(plan.bounds.top).toBe(40);
    expect(plan.bounds.width, 'the target keeps its own size').toBe(460)
});

test('a target falls back to the left when the right would leave the display', () => {
    const plan = planBeside(
        {height: 700, left: 1100, top: 40, width: 540},
        {height: 400, width: 460},
        roomy
    );

    expect(plan.fits).toBe(true);
    expect(plan.bounds.left, 'left slot: source left minus target width minus gap').toBe(600)
});

test('a target falls back below when neither side has room', () => {
    const plan = planBeside(
        {height: 300, left: 300, top: 40, width: 1000},
        {height: 400, width: 460},
        {availHeight: 1084, availLeft: 0, availTop: 25, availWidth: 1440}
    );

    expect(plan.fits).toBe(true);
    expect(plan.bounds.left).toBe(300);
    expect(plan.bounds.top, 'below: source bottom plus the gap').toBe(380)
});

test('an impossible arrangement is refused, and the reason carries display, source and target', () => {
    const plan = planBeside(
        {height: 1000, left: 0, top: 0, width: 1200},
        {height: 800, width: 900},
        {availHeight: 1000, availLeft: 0, availTop: 0, availWidth: 1200}
    );

    expect(plan.fits).toBe(false);
    expect(plan.bounds).toBeNull();
    expect(plan.reason).toContain('1200×1000');
    expect(plan.reason, 'the reader must not have to re-measure any of the three').toContain('900×800')
});

test('a planned target never overlaps the source it was planned beside', () => {
    const source = {height: 700, left: 20, top: 40, width: 800},
          target = {height: 400, width: 460};

    [20, 40, 120].forEach(gap => {
        const plan = planBeside(source, target, roomy, {gap});

        expect(plan.fits, `gap ${gap}`).toBe(true);
        expect(rectsOverlap(source, plan.bounds), `gap ${gap} must leave them apart`).toBe(false)
    })
});

/**
 * A page stub is enough for the no-move path, which by contract reaches no CDP session: it polls the
 * observable rects, judges them, and answers. Driving it with real windows would prove the same
 * thing slower and only where a display exists.
 */
const stubPage = ({rect, emulated = false}) => ({
    evaluate      : async () => ({
        devicePixelRatio: 1,
        inner           : {height: rect.height, width: rect.width, x: rect.left, y: rect.top},
        outer           : {height: rect.height, width: rect.width},
        root            : null
    }),
    viewportSize  : () => emulated ? {height: 720, width: 760} : null,
    waitForTimeout: async () => {},
    waitForURL    : async () => {}
});

// @neo-gpt-emmy's review probe, kept at her exact numbers. The source and target already miss each
// other, so the no-move path answered before consulting the envelope the caller declared — and
// called a target reaching x=1420 a fit on an 800-wide stage.
const apartSource = {height: 700, left: 20, top: 0, width: 760},
      apartTarget = {height: 500, left: 820, top: 0, width: 600};

test('a target parked outside a declared envelope is refused, even though the windows are apart', async () => {
    const verdict = await placeBesideSource(
        stubPage({rect: apartSource}),
        stubPage({rect: apartTarget}),
        {envelope: {availHeight: 720, availLeft: 0, availTop: 0, availWidth: 800}}
    );

    expect(verdict.fits, 'a target reaching x=1420 does not fit an 800-wide stage').toBe(false);
    expect(verdict.moved).toBe(false);
    expect(verdict.reason, 'the refusal names what it measured').toContain('800×720')
});

test('the same arrangement on a stage that can hold it is kept untouched and reported trusted', async () => {
    const verdict = await placeBesideSource(
        stubPage({rect: apartSource}),
        stubPage({rect: apartTarget}),
        {envelope: {availHeight: 900, availLeft: 0, availTop: 0, availWidth: 1600}}
    );

    expect(verdict).toMatchObject({fits: true, moved: false, stageTrusted: true})
});

test('an emulated page with no declared envelope reports its containment as unproven', async () => {
    const verdict = await placeBesideSource(
        stubPage({emulated: true, rect: apartSource}),
        stubPage({emulated: true, rect: apartTarget})
    );

    expect(verdict, 'apart is measured, but no envelope could be established to contain them')
        .toMatchObject({fits: true, moved: false, stageTrusted: false})
});
