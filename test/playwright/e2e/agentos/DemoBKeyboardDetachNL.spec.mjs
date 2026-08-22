import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The keyboard detach path's L3 journey on the REAL Demo B composition — a11y parity
 * for the multi-window choreography, driven the way a keyboard user drives it.
 *
 * Two witnesses:
 * 1. **The detach command:** a focused dock tab + Ctrl+Shift+D → a real OS popup vessel opens
 *    through the SAME admission machine the pointer tear-out uses, the model commits exactly
 *    once, and the aria-live region announces the outcome — with the announcement's focus claim
 *    cross-checked against the popup document's ACTUAL focus state (announced truth must equal
 *    platform truth in BOTH directions: a granted hop says "Focus moved with it", a declined one
 *    says "Focus stayed here" — headless platforms legitimately decline).
 * 2. **The cycle grammar:** Ctrl+Shift+M starts the move cycle (candidates announced with
 *    position + the host's chorded key grammar), Ctrl+Shift+ArrowRight advances it (the
 *    highlight tracks THROUGH the shared drag-affordance consumer — the same `dock-preview`
 *    overlay the pointer hover renders), and Escape cancels with ZERO model mutation — the
 *    outcome machine's CANCELLED terminal, keyboard leg.
 * 3. **The popup-origin RETURN:** with the cross-window stage live, the same cycle command
 *    moves an item INTO the popup workspace and — driven from the POPUP window's own keyboard,
 *    announced through the POPUP's own live region — back home to main. Keyboard parity is
 *    end-to-end or it is not parity.
 */
test.describe('AgentOS Demo B — keyboard detach + cycle grammar (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 900}
    });

    test('Ctrl+Shift+D detaches the focused tab to a real popup; the announcement matches platform focus truth', async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/examples/dashboard/crossWindow/index.html');

        const headers = page.locator('.neo-tab-header-toolbar .neo-tab-header-button');
        await expect(headers.first()).toBeVisible({timeout: 60000});

        // keyboard-alone discipline for the COMMAND: focus lands programmatically (no pointer
        // gesture participates), the chord does the work
        const header = headers.first();
        await header.focus();
        await expect(header).toBeFocused();

        const popupPromise = page.context().waitForEvent('page', {timeout: 30000});
        await page.keyboard.press('Control+Shift+D');

        // the admission machine opened a REAL vessel window
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        expect(popup.url()).toContain('popout');

        // the aria-live region announced the COMMITTED outcome — and IS a live region in the
        // accessibility tree, not just a styled div (role + politeness asserted, never assumed)
        const live = page.locator('.agentos-dockdemo-kbd-live');
        await expect(live).toHaveAttribute('role', 'status');
        await expect(live).toHaveAttribute('aria-live', 'polite');
        await expect(live).toContainText('detached to its own window', {timeout: 15000});

        // announced truth === platform truth, in whichever direction the platform ruled:
        // a granted hop must say so, a declined one must say so — never a mismatch
        const announcement    = await live.textContent(),
              claimedTransfer = announcement.includes('Focus moved with it'),
              actualTransfer  = await popup.evaluate(() => document.hasFocus()).catch(() => false);

        expect(claimedTransfer, `announcement "${announcement}" must match popup focus=${actualTransfer}`).toBe(actualTransfer);

        expect(pageErrors).toEqual([])
    });

    test('Ctrl+Shift+M cycles targets with announced positions + tracked highlight; Escape cancels with zero mutation', async ({page}) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/examples/dashboard/crossWindow/index.html');

        const headers = page.locator('.neo-tab-header-toolbar .neo-tab-header-button');
        await expect(headers.first()).toBeVisible({timeout: 60000});

        const headerCountBefore = await headers.count(),
              header            = headers.first(),
              headerText        = await header.textContent();

        await header.focus();
        await page.keyboard.press('Control+Shift+M');

        // the cycle opened: position + candidate label + the HOST's chorded grammar announced
        const live = page.locator('.agentos-dockdemo-kbd-live');
        await expect(live).toContainText('Target 1 of', {timeout: 15000});
        await expect(live).toContainText('Ctrl+Shift+Arrow keys cycle');

        // the current candidate is highlighted through the SHARED drag-affordance consumer:
        // the same dock-preview overlay the pointer hover renders, as the whole-zone tab-into
        // band (shape+position — inherently paired with a non-color carrier)
        const affordance = page.locator('.neo-dock-preview-affordance');
        await expect(affordance).toHaveCount(1);
        await expect(affordance).toHaveClass(/neo-dock-preview-tab-into/);
        await expect(affordance).toHaveClass(/neo-dock-preview-accepted/);

        // the chorded advance moves position AND highlight (wrap-aware: with one candidate the
        // position wraps to itself — the announcement re-renders either way)
        const candidateCount = Number((await live.textContent()).match(/Target 1 of (\d+)/)?.[1] ?? 0);
        expect(candidateCount).toBeGreaterThan(0);

        await page.keyboard.press('Control+Shift+ArrowRight');
        await expect(live).toContainText(candidateCount > 1 ? 'Target 2 of' : 'Target 1 of');
        await expect(affordance).toHaveCount(1);

        // Escape = the CANCELLED terminal: announced, highlight cleared, ZERO model mutation
        await page.keyboard.press('Escape');
        await expect(live).toContainText('Move cancelled');
        await expect(affordance).toHaveCount(0);

        // the tab strip is byte-identical: same headers, the focused tab still home
        await expect(headers).toHaveCount(headerCountBefore);
        await expect(headers.first()).toHaveText(headerText);

        expect(pageErrors).toEqual([])
    });

    test('the popup-origin RETURN: one cycle grammar moves an item out and — from the popup keyboard — home again', async ({page, neuralLink}) => {
        const pageErrors  = [],
              popupErrors = [];

        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 60000});

        // stage the second active workspace window — a host affordance, not a keyboard step:
        // the journey under witness is the transfer + return, not window creation
        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
              workspaces = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one DemoBWorkspace').toBeTruthy();

        const popupPromise = page.waitForEvent('popup', {timeout: 30000}),
              stage        = app.callMethod(wsId, 'openCrossWindowStage', []),
              popup        = await popupPromise;

        popup.on('pageerror', error => popupErrors.push(error.message));
        await popup.waitForLoadState('domcontentloaded');
        await stage;

        // the popup window composes its OWN announcement region — a real live region in the
        // accessibility tree, same terminal-derived truth as the main window's (the a11y AC)
        const mainLive  = page.locator('.agentos-dockdemo-kbd-live'),
              popupLive = popup.locator('.agentos-dockdemo-kbd-live');

        await expect(popupLive).toHaveAttribute('role', 'status');
        await expect(popupLive).toHaveAttribute('aria-live', 'polite');

        // ---- LEG 1: the cycle moves Workbench INTO the popup workspace (main-origin) ----
        // positional on purpose: the projected header buttons carry no text content (the pane
        // does), and the initial document projects the center zone (workbench-tabs, one tab)
        // before the right zone — the FIRST header is Workbench's, deterministically
        const mainHeader = page.locator('.neo-tab-header-toolbar .neo-tab-header-button').first();

        await mainHeader.focus();
        await page.keyboard.press('Control+Shift+M');

        // deterministic candidate order (workspace-set registry order): Target 1 = the main
        // window's other tabs zone, Target 2 = the popup workspace — ONE advance, then AWAIT
        // the announcement settling (reading raw text between presses races the async region
        // update and over-advances the cycle)
        await expect(mainLive).toContainText('Target 1 of 2: Main window');
        await page.keyboard.press('Control+Shift+ArrowRight');
        await expect(mainLive).toContainText('Target 2 of 2: Popup window');

        // the shared affordance renders in the TARGET's window — the popup's own overlay,
        // through the same dock-preview consumer the pointer path drives
        await expect(popup.locator('.neo-dock-preview-affordance')).toHaveCount(1);
        await expect(popup.locator('.neo-dock-preview-affordance')).toHaveClass(/neo-dock-preview-tab-into/);

        await page.keyboard.press('Control+Shift+Enter');
        await expect(mainLive).toContainText('Workbench moved to Popup window', {timeout: 15000});

        // BOTH regions carry the same committed terminal
        await expect(popupLive).toContainText('Workbench moved to Popup window');

        // committed worker truth + the LIVE pane rendered in the second document
        await expect(popup.locator('.agentos-dockdemo-counter-pane')).toBeVisible({timeout: 10000});

        const moved = await app.getComponent(wsId, ['dockModel', 'popupDocument']);

        expect(moved.popupDocument.nodes['popup-tabs'].items).toEqual(['workbench']);
        expect(moved.dockModel.items.workbench).toBeUndefined();

        // ---- LEG 2: the RETURN — the SAME command, driven from the POPUP's keyboard ----
        // the popup workspace holds exactly one item post-transfer: one header, unambiguous
        const popupHeader = popup.locator('.neo-tab-header-toolbar .neo-tab-header-button').first();

        await popupHeader.focus();
        await popup.keyboard.press('Control+Shift+M');

        // the POPUP's region announces the cycle — popup-side liveness, L3-witnessed. After
        // the transfer the main document normalized to ONE tabs zone, so the return cycle has
        // exactly one candidate: home.
        await expect(popupLive).toContainText('Target 1 of 1: Main window');

        // the affordance now renders in MAIN — the target window — same consumer
        await expect(page.locator('.neo-dock-preview-affordance')).toHaveCount(1);

        await popup.keyboard.press('Control+Shift+Enter');
        await expect(popupLive).toContainText('Workbench moved to Main window', {timeout: 15000});
        await expect(mainLive).toContainText('Workbench moved to Main window');

        // home again: committed worker truth, the live pane back in the main document
        await expect(page.locator('.agentos-dockdemo-counter-pane')).toBeVisible({timeout: 10000});

        const home = await app.getComponent(wsId, ['dockModel', 'popupDocument']);

        expect(Object.values(home.dockModel.nodes).some(node => node.items?.includes('workbench'))).toBe(true);
        expect(home.popupDocument.items?.workbench).toBeUndefined();

        // announced focus-claim ≡ platform truth, in whichever direction the platform ruled —
        // the return's focus subject is the MAIN document (the opener), asked directly
        const announcement = await popupLive.textContent(),
              claimed      = announcement.includes('Focus moved with it'),
              actual       = await page.evaluate(() => document.hasFocus()).catch(() => false);

        expect(claimed, `announcement "${announcement}" must match main-window focus=${actual}`).toBe(actual);

        expect(popupErrors).toEqual([]);
        expect(pageErrors).toEqual([])
    });
});
