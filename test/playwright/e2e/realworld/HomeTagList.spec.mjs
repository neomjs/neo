import {expect, test} from '../../fixtures.mjs';

const APP  = 'apps/realworld/index.html',
      API  = 'https://api.realworld.show/api/',
      CORS = {'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-allow-origin': '*'},
      tags = ['architecture', 'beginners', 'javascript', 'nodejs', 'webdev'],
      // Two previews, each with tags of its own, so a doubled or dropped sidebar is not confused with them
      articles = ['First', 'Second'].map((title, index) => ({
          author        : {bio: null, following: false, image: null, username: `author${index}`},
          createdAt     : '2026-10-20T16:00:00.000Z',
          description   : `${title} description`,
          favorited     : false,
          favoritesCount: index,
          slug          : `${title.toLowerCase()}-article`,
          tagList       : ['javascript'],
          title         : `${title} article`,
          updatedAt     : '2026-10-20T16:00:00.000Z'
      }));

/**
 * @summary Opens RealWorld v1's home view with the RealWorld API served from fixtures and every other
 * third-party request refused, so the spec needs no network. Each API response waits for its gate.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [gates] Async functions keyed by `articles` and `tags`
 * @returns {Promise<Object>} Promises keyed by `articles` and `tags`, each settling once that response is delivered
 */
async function openHome(page, gates={}) {
    const delivered = {},
          settle    = {};

    ['articles', 'tags'].forEach(kind => {
        delivered[kind] = new Promise(resolve => settle[kind] = resolve)
    });

    await page.context().route(url => url.hostname !== 'localhost', async route => {
        const request = route.request(),
              url     = request.url(),
              kind    = url.startsWith(`${API}tags`) ? 'tags' : url.startsWith(`${API}articles`) ? 'articles' : null;

        if (!url.startsWith(API)) {
            return route.abort()
        }

        if (request.method() === 'OPTIONS') {
            return route.fulfill({headers: CORS, status: 204})
        }

        if (!kind) {
            return route.fulfill({headers: CORS, json: {}, status: 404})
        }

        await gates[kind]?.();
        await route.fulfill({headers: CORS, json: kind === 'tags' ? {tags} : {articles, articlesCount: articles.length}});
        settle[kind]()
    });

    await page.goto(APP);

    return delivered
}

/**
 * @summary Reads the home view's sidebars, their tag pills, the article previews and any element id the page holds twice.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function readHome(page) {
    return page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);

        return {
            duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
            pills       : document.querySelectorAll('.sidebar .tag-pill').length,
            previews    : document.querySelectorAll('.article-preview').length,
            sidebars    : document.querySelectorAll('.sidebar').length
        }
    })
}

test.describe('RealWorld v1 home view (#19917)', () => {
    test('renders its Popular Tags sidebar once, with every tag', async ({page}) => {
        await openHome(page);

        await expect(page.locator('.article-preview')).toHaveCount(articles.length);
        await expect(page.locator('.sidebar .tag-pill')).toHaveCount(tags.length);

        expect(await readHome(page)).toEqual({duplicateIds: [], pills: tags.length, previews: articles.length, sidebars: 1})
    });

    test('a tag list whose response lands right behind the articles still renders every tag (#19922)', async ({page}) => {
        let releaseArticles, releaseTags;

        const articlesGate = new Promise(resolve => releaseArticles = resolve),
              tagsGate     = new Promise(resolve => releaseTags     = resolve),
              delivered    = await openHome(page, {articles: () => articlesGate, tags: () => tagsGate});

        // Both responses wait until the tag list is in the DOM. Then the articles start the home view's update,
        // and the tags arrive while that update is in flight, so the tag list's own update merges into it.
        await page.locator('.sidebar').waitFor({state: 'attached'});
        releaseArticles();
        await delivered.articles;
        releaseTags();

        await expect(page.locator('.sidebar .tag-pill')).toHaveCount(tags.length);
        expect(await readHome(page)).toEqual({duplicateIds: [], pills: tags.length, previews: articles.length, sidebars: 1})
    })
});
