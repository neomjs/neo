import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the dock edge rail's paint is engine capability, skinned by token.
 *
 * The rail's whole visual identity used to exist once, as four declarations inside
 * `apps/workstation/Workspace.scss`. A second consumer could reach that look only by copying CSS
 * out of another application — there was no layer that answered "what does a dock rail look like".
 *
 * The promotion is deliberately NOT a redesign: the engine's defaults are empty identity slots
 * (`transparent` / `0` / `0` / `none`), the same class of token as `--dock-splitter-ring`, so every
 * shipped consumer renders byte-identically. That makes the naive control useless — removing the
 * engine defaults cannot change a bare consumer, because those defaults ARE the CSS initial values.
 *
 * So the two arms observe the two halves of what actually changed:
 *
 *   1. PRESERVATION — the workstation's rail is byte-identical to its pre-promotion reading. Its
 *      values now travel token → engine rule instead of being declared in the app; a token that
 *      resolved differently, or an app declaration that survived and shadowed the engine, fails here.
 *   2. CAPABILITY — a consumer that ships NO rail paint (the cockpit) can be skinned by setting the
 *      tokens alone. This is the arm that is red before the change: with no engine rule reading
 *      them, setting these four custom properties resolves to nothing and the strip stays bare.
 *
 * The capability arm mutates in-page rather than asserting a shipped value, for the reason the
 * rail-size coupling control records: one reading cannot tell "the engine reads this token" from
 * "these two happen to agree today".
 *
 * Run: npm run test-e2e -- e2e/dashboard/DockEdgeRailPaintNL --workers=1
 */

// The workstation's pre-promotion reading, captured on `dev` before the engine rule existed.
// Pinned as literals on purpose: a value re-derived from the same tokens the change introduced
// would agree with itself no matter what the promotion did to it.
const WORKSTATION_BASELINE = {
    background: 'color(srgb 0.111373 0.226275 0.233255)',
    border    : '1px solid color(srgb 0.263216 0.565647 0.547137)',
    radius    : '7px',
    shadow    : 'color(srgb 0.368627 0.917647 0.831373 / 0.12) 0px 0px 22px 0px',
    overflow  : 'hidden'
};

const readRail = () => {
    const rail = document.querySelector('.neo-dashboard-dock-edge-rail');

    if (!rail) return null;

    const s = getComputedStyle(rail);

    return {
        background: s.backgroundColor,
        border    : `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
        radius    : s.borderTopLeftRadius,
        shadow    : s.boxShadow,
        overflow  : s.overflow
    }
};

test.describe('Neo.dashboard.Container — the edge rail paints from engine tokens', () => {
    test.setTimeout(120000);

    test('preservation: the workstation rail is unchanged by the promotion', async ({page}) => {
        await page.goto('/apps/workstation/index.html');
        await expect(page.locator('.neo-dashboard-dock-splitter').first(), 'the workstation must boot')
            .toBeVisible({timeout: 60000});

        const rail = await page.evaluate(readRail);

        expect(rail, 'the workstation must render an edge rail, or this arm proves nothing').toBeTruthy();
        expect(rail).toEqual(WORKSTATION_BASELINE)
    });

    test('capability: a consumer with no rail paint skins the strip by token alone', async ({page}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell'), 'the cockpit must boot').toBeVisible({timeout: 60000});

        const before = await page.evaluate(readRail);

        expect(before, 'the cockpit must render an edge rail').toBeTruthy();
        // Non-vacuity: the arm below is only meaningful because the strip starts bare. If the
        // cockpit ever adopts rail paint, this fails loudly instead of silently proving nothing.
        expect(before.background, 'the cockpit rail must start unpainted').toBe('rgba(0, 0, 0, 0)');
        expect(before.shadow).toBe('none');

        const after = await page.evaluate(() => {
            const rail = document.querySelector('.neo-dashboard-dock-edge-rail');

            rail.style.setProperty('--dock-edge-rail-background', 'rgb(10, 20, 30)');
            rail.style.setProperty('--dock-edge-rail-border',     '2px solid rgb(40, 50, 60)');
            rail.style.setProperty('--dock-edge-rail-radius',      '5px');
            rail.style.setProperty('--dock-edge-rail-shadow',      'rgb(70, 80, 90) 0px 0px 11px 0px');
            rail.style.setProperty('--dock-edge-rail-overflow',    'hidden');

            const s = getComputedStyle(rail);

            return {
                background: s.backgroundColor,
                border    : `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
                radius    : s.borderTopLeftRadius,
                shadow    : s.boxShadow,
                overflow  : s.overflow
            }
        });

        // Each property is asserted separately: a single object compare would let one unread token
        // hide behind four that resolved, and "which one did not travel" is the useful failure.
        expect(after.background, 'background must resolve from the token').toBe('rgb(10, 20, 30)');
        expect(after.border,     'border must resolve from the token').toBe('2px solid rgb(40, 50, 60)');
        expect(after.radius,     'radius must resolve from the token').toBe('5px');
        expect(after.shadow,     'shadow must resolve from the token').toBe('rgb(70, 80, 90) 0px 0px 11px 0px');
        expect(after.overflow,   'overflow must resolve from the token').toBe('hidden')
    })
});
