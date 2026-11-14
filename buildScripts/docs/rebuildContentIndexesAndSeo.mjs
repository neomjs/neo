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
    getSeoJson,
    getSitemapIndexXml,
    getSitemapXml,
    getSsgArchiveRoutes
} from './seo/generate.mjs';
import verifySeoArtifacts          from './seo/verify.mjs';
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
 * Emits `seo.json` (preserving pre-baked git `lastmod` when `.git` is absent), `ssg-archive-routes.json`,
 * `sitemap-core.xml`, `sitemap-discussions.xml`, `sitemap-archive.xml`, `sitemap.xml` (referencing only
 * `sitemap-core.xml` and `sitemap-discussions.xml`), and `llms*.txt` atomically after `verifySeoArtifacts`
 * succeeds.
 */

/**
 * @summary Rebuilds all content-derived Portal indexes and SEO outputs.
 * @param {Object} [options={}]
 * @param {String} options.corpusRoot The conversation corpus root (`--corpus-root`), holding `issues/`, `pulls/`,
 * `discussions/` and `archive/`. Required: the engine holds no corpus.
 * @param {String} [options.root=process.cwd()] Repository root.
 * @param {String} [options.releaseNotesRoot] The release-notes root (`--release-notes`); defaults to the engine's
 * `.github/RELEASE_NOTES` under `root`.
 * @param {String} [options.baseUrl='https://neomjs.com'] Canonical site URL for SEO outputs.
 * @param {String} [options.dataDir] Optional Portal data directory override for hermetic index and SEO runs.
 * @param {String} [options.releasesPath] Optional custom `releases.json` path (test seam).
 * @param {String} [options.seoJsonPath] Target route-metadata JSON path (`apps/portal/resources/data/seo.json`).
 * @param {String} [options.ssgArchiveRoutesPath] Target SSG archive route JSON path (`apps/portal/resources/data/ssg-archive-routes.json`).
 * @param {String} [options.sitemapPath] Target sitemap index path (`apps/portal/sitemap.xml`).
 * @param {String} [options.sitemapCorePath] Target core sitemap path (`apps/portal/sitemap-core.xml`).
 * @param {String} [options.sitemapDiscussionsPath] Target discussions sitemap path (`apps/portal/sitemap-discussions.xml`).
 * @param {String} [options.sitemapArchivePath] Target archive sitemap path (`apps/portal/sitemap-archive.xml`).
 * @param {String} [options.llmsPath] Target curated llms.txt path (`apps/portal/llms.txt`).
 * @param {String} [options.llmsFullPath] Target full documentation atlas path (`apps/portal/llms-full.txt`).
 * @param {String} [options.llmsAllPath] Target exhaustive archive llms-all.txt path (`apps/portal/llms-all.txt`).
 * @param {Boolean} [options.includeLabelIndex=false] Also rebuild the remote GitHub label index.
 * @param {Boolean} [options.verifyArtifacts] Explicitly enable or skip pre-write cross-artifact verification.
 * @param {Function} [options.createLabelIndexFn] Test seam for the label index builder.
 * @param {Function} [options.createReleaseIndexFn] Test seam for the release index builder.
 * @param {Function} [options.createDiscussionIndexFn] Test seam for the discussion index builder.
 * @param {Function} [options.createPullRequestIndexFn] Test seam for the pull-request index builder.
 * @param {Function} [options.createTicketIndexFn] Test seam for the ticket index builder.
 * @param {Function} [options.getSeoJsonFn] Test seam for `seo.json` generation.
 * @param {Function} [options.getSsgArchiveRoutesFn] Test seam for `ssg-archive-routes.json` generation.
 * @param {Function} [options.getSitemapXmlFn] Test seam for sitemap `<urlset>` generation.
 * @param {Function} [options.getSitemapIndexXmlFn] Test seam for sitemap `<sitemapindex>` generation.
 * @param {Function} [options.getLlmsTxtFn] Test seam for llms.txt / llms-all.txt generation.
 * @param {Function} [options.getLlmsFullTxtFn] Test seam for llms-full.txt generation.
 * @param {Function} [options.verifySeoArtifactsFn] Test seam for pre-write cross-artifact verification.
 * @param {Function} [options.writeFileSync] Test seam for filesystem writes.
 * @param {Function} [options.log] Test seam for logging.
 * @returns {Promise<Object>} Generated artifact paths.
 */
async function rebuildContentIndexesAndSeo({
    corpusRoot,
    root                     = process.cwd(),
    releaseNotesRoot         = getEngineReleaseNotesRoot(root),
    baseUrl                  = DEFAULT_BASE_URL,
    dataDir,
    releasesPath             = dataDir ? path.join(dataDir, 'releases.json') : undefined,
    seoJsonPath              = path.join(dataDir || path.join(root, 'apps/portal/resources/data'), 'seo.json'),
    ssgArchiveRoutesPath     = path.join(dataDir || path.dirname(seoJsonPath), 'ssg-archive-routes.json'),
    sitemapPath              = path.join(root, 'apps/portal/sitemap.xml'),
    sitemapCorePath          = path.join(path.dirname(sitemapPath), 'sitemap-core.xml'),
    sitemapDiscussionsPath   = path.join(path.dirname(sitemapPath), 'sitemap-discussions.xml'),
    sitemapArchivePath       = path.join(path.dirname(sitemapPath), 'sitemap-archive.xml'),
    llmsPath                 = path.join(root, 'apps/portal/llms.txt'),
    llmsFullPath             = path.join(path.dirname(llmsPath), 'llms-full.txt'),
    llmsAllPath              = path.join(path.dirname(llmsPath), 'llms-all.txt'),
    includeLabelIndex        = false,
    verifyArtifacts,
    createLabelIndexFn       = null,
    createReleaseIndexFn     = createReleaseIndex,
    createDiscussionIndexFn  = createDiscussionIndex,
    createPullRequestIndexFn = createPullRequestIndex,
    createTicketIndexFn      = createTicketIndex,
    getSeoJsonFn             = getSeoJson,
    getSsgArchiveRoutesFn    = getSsgArchiveRoutes,
    getSitemapXmlFn          = getSitemapXml,
    getSitemapIndexXmlFn     = getSitemapIndexXml,
    getLlmsTxtFn             = getLlmsTxt,
    getLlmsFullTxtFn         = getLlmsFullTxt,
    verifySeoArtifactsFn     = verifySeoArtifacts,
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
    await createReleaseIndexFn(releasesPath ? {outputFile: releasesPath, releaseNotesRoot} : {releaseNotesRoot});
    await createPullRequestIndexFn(dataDir ? {
        chunkedOutputFile: path.join(dataDir, 'pulls/index.json'),
        corpusRoot,
        dataDir,
        manifestFile     : path.join(dataDir, 'pulls/manifest.json'),
        outputDir        : path.join(dataDir, 'pulls')
    } : {corpusRoot});
    await createDiscussionIndexFn(dataDir ? {
        corpusRoot,
        outputDir : path.join(dataDir, 'discussions'),
        outputFile: path.join(dataDir, 'discussions.json')
    } : {corpusRoot});
    await createTicketIndexFn(dataDir ? {
        chunkedOutputFile: path.join(dataDir, 'tickets/index.json'),
        corpusRoot,
        dataDir,
        manifestFile     : path.join(dataDir, 'tickets/manifest.json'),
        outputDir        : path.join(dataDir, 'tickets')
    } : {corpusRoot});

    const seoJson = await getSeoJsonFn({
        releaseNotesRoot,
        ...(releasesPath && {releasesPath}),
        root,
        seoJsonPath
    });

    const ssgArchiveRoutes = await getSsgArchiveRoutesFn({corpusRoot});

    const sitemapCoreXml = await getSitemapXmlFn({
        baseUrl,
        corpusRoot,
        existingSitemapPath: sitemapCorePath,
        includeArchives    : false,
        releaseNotesRoot,
        root,
        seoJson,
        seoJsonPath
    });

    const sitemapDiscussionsXml = await getSitemapXmlFn({
        baseUrl,
        corpusRoot,
        existingSitemapPath: sitemapDiscussionsPath,
        includeArchives    : true,
        onlyArchives       : false,
        onlyDiscussions    : true,
        releaseNotesRoot,
        root
    });

    const sitemapArchiveXml = await getSitemapXmlFn({
        baseUrl,
        corpusRoot,
        existingSitemapPath: sitemapArchivePath,
        includeArchives    : true,
        onlyArchives       : true,
        releaseNotesRoot,
        root
    });

    const sitemapIndexXml = await getSitemapIndexXmlFn({
        baseUrl,
        sitemaps: [
            {path: path.basename(sitemapCorePath),        xml: sitemapCoreXml},
            {path: path.basename(sitemapDiscussionsPath), xml: sitemapDiscussionsXml}
        ]
    });

    const llmsTxt = await getLlmsTxtFn({
        baseUrl,
        corpusRoot,
        includeArchives: false,
        releaseNotesRoot,
        ...(releasesPath && {releasesPath}),
        root
    });

    const llmsFullTxt = await getLlmsFullTxtFn({baseUrl, root});

    const llmsAllTxt = await getLlmsTxtFn({
        baseUrl,
        corpusRoot,
        includeArchives: true,
        releaseNotesRoot,
        ...(releasesPath && {releasesPath}),
        root
    });

    const usesDefaultSeoGenerators =
        getSeoJsonFn          === getSeoJson &&
        getSsgArchiveRoutesFn === getSsgArchiveRoutes &&
        getSitemapXmlFn       === getSitemapXml &&
        getSitemapIndexXmlFn  === getSitemapIndexXml &&
        getLlmsTxtFn          === getLlmsTxt &&
        getLlmsFullTxtFn      === getLlmsFullTxt;
    const shouldVerify = verifyArtifacts ?? (usesDefaultSeoGenerators || verifySeoArtifactsFn !== verifySeoArtifacts);

    if (shouldVerify) {
        await verifySeoArtifactsFn({
            baseUrl,
            corpusRoot,
            llmsAllTxt,
            llmsFullTxt,
            llmsTxt,
            releaseNotesRoot,
            root,
            seoJson,
            sitemapArchiveName    : path.basename(sitemapArchivePath),
            sitemapArchiveXml,
            sitemapCoreName       : path.basename(sitemapCorePath),
            sitemapCoreXml,
            sitemapDiscussionsName: path.basename(sitemapDiscussionsPath),
            sitemapDiscussionsXml,
            sitemapIndexXml,
            ssgArchiveRoutes
        });
    }

    writeFileSync(seoJsonPath, JSON.stringify(seoJson, null, 4) + '\n');
    log(`Generated ${path.relative(root, seoJsonPath)}`);

    writeFileSync(ssgArchiveRoutesPath, JSON.stringify(ssgArchiveRoutes, null, 4) + '\n');
    log(`Generated ${path.relative(root, ssgArchiveRoutesPath)}`);

    writeFileSync(sitemapCorePath, sitemapCoreXml);
    log(`Generated ${path.relative(root, sitemapCorePath)}`);

    writeFileSync(sitemapDiscussionsPath, sitemapDiscussionsXml);
    log(`Generated ${path.relative(root, sitemapDiscussionsPath)}`);

    writeFileSync(sitemapArchivePath, sitemapArchiveXml);
    log(`Generated ${path.relative(root, sitemapArchivePath)}`);

    writeFileSync(sitemapPath, sitemapIndexXml);
    log(`Generated ${path.relative(root, sitemapPath)}`);

    writeFileSync(llmsPath, llmsTxt);
    log(`Generated ${path.relative(root, llmsPath)}`);

    writeFileSync(llmsFullPath, llmsFullTxt);
    log(`Generated ${path.relative(root, llmsFullPath)}`);

    writeFileSync(llmsAllPath, llmsAllTxt);
    log(`Generated ${path.relative(root, llmsAllPath)}`);

    return {
        baseUrl,
        llmsAllPath,
        llmsFullPath,
        llmsPath,
        seoJsonPath,
        sitemapArchivePath,
        sitemapCorePath,
        sitemapDiscussionsPath,
        sitemapPath,
        ssgArchiveRoutesPath
    };
}

/**
 * @summary CLI entrypoint for rebuilding Portal content indexes, sitemaps, `seo.json`, `ssg-archive-routes.json`, and `llms*.txt`.
 * @returns {Promise<void>}
 */
async function runCli() {
    const program = new Command();

    program
        .name('rebuild-content-indexes-and-seo')
        .description('Rebuilds the Portal content indexes, sitemap.xml, ssg-archive-routes.json, and llms.txt from a declared corpus.')
        .requiredOption('--corpus-root <path>', 'Conversation corpus root holding issues/, pulls/, discussions/ and archive/', sanitizeInput)
        .option('--release-notes <path>', 'Release-notes root (default: .github/RELEASE_NOTES)', sanitizeInput)
        .option('--include-labels', 'Also rebuild the remote GitHub label index');

    program.parse(process.argv);

    const opts = program.opts();

    await rebuildContentIndexesAndSeo({
        corpusRoot       : path.resolve(opts.corpusRoot),
        includeLabelIndex: Boolean(opts.includeLabels),
        releaseNotesRoot : opts.releaseNotes ? path.resolve(opts.releaseNotes) : undefined
    });
}

if (isEntryModule(import.meta.url)) {
    runCli().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

export {rebuildContentIndexesAndSeo};
export default rebuildContentIndexesAndSeo;
