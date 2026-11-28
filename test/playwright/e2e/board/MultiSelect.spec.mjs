import {contrastRatio} from '../../../../buildScripts/util/check-theme-palette.mjs';
import {test, expect}  from '../../fixtures.mjs';

/**
 * @summary The bug triage example: forty reports in the Inbox, selected by click, Shift and the command key, and
 * moved into another column by one drag.
 *
 * Gestures are real pointer and key input; the selection and the columns' records are read from the board in the
 * App Worker. Reports are keyed by arrival, `1041` (the oldest) to `1080`.
 *
 * Run: npm run test-e2e -- test/playwright/e2e/board/MultiSelect.spec.mjs
 */
const
    THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    STAGES = ['inbox', 'sprint', 'later', 'wontfix'],
    // Reads the board from the App Worker: its id, the selected keys and each column's keys in order
    readBoard = page => {
        const worker = page.workers().find(candidate => candidate.url().includes('worker/App'));

        return worker.evaluate(stages => {
            const board = [...globalThis.Neo.manager.Instance.items.values()]
                .find(instance => instance.className === 'Neo.board.Container');

            return {
                id       : board.id,
                selection: [...board.selectionModel.items],
                columns  : Object.fromEntries(stages.map(stage => [stage, board.getColumnRecords(stage).map(record => record.id)]))
            }
        }, STAGES)
    },
    // Opens the example and collects console errors
    open = async (page, theme) => {
        const errors = [];

        // A failed load names its resource only in the message's location. The test server has no favicon: that
        // request is the browser's own, not the example's.
        page.on('console', msg => {
            const {url} = msg.location();
            msg.type() === 'error' && !url?.endsWith('/favicon.ico') && errors.push(`${msg.text()} ${url}`.trim())
        });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto(`/examples/board/multiSelect/index.html${theme ? `?theme=${theme}` : ''}`);
        await page.locator('.neo-board-card').first().waitFor({timeout: 30000});
        await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

        const {id} = await readBoard(page);

        return {
            errors,
            badge   : stage => page.locator(`[id="${id}__col__${stage}"] .neo-board-column-count`),
            card    : key   => page.locator(`[id="${id}__card__${key}"]`),
            column  : stage => page.locator(`[id="${id}__col__${stage}"]`),
            keys    : async stage => (await readBoard(page)).columns[stage],
            line    : page.locator('.triage-selection-count'),
            clear   : page.locator('.triage-clear'),
            selected: async () => (await readBoard(page)).selection
        }
    };

test.describe('Board, multi-select example: select many reports, move them in one drag', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1440}});

    test('click, Shift and the command key select; select-all takes the column; Escape and Clear empty it', async ({page}) => {
        const {card, clear, errors, line, selected} = await open(page);

        await expect(line).toHaveText('0 selected');
        await expect(clear).toHaveClass(/neo-disabled/);

        await card(1042).click();
        await expect(line).toHaveText('1 selected');
        await expect(clear).not.toHaveClass(/neo-disabled/);

        await card(1046).click({modifiers: ['Shift']});
        await expect(line, 'Shift-click selects the range').toHaveText('5 selected');
        expect((await selected()).sort()).toEqual([1042, 1043, 1044, 1045, 1046]);

        await card(1049).click({modifiers: ['ControlOrMeta']});
        await expect(line, 'the command key adds one').toHaveText('6 selected');
        await card(1044).click({modifiers: ['ControlOrMeta']});
        await expect(line, 'and removes one').toHaveText('5 selected');
        expect((await selected()).sort()).toEqual([1042, 1043, 1045, 1046, 1049]);

        await page.keyboard.press('Escape');
        await expect(line, 'Escape clears').toHaveText('0 selected');
        expect(await selected()).toEqual([]);

        await card(1041).click();
        await page.keyboard.press('ControlOrMeta+a');
        await expect(line, 'select-all takes the focused column').toHaveText('40 selected');

        await clear.click();
        await expect(line, 'Clear empties the selection').toHaveText('0 selected');
        await expect(clear).toHaveClass(/neo-disabled/);
        expect(errors).toEqual([])
    });

    test('a drag on a middle selected report carries the selection into This sprint in board order, its stack counting five', async ({page}) => {
        const {badge, card, column, errors, keys, line} = await open(page);

        await card(1042).click();
        await card(1046).click({modifiers: ['Shift']});
        await expect(line).toHaveText('5 selected');

        // The drag holds the third of the five
        const from = await card(1044).boundingBox(),
              to   = await column('sprint').boundingBox();

        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, {steps: 4});
        await page.mouse.move(to.x + to.width / 2, to.y + 140, {steps: 16});

        // The proxy is the held report in front of a stack of the other four, and says how many it carries
        await expect(page.locator('.neo-board-stack-proxy .neo-board-stack-lead')).toHaveCount(1);
        await expect(page.locator('.neo-board-stack-proxy .neo-board-stack-card')).toHaveCount(4);
        await expect(page.locator('.neo-board-stack-proxy .neo-board-stack-count')).toHaveText('5');
        await page.mouse.up();

        await expect.poll(() => keys('sprint'), {message: 'the selection lands in This sprint, in board order'})
            .toEqual([1042, 1043, 1044, 1045, 1046]);
        expect(await keys('inbox')).toHaveLength(35);
        await expect(badge('inbox'),  'the Inbox counts what is left').toHaveText('35');
        await expect(badge('sprint'), 'This sprint counts what arrived').toHaveText('5');
        await expect(line, 'the moved reports stay selected').toHaveText('5 selected');
        expect(errors).toEqual([])
    });

    test('colored cards retain their left accent across rest, hover, selection and selected-hover; uncolored cards follow all four borders across all five themes', async ({page}) => {
        const readPaint = async locator => {
            const {muted, surface, title, ...paint} = await locator.evaluate(node => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                const context = canvas.getContext('2d', {willReadFrequently: true}),
                      style   = getComputedStyle(node),
                      rgb     = color => {
                          context.clearRect(0, 0, 1, 1);
                          context.fillStyle = color;
                          context.fillRect(0, 0, 1, 1);

                          return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3), channel => channel / 255)
                      };

                return {
                    backgroundColor: style.backgroundColor,
                    borderLeftColor: style.borderLeftColor,
                    borderTopColor : style.borderTopColor,
                    boxShadow      : style.boxShadow,
                    muted          : rgb(getComputedStyle(node.querySelector('.neo-board-card-menu-button')).color),
                    surface        : rgb(style.backgroundColor),
                    title          : rgb(getComputedStyle(node.querySelector('.neo-board-card-title')).color)
                }
            });

            return {...paint, mutedContrast: contrastRatio(muted, surface), titleContrast: contrastRatio(title, surface)}
        };

        for (const theme of THEMES) {
            const {card, errors, line} = await open(page, theme),
                  s1Accent             = 'rgb(229, 72, 77)';

            // Move pointer away from cards before reading rest styles
            await page.mouse.move(10, 10);

            const coloredRest   = await readPaint(card(1043)),
                  uncoloredRest = await readPaint(card(1046));

            expect(coloredRest.borderLeftColor, `${theme}: S1 card left stripe at rest`).toBe(s1Accent);
            expect(uncoloredRest.borderLeftColor, `${theme}: S4 uncolored card left matches top at rest`).toBe(uncoloredRest.borderTopColor);
            expect(coloredRest.mutedContrast, `${theme}: resting card muted-text contrast >= 4.5:1`).toBeGreaterThanOrEqual(4.5);

            // Hover unselected colored (1043) and uncolored (1046) cards
            await card(1043).hover();
            const coloredHover = await readPaint(card(1043));
            expect(coloredHover.borderLeftColor, `${theme}: S1 card retains left stripe on :hover`).toBe(s1Accent);
            expect(coloredHover.borderTopColor, `${theme}: S1 card top border changes on :hover`).not.toBe(coloredRest.borderTopColor);

            await card(1046).hover();
            const uncoloredHover = await readPaint(card(1046));
            expect(uncoloredHover.borderLeftColor, `${theme}: S4 uncolored card left matches hover border`).toBe(uncoloredHover.borderTopColor);
            expect(uncoloredHover.borderTopColor, `${theme}: S4 uncolored card top border changes on :hover`).not.toBe(uncoloredRest.borderTopColor);

            // Select 1042..1046 and move pointer away so 1042..1046 are unhovered .neo-selected
            await card(1042).click();
            await card(1046).click({modifiers: ['Shift']});
            await expect(line).toHaveText('5 selected');
            await page.mouse.move(10, 10);

            const coloredSelected   = await readPaint(card(1043)),
                  neighbourSelected = await readPaint(card(1042)),
                  uncoloredSelected = await readPaint(card(1046));

            expect(coloredSelected.borderLeftColor, `${theme}: S1 card retains left stripe when selected`).toBe(s1Accent);
            expect(uncoloredSelected.borderLeftColor, `${theme}: S4 uncolored card left matches selected border`).toBe(uncoloredSelected.borderTopColor);
            expect(coloredSelected.backgroundColor, `${theme}: selected neighbours share selected background`).toBe(neighbourSelected.backgroundColor);
            expect(coloredSelected.mutedContrast, `${theme}: .neo-selected card muted-text contrast >= 4.5:1`).toBeGreaterThanOrEqual(4.5);

            // Hover selected card 1043: retains S1 left stripe, adds selected-hover ring, and keeps WCAG contrast intact
            await card(1043).hover();
            const coloredSelectedHover = await readPaint(card(1043)),
                  neighbourUnhovered   = await readPaint(card(1042));

            expect(coloredSelectedHover.borderLeftColor, `${theme}: S1 card retains left stripe on .neo-selected:hover`).toBe(s1Accent);
            expect(coloredSelectedHover.boxShadow, `${theme}: .neo-selected:hover boxShadow differs from unhovered .neo-selected neighbour`)
                .not.toBe(neighbourUnhovered.boxShadow);
            expect(coloredSelectedHover.titleContrast, `${theme}: .neo-selected:hover title contrast >= 4.5:1`)
                .toBeGreaterThanOrEqual(4.5);
            expect(coloredSelectedHover.mutedContrast, `${theme}: .neo-selected:hover muted-text contrast never drops below .neo-selected`)
                .toBeGreaterThanOrEqual(neighbourUnhovered.mutedContrast);
            expect(coloredSelectedHover.mutedContrast, `${theme}: .neo-selected:hover muted-text contrast >= 4.5:1`)
                .toBeGreaterThanOrEqual(4.5);

            expect(errors, `${theme}: zero console/page errors`).toEqual([])
        }
    });

    test('a drag that starts in the Inbox scrolled to its end keeps the Inbox there, through the drag and after Escape', async ({page}) => {
        const {column, errors} = await open(page),
              body             = column('inbox').locator('.neo-board-column-body'),
              scroll           = () => body.evaluate(el => Math.round(el.scrollTop));

        // Forty reports overflow the Inbox's body, so its end sits well below its top
        await body.evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight });
        await expect.poll(scroll).toBeGreaterThan(0);

        const end                   = await scroll(),
              {height, width, x, y} = await body.boundingBox();

        await page.mouse.move(x + width / 2, y + height / 2);
        await page.mouse.down();
        await page.mouse.move(x + width / 2 + 20, y + height / 2 + 10, {steps: 4});
        await expect(page.locator('.neo-dragproxy')).toHaveCount(1);
        expect(await scroll(), 'the drag keeps the Inbox where it was scrolled to').toBe(end);

        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        expect(await scroll(), 'and so does the cancel').toBe(end);
        expect(errors).toEqual([])
    });

    for (const theme of THEMES) {
        test(`at 1440 × 900 the four columns are in view, the Inbox holds forty reports (${theme})`, async ({page}, testInfo) => {
            const {badge, column, errors} = await open(page, theme);

            for (const stage of STAGES) {
                const {height, width, x} = await column(stage).boundingBox();

                expect(x, `${stage}: starts in view`).toBeGreaterThanOrEqual(0);
                expect(x + width, `${stage}: ends in view`).toBeLessThanOrEqual(1440);
                expect(height, `${stage}: a column, not a strip`).toBeGreaterThan(300)
            }

            await expect(badge('inbox')).toHaveText('40');
            expect(errors).toEqual([]);

            await testInfo.attach(`board-multi-select-1440-${theme}`, {body: await page.screenshot(), contentType: 'image/png'})
        })
    }

    test('at 390 × 844 the Inbox fits the screen whole, under the selection line', async ({page}, testInfo) => {
        await page.setViewportSize({height: 844, width: 390});

        const {column, errors, line} = await open(page),
              inbox                  = await column('inbox').boundingBox(),
              bar                    = await line.boundingBox();

        expect(inbox.x, 'the Inbox starts in view').toBeGreaterThanOrEqual(0);
        expect(inbox.x + inbox.width, 'and ends in view').toBeLessThanOrEqual(390);
        expect(inbox.y, 'below the selection line').toBeGreaterThan(bar.y + bar.height);
        expect(errors).toEqual([]);

        await testInfo.attach('board-multi-select-390', {body: await page.screenshot(), contentType: 'image/png'})
    })
});
