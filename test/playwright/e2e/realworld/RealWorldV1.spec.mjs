import {expect, test} from '../../fixtures.mjs';

const APP  = 'apps/realworld/index.html',
      API  = 'https://api.realworld.show/api/',
      CORS = {'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-allow-origin': '*'},
      tags = ['architecture', 'beginners', 'javascript', 'nodejs', 'webdev'],
      // Two previews with tags of their own, so a doubled or dropped sidebar is not confused with them
      articles = ['First', 'Second'].map((title, index) => ({
          author        : {bio: null, following: false, image: null, username: `author${index}`},
          body          : `${title} body`,
          createdAt     : '2026-10-20T16:00:00.000Z',
          description   : `${title} description`,
          favorited     : false,
          favoritesCount: index,
          slug          : `${title.toLowerCase()}-article`,
          tagList       : ['javascript', 'webdev'],
          title         : `${title} article`,
          updatedAt     : '2026-10-20T16:00:00.000Z'
      })),
      comments = [{author: articles[1].author, body: 'A comment', createdAt: '2026-10-20T17:00:00.000Z', id: 1, updatedAt: '2026-10-20T17:00:00.000Z'}],
      // The Markdown addon loads showdown from a CDN; a converter that wraps the text in a paragraph keeps the spec offline
      showdown = 'window.showdown = {Converter: class {makeHtml(markdown) {return `<p>${markdown}</p>`}}}';

/**
 * @summary Opens a RealWorld v1 route with the RealWorld API and showdown served from fixtures and every other
 * third-party request refused, so the spec needs no network. The article list and the tags wait for their gates.
 * @param {import('@playwright/test').Page} page
 * @param {String} [hash='']
 * @param {Object} [gates] Async functions keyed by `articles` and `tags`
 * @returns {Promise<Object>} Promises keyed by `articles` and `tags`, each settling once that response is delivered
 */
async function open(page, hash='', gates={}) {
    const delivered = {},
          settle    = {};

    ['articles', 'tags'].forEach(kind => {
        delivered[kind] = new Promise(resolve => settle[kind] = resolve)
    });

    await page.context().route(url => url.hostname !== 'localhost', async route => {
        const request = route.request(),
              path    = request.url().startsWith(API) ? new URL(request.url()).pathname.replace('/api/', '') : null,
              article = articles.find(item => path?.startsWith(`articles/${item.slug}`));

        if (!path) {
            return request.url().includes('/showdown') ? route.fulfill({body: showdown, contentType: 'text/javascript'}) : route.abort()
        }

        if (request.method() === 'OPTIONS') {
            return route.fulfill({headers: CORS, status: 204})
        }

        if (article) {
            return route.fulfill({headers: CORS, json: path.endsWith('/comments') ? {comments} : {article}})
        }

        if (path === 'tags' || path === 'articles') {
            await gates[path]?.();
            await route.fulfill({headers: CORS, json: path === 'tags' ? {tags} : {articles, articlesCount: articles.length}});
            return settle[path]()
        }

        return route.fulfill({headers: CORS, json: {}, status: 404})
    });

    await page.goto(APP + hash);

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

test.describe('RealWorld v1 (#19917)', () => {
    test('the home view renders its Popular Tags sidebar once, with every tag', async ({page}) => {
        await open(page);

        await expect(page.locator('.article-preview')).toHaveCount(articles.length);
        await expect(page.locator('.sidebar .tag-pill')).toHaveCount(tags.length);

        expect(await readHome(page)).toEqual({duplicateIds: [], pills: tags.length, previews: articles.length, sidebars: 1})
    });

    test('a tag list whose response lands right behind the articles still renders every tag (#19922)', async ({page}) => {
        let releaseArticles, releaseTags;

        const articlesGate = new Promise(resolve => releaseArticles = resolve),
              tagsGate     = new Promise(resolve => releaseTags     = resolve),
              delivered    = await open(page, '', {articles: () => articlesGate, tags: () => tagsGate});

        // Both responses wait until the tag list is in the DOM. Then the articles start the home view's update,
        // and the tags arrive while that update is in flight, so the tag list's own update merges into it.
        await page.locator('.sidebar').waitFor({state: 'attached'});
        releaseArticles();
        await delivered.articles;
        releaseTags();

        await expect(page.locator('.sidebar .tag-pill')).toHaveCount(tags.length);
        expect(await readHome(page)).toEqual({duplicateIds: [], pills: tags.length, previews: articles.length, sidebars: 1})
    });

    test('an article page renders its body, its tags and one comment form above its comments', async ({page}) => {
        const [article] = articles;

        await open(page, `#/article/${article.slug}`);

        // The tags are set before the body's html arrives from the main thread
        await expect(page.locator('.article-content')).toContainText(article.body);
        await expect(page.locator('.article-content .tag-list li')).toHaveText(article.tagList);
        await expect(page.locator('.card-text')).toHaveText([comments[0].body]);
        await expect(page.locator('.comment-form')).toHaveCount(1)
    })
});
