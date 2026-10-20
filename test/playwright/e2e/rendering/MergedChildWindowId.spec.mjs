import {expect, test} from '../../fixtures.mjs';

let moduleSequence = 0;

/**
 * @summary Runs a module in the page's App Worker; resolves once its top-level awaits have settled.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @returns {Promise<void>}
 */
async function runInAppWorker(page, source) {
    const path  = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// merged-child-windowid-${++moduleSequence}`)}`,
          reply = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);

    expect(reply?.data ?? reply).toMatchObject({success: true})
}

/**
 * @summary A referenced child component whose `windowId` differs from its owner must still render its
 * DOM update when updated while the owner's flight is yielding.
 */
test.describe('Merged child update with mismatched windowId (#19922)', () => {
    test('the held-response order (both held until sidebar mounts; articles first, tags as that settles) renders every pill across 10 runs', async ({page}) => {
        const tags     = ['architecture', 'beginners', 'javascript', 'nodejs', 'webdev'],
              articles = ['First article', 'Second article'];

        let gateState = null;

        await page.route('**/api/realworld-19922/**', async route => {
            const url  = new URL(route.request().url()),
                  kind = url.pathname.endsWith('/articles') ? 'articles' : 'tags',
                  curr = gateState;

            if (curr) {
                curr.requested[kind]();
                await curr.gates[kind];
                await route.fulfill({
                    contentType: 'application/json',
                    body       : JSON.stringify(kind === 'articles' ? {articles} : {tags})
                });
                curr.delivered[kind]();
                return
            }

            await route.fulfill({contentType: 'application/json', body: '{}'})
        });

        await page.goto('/examples/container/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible();

        await runInAppWorker(page, `
            class HeldOrderHome extends Neo.component.Base {
                static config = {
                    className: 'Test.E2E.MergedChildWindowId.Home',
                    articles_: null,
                    _vdom    : {
                        cn: [
                            {cls: ['article-list'], cn: []},
                            {cls: ['sidebar-slot'], cn: []}
                        ]
                    }
                }

                afterSetArticles(value, oldValue) {
                    if (Array.isArray(value)) {
                        this.vdom.cn[0].cn = value.map((title, idx) => ({
                            tag : 'div',
                            cls : ['article-preview'],
                            id  : this.id + '__article_' + idx,
                            text: title
                        }));
                        this.update()
                    }
                }
            }
            HeldOrderHome = Neo.setupClass(HeldOrderHome);

            class HeldOrderTagList extends Neo.component.Base {
                static config = {
                    className: 'Test.E2E.MergedChildWindowId.TagList',
                    tags_    : null,
                    _vdom    : {
                        cn: [{
                            cls: ['sidebar'],
                            cn : [
                                {tag: 'p', text: 'Popular Tags'},
                                {cls: ['tag-list'], cn: []}
                            ]
                        }]
                    }
                }

                afterSetTags(value, oldValue) {
                    if (Array.isArray(value)) {
                        this.vdom.cn[0].cn[1].cn = value.map(tag => ({
                            tag : 'a',
                            cls : ['tag-pill', 'tag-default'],
                            id  : this.id + '__' + tag,
                            text: tag
                        }));
                        this.update()
                    }
                }
            }
            HeldOrderTagList = Neo.setupClass(HeldOrderTagList);

            HeldOrderHome.runTrial = async function(run) {
                const main = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.container.base').mainView,
                      prev = Neo.getComponent('held-order-home');

                if (prev) {
                    prev.tagList?.destroy();
                    main.remove(prev, true)
                }

                const home = main.add({
                    module: HeldOrderHome,
                    id    : 'held-order-home'
                }, true);

                // Created in onConstructed-style with parentId only (windowId remains null, differing from home.windowId)
                home.tagList = Neo.create({
                    module  : HeldOrderTagList,
                    appName : home.appName,
                    id      : 'held-order-tags-' + run,
                    parentId: home.id
                });

                home.vdom.cn[1].cn = [home.tagList.createVdomReference()];
                main.updateDepth = -1;
                await main.promiseUpdate();

                home.articlesDone = fetch('/api/realworld-19922/articles?run=' + run)
                    .then(r => r.json())
                    .then(data => home.set({articles: data.articles}));

                home.tagsDone = fetch('/api/realworld-19922/tags?run=' + run)
                    .then(r => r.json())
                    .then(data => home.tagList.set({tags: data.tags}));
            };
        `);

        const pillCounts = [];

        for (let run = 1; run <= 10; run++) {
            let releaseArticles, releaseTags;
            const requested = {},
                  delivered = {},
                  reqWait   = {},
                  delivWait = {};

            for (const kind of ['articles', 'tags']) {
                reqWait[kind]   = new Promise(resolve => requested[kind] = resolve);
                delivWait[kind] = new Promise(resolve => delivered[kind] = resolve)
            }

            gateState = {
                gates: {
                    articles: new Promise(resolve => releaseArticles = resolve),
                    tags    : new Promise(resolve => releaseTags     = resolve)
                },
                requested,
                delivered
            };

            await runInAppWorker(page, `await Test.E2E.MergedChildWindowId.Home.runTrial(${run});`);

            // Hold both responses until the sidebar is mounted and both requests have arrived
            await page.locator(`#held-order-tags-${run} .sidebar`).waitFor({state: 'attached'});
            await Promise.all([reqWait.articles, reqWait.tags]);

            // Fulfill articles first, and release tags the moment articles is delivered
            releaseArticles();
            await delivWait.articles;
            releaseTags();
            await delivWait.tags;

            await runInAppWorker(page, `
                const home = Neo.getComponent('held-order-home');
                await Promise.all([home.articlesDone, home.tagsDone]);
            `);

            const count = await page.locator(`#held-order-tags-${run} .sidebar .tag-pill`).count();
            pillCounts.push(count)
        }

        expect(pillCounts).toEqual(Array(10).fill(tags.length))
    })
});
