#!/usr/bin/env node

import fs                          from 'fs-extra';
import path                        from 'path';
import {Command}                   from 'commander';
import isEntryModule               from '../util/isEntryModule.mjs';
import {sanitizeInput}             from '../util/sanitizer.mjs';
import createReleaseIndex          from './index/release.mjs';
import createDiscussionIndex       from './index/discussions.mjs';
import createPullRequestIndex      from './index/pulls.mjs';
import createTicketIndex           from './index/tickets.mjs';
import {
    getLlmsFullTxt,
    getLlmsTxt,
    getSitemapIndexXml,
    getSitemapXml
} from './seo/generate.mjs';
import {
    getEngineReleaseNotesRoot,
    requireContentRoot
} from '../util/contentRoot.mjs';

const DEFAULT_BASE_URL = 'https://neomjs.com';

/**
 * @module buildScripts.docs.rebuildContentIndexesAndSeo
 * @summary Rebuilds the Portal's content-derived indexes and SEO artifacts from a declared
 * corpus root and release-notes root as one fail-fast bundle.
 *
 * The engine holds no conversation corpus, so the corpus root is a required input: a run
 * without one fails before it writes anything. The release notes default to the engine's own
 * `.github/RELEASE_NOTES`, where they are authored. A build that serves them elsewhere passes
 * `--release-notes`.
 *
 * The rebuild cannot leave `apps/portal/resources/data`, `apps/portal/sitemap*.xml`, or
 * `apps/portal/llms*.txt` stale relative to the corpus it read. Release and CI callers can opt
 * into the remote GitHub label index via `includeLabelIndex`; the label builder is
 * intentionally loaded lazily so the scheduled GitHub Workflow sync does not import the SDK
 * label path.
 */

/**
 * Rebuilds all content-derived Portal indexes and SEO outputs.
 * @param {Object} options
 * @param {String} options.corpusRoot The conversation corpus root (`--corpus-root`), holding `issues/`, `pulls/`,
 * `discussions/` and `archive/`. Required: the engine holds no corpus.
 * @param {String} [options.root=process.cwd()] Repository root.
 * @param {String} [options.releaseNotesRoot] The release-notes root (`--release-notes`); defaults to the engine's
 * `.github/RELEASE_NOTES` under `root`.
 * @param {String} [options.baseUrl='https://neomjs.com'] Canonical site URL for SEO outputs.
 * @param {String} [options.sitemapPath] Target sitemap index path (`apps/portal/sitemap.xml`).
 * @param {String} [options.sitemapCorePath] Target core sitemap path (`apps/portal/sitemap-core.xml`).
 * @param {String} [options.sitemapArchivePath] Target archive sitemap path (`apps/portal/sitemap-archive.xml`).
 * @param {String} [options.llmsPath] Target curated llms.txt path (`apps/portal/llms.txt`).
 * @param {String} [options.llmsFullPath] Target full documentation atlas path (`apps/portal/llms-full.txt`).
 * @param {String} [options.llmsAllPath] Target exhaustive archive llms-all.txt path (`apps/portal/llms-all.txt`).
 * @param {Boolean} [options.includeLabelIndex=false] Also rebuild the remote GitHub label index.
 * @param {Function} [options.createLabelIndexFn] Test seam for the label index builder.
 * @param {Function} [options.createReleaseIndexFn] Test seam for the release index builder.
 * @param {Function} [options.createDiscussionIndexFn] Test seam for the discussion index builder.
 * @param {Function} [options.createPullRequestIndexFn] Test seam for the pull-request index builder.
 * @param {Function} [options.createTicketIndexFn] Test seam for the ticket index builder.
 * @param {Function} [options.getSitemapXmlFn] Test seam for sitemap `<urlset>` generation.
 * @param {Function} [options.getSitemapIndexXmlFn] Test seam for sitemap `<sitemapindex>` generation.
 * @param {Function} [options.getLlmsTxtFn] Test seam for llms.txt / llms-all.txt generation.
 * @param {Function} [options.getLlmsFullTxtFn] Test seam for llms-full.txt generation.
 * @param {Function} [options.writeFileSync] Test seam for filesystem writes.
 * @param {Function} [options.log] Test seam for logging.
 * @returns {Promise<Object>} Generated artifact paths.
 */
async function rebuildContentIndexesAndSeo({
    corpusRoot,
    root                     = process.cwd(),
    releaseNotesRoot         = getEngineReleaseNotesRoot(root),
    baseUrl                  = DEFAULT_BASE_URL,
    sitemapPath              = path.join(root, 'apps/portal/sitemap.xml'),
    sitemapCorePath          = path.join(path.dirname(sitemapPath), 'sitemap-core.xml'),
    sitemapArchivePath       = path.join(path.dirname(sitemapPath), 'sitemap-archive.xml'),
    llmsPath                 = path.join(root, 'apps/portal/llms.txt'),
    llmsFullPath             = path.join(path.dirname(llmsPath), 'llms-full.txt'),
    llmsAllPath              = path.join(path.dirname(llmsPath), 'llms-all.txt'),
    includeLabelIndex        = false,
    createLabelIndexFn       = null,
    createReleaseIndexFn     = createReleaseIndex,
    createDiscussionIndexFn  = createDiscussionIndex,
    createPullRequestIndexFn = createPullRequestIndex,
    createTicketIndexFn      = createTicketIndex,
    getSitemapXmlFn          = getSitemapXml,
    getSitemapIndexXmlFn     = getSitemapIndexXml,
    getLlmsTxtFn             = getLlmsTxt,
    getLlmsFullTxtFn         = getLlmsFullTxt,
    writeFileSync            = fs.writeFileSync,
    log                      = console.log
} = {}) {
    corpusRoot       = requireContentRoot(corpusRoot,       '--corpus-root',   'rebuildContentIndexesAndSeo');
    releaseNotesRoot = requireContentRoot(releaseNotesRoot, '--release-notes', 'rebuildContentIndexesAndSeo');

    if (includeLabelIndex) {
        const labelIndexFn = createLabelIndexFn || (await import('./index/labels.mjs')).default;
        await labelIndexFn();
    }

    // No re-chunk pass here, deliberately: ordinal-100 layout is the corpus WRITER's invariant.
    // The GitHub Workflow emitter re-ranks the full active corpus at the end of every emission
    // (`SyncService#emitGeneratedContentAndDerive`), so every reader of the corpus — this rebuild
    // included — projects a corpus that is already canonical. Keeping the pass out of this script
    // also keeps the engine's build pipeline free of `ai/**` imports, which the
    // `check-engine-brain-boundary` guard enforces.
    await createReleaseIndexFn({releaseNotesRoot});
    await createPullRequestIndexFn({corpusRoot});
    await createDiscussionIndexFn({corpusRoot});
    await createTicketIndexFn({corpusRoot});

    const sitemapCoreXml = await getSitemapXmlFn({
        baseUrl,
        corpusRoot,
        existingSitemapPath: sitemapCorePath,
        includeArchives    : false,
        releaseNotesRoot
    });
    writeFileSync(sitemapCorePath, sitemapCoreXml);
    log(`Generated ${path.relative(root, sitemapCorePath)}`);

    const sitemapArchiveXml = await getSitemapXmlFn({
        baseUrl,
        corpusRoot,
        existingSitemapPath: sitemapArchivePath,
        includeArchives    : true,
        includeTopLevel    : false,
        onlyArchives       : true,
        releaseNotesRoot
    });
    writeFileSync(sitemapArchivePath, sitemapArchiveXml);
    log(`Generated ${path.relative(root, sitemapArchivePath)}`);

    const sitemapIndexXml = await getSitemapIndexXmlFn({
        baseUrl,
        sitemaps: [
            {path: path.basename(sitemapCorePath),    xml: sitemapCoreXml},
            {path: path.basename(sitemapArchivePath), xml: sitemapArchiveXml}
        ]
    });
    writeFileSync(sitemapPath, sitemapIndexXml);
    log(`Generated ${path.relative(root, sitemapPath)}`);

    const llmsTxt = await getLlmsTxtFn({
        baseUrl,
        corpusRoot,
        includeArchives: false,
        releaseNotesRoot
    });
    writeFileSync(llmsPath, llmsTxt);
    log(`Generated ${path.relative(root, llmsPath)}`);

    const llmsFullTxt = await getLlmsFullTxtFn({baseUrl, root});
    writeFileSync(llmsFullPath, llmsFullTxt);
    log(`Generated ${path.relative(root, llmsFullPath)}`);

    const llmsAllTxt = await getLlmsTxtFn({
        baseUrl,
        corpusRoot,
        includeArchives: true,
        releaseNotesRoot
    });
    writeFileSync(llmsAllPath, llmsAllTxt);
    log(`Generated ${path.relative(root, llmsAllPath)}`);

    return {
        baseUrl,
        llmsAllPath,
        llmsFullPath,
        llmsPath,
        sitemapArchivePath,
        sitemapCorePath,
        sitemapPath
    };
}

async function runCli() {
    const program = new Command();

    program
        .name('rebuild-content-indexes-and-seo')
        .description('Rebuilds the Portal content indexes, sitemap.xml and llms.txt from a declared corpus.')
        .requiredOption('--corpus-root <path>', 'Conversation corpus root holding issues/, pulls/, discussions/ and archive/', sanitizeInput)
        .option('--release-notes <path>', 'Release-notes root (default: .github/RELEASE_NOTES)', sanitizeInput)
        .option('--include-labels', 'Also rebuild the remote GitHub label index');

    program.parse(process.argv);

    const opts = program.opts();

    await rebuildContentIndexesAndSeo({
        corpusRoot       : path.resolve(opts.corpusRoot),
        includeLabelIndex: Boolean(opts.includeLabels),
        releaseNotesRoot : opts.releaseNotes ? path.resolve(opts.releaseNotes) : undefined
    })
}

if (isEntryModule(import.meta.url)) {
    runCli().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

export {rebuildContentIndexesAndSeo};
export default rebuildContentIndexesAndSeo;
