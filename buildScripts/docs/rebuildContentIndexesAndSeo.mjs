#!/usr/bin/env node

import fs                          from 'fs-extra';
import path                        from 'path';
import {fileURLToPath}             from 'url';
import createReleaseIndex          from './index/release.mjs';
import createDiscussionIndex       from './index/discussions.mjs';
import createPullRequestIndex      from './index/pulls.mjs';
import createTicketIndex           from './index/tickets.mjs';
import reconcileActiveChunks       from '../../ai/services/github-workflow/shared/reconcileActiveChunks.mjs';
import {getLlmsTxt, getSitemapXml} from './seo/generate.mjs';

const DEFAULT_BASE_URL = 'https://neomjs.com';

/**
 * @module buildScripts.docs.rebuildContentIndexesAndSeo
 * @summary Rebuilds the Portal's content-derived indexes and SEO artifacts from
 * `resources/content/` as one fail-fast bundle.
 *
 * The GitHub Workflow sync uses the local-only default so a successful content
 * sync cannot leave
 * `apps/portal/resources/data`, `apps/portal/sitemap.xml`, or
 * `apps/portal/llms.txt` stale relative to the emitted markdown corpus. Release
 * and CI callers can opt into the remote GitHub label index via
 * `includeLabelIndex`; the label builder is intentionally loaded lazily so
 * `sync_all` does not import the GitHub Workflow SDK label path.
 */

/**
 * Rebuilds all content-derived Portal indexes and SEO outputs.
 * @param {Object} [options]
 * @param {String} [options.root=process.cwd()] Repository root.
 * @param {String} [options.baseUrl='https://neomjs.com'] Canonical site URL for SEO outputs.
 * @param {String} [options.sitemapPath] Target sitemap path.
 * @param {String} [options.llmsPath] Target llms.txt path.
 * @param {Boolean} [options.includeLabelIndex=false] Also rebuild the remote GitHub label index.
 * @param {Function} [options.createLabelIndexFn] Test seam for the label index builder.
 * @param {Function} [options.createReleaseIndexFn] Test seam for the release index builder.
 * @param {Function} [options.createDiscussionIndexFn] Test seam for the discussion index builder.
 * @param {Function} [options.createPullRequestIndexFn] Test seam for the pull-request index builder.
 * @param {Function} [options.createTicketIndexFn] Test seam for the ticket index builder.
 * @param {Function} [options.getSitemapXmlFn] Test seam for sitemap generation.
 * @param {Function} [options.getLlmsTxtFn] Test seam for llms.txt generation.
 * @param {Function} [options.writeFileSync] Test seam for filesystem writes.
 * @param {Function} [options.log] Test seam for logging.
 * @returns {Promise<Object>} Generated artifact paths.
 */
async function rebuildContentIndexesAndSeo({
    root                     = process.cwd(),
    baseUrl                  = DEFAULT_BASE_URL,
    sitemapPath              = path.join(root, 'apps/portal/sitemap.xml'),
    llmsPath                 = path.join(root, 'apps/portal/llms.txt'),
    includeLabelIndex        = false,
    createLabelIndexFn       = null,
    createReleaseIndexFn     = createReleaseIndex,
    createDiscussionIndexFn  = createDiscussionIndex,
    createPullRequestIndexFn = createPullRequestIndex,
    createTicketIndexFn      = createTicketIndex,
    reconcileActiveChunksFn  = reconcileActiveChunks,
    getSitemapXmlFn          = getSitemapXml,
    getLlmsTxtFn             = getLlmsTxt,
    writeFileSync            = fs.writeFileSync,
    log                      = console.log
} = {}) {
    if (includeLabelIndex) {
        const labelIndexFn = createLabelIndexFn || (await import('./index/labels.mjs')).default;
        await labelIndexFn();
    }

    // Ordinal-100 enforcement: re-chunk the active content tiers BEFORE indexing so the generators
    // mirror exact-100 folders. Position-dependent chunking drifts when the delta-sync only re-places
    // the items it touched; this idempotent pass re-ranks the full active corpus on disk. Archive is sealed.
    const reChunkConfig = {contentRoot: path.join(root, 'resources/content')};
    await reconcileActiveChunksFn(reChunkConfig, {type: 'pulls',       filePrefix: 'pr-'});
    await reconcileActiveChunksFn(reChunkConfig, {type: 'issues',      filePrefix: 'issue-'});
    await reconcileActiveChunksFn(reChunkConfig, {type: 'discussions', filePrefix: 'discussion-'});

    await createReleaseIndexFn();
    await createPullRequestIndexFn();
    await createDiscussionIndexFn();
    await createTicketIndexFn();

    const sitemapXml = await getSitemapXmlFn({baseUrl, existingSitemapPath: sitemapPath});
    writeFileSync(sitemapPath, sitemapXml);
    log(`Generated ${path.relative(root, sitemapPath)}`);

    const llmsTxt = await getLlmsTxtFn({baseUrl});
    writeFileSync(llmsPath, llmsTxt);
    log(`Generated ${path.relative(root, llmsPath)}`);

    return {
        baseUrl,
        llmsPath,
        sitemapPath
    }
}

async function runCli() {
    await rebuildContentIndexesAndSeo({
        includeLabelIndex: process.argv.includes('--include-labels')
    })
}

const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    runCli().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

export {rebuildContentIndexesAndSeo};
export default rebuildContentIndexesAndSeo;
