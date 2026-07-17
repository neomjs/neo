import Base                              from './Base.mjs';
import fs                                from 'fs-extra';
import path                              from 'path';
import aiConfig                          from '../../../mcp/server/knowledge-base/config.mjs';
import {splitPullRequestArchiveMarkdown} from './pullRequestArchiveElementSplitter.mjs';

/**
 * @summary Extracts knowledge chunks from locally synced Pull Request conversations.
 *
 * This source provider iterates through the `resources/content/pulls` directory,
 * embedding PR bodies and review conversations into the Knowledge Base. It closes
 * the signal-asymmetry gap where Tickets capture the *problem* while PRs capture
 * the *solution*: merge rationale, reviewer corrections, scope-creep warnings, and
 * follow-up ticket links. Without this provider, `ask_knowledge_base` can surface
 * the intent of a change but not the reasoning recorded during execution.
 *
 * @class Neo.ai.services.knowledge-base.source.PullRequestSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
const loadIndexMap = async (neoRootDir, type) => {
    const map       = new Map();
    const typeIndex = path.resolve(neoRootDir, `resources/content/${type}/_index.json`);
    const rootIndex = path.resolve(neoRootDir, 'resources/content/_index.json');

    let entries = [];
    if (await fs.pathExists(typeIndex)) {
        entries = JSON.parse(await fs.readFile(typeIndex, 'utf-8'));
    } else if (await fs.pathExists(rootIndex)) {
        const rootEntries = JSON.parse(await fs.readFile(rootIndex, 'utf-8'));
        entries = rootEntries.filter(e => e.type === type);
    }

    for (const entry of entries) {
        if (entry.path) {
            map.set(path.normalize(entry.path), entry.id);
        }
    }

    return map;
};

class PullRequestSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.PullRequestSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.PullRequestSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from local Markdown Pull Requests.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        // Per-source paths (array) from the `sourcePaths` config (SSOT).
        const pullRequestPaths = aiConfig.sourcePaths.PullRequestSource;
        const targetPaths      = pullRequestPaths.map(p => path.resolve(aiConfig.neoRootDir, p));

        const indexMap    = await loadIndexMap(aiConfig.neoRootDir, 'pulls');
        const contentRoot = path.resolve(aiConfig.neoRootDir, 'resources/content');

        // Extraction walks FILES, but a chunk's name is keyed by PR IDENTITY (`pr-<id>#<element>`).
        // Two artifacts for one id therefore emit two chunks under the SAME logical name with
        // DIFFERENT content and different `source` paths — so they land as distinct rows, and a
        // retrieval returns both. A maintainer then reads one PR's two divergent renderings as two
        // corroborating pieces of evidence. That is the failure this corpus's integrity work exists
        // to prevent, arriving through the consumer rather than the writer.
        //
        // Ids are normalised to strings because they arrive typed two ways: `Number` from the index
        // map, `String` from the filename fallback. Comparing them raw makes `10124 !== '10124'` and
        // the check silently never fires — a guard that cannot see the thing it guards against.
        const seenIds = new Map();

        for (const targetPath of targetPaths) {
            if (await fs.pathExists(targetPath)) {
                const pullFiles = await fs.readdir(targetPath, { recursive: true });
                pullFiles.sort();

                for (const file of pullFiles) {
                    if (typeof file === 'string' && file.endsWith('.md')) {
                        const filePath          = path.join(targetPath, file);
                        const relativeToContent = path.relative(contentRoot, filePath);

                        let id = indexMap.get(relativeToContent);
                        if (id === undefined) {
                            id = path.basename(file).replace('.md', '').replace(/^pr-/, '');
                        }

                        const content = await fs.readFile(filePath, 'utf-8');
                        // Relative path keeps the distributed Chroma zip portable.
                        const source = path.relative(aiConfig.neoRootDir, filePath);
                        const idKey  = String(id);

                        // Fail closed. Skipping the second copy would be a silent choice of which
                        // rendering is canonical — made by directory-walk order, which is not a
                        // judgement anything here is entitled to make. Emitting both is worse: the
                        // Knowledge Base would then answer questions about this PR with two
                        // divergent texts and no way to tell a reader that one is stale. Refusing
                        // costs an ingestion run; the alternatives cost the retrieval substrate's
                        // trustworthiness, which is the only thing it has.
                        if (seenIds.has(idKey)) {
                            throw new Error(
                                `PullRequestSource: pull request ${idKey} has more than one local artifact ` +
                                `(${seenIds.get(idKey)} and ${source}) — refusing to embed duplicate evidence ` +
                                `under one logical name. Repair the corpus first.`
                            );
                        }

                        seenIds.set(idKey, source);
                        // Per-element chunks (body + each review/comment) keep a multi-round PR
                        // under the embedding cap; a no-discussion PR yields one body chunk whose
                        // content equals the whole file.
                        const elements = splitPullRequestArchiveMarkdown(content);

                        for (const element of elements) {
                            const suffix = element.kind === 'body' ? 'body' : `${element.kind}-${element.ordinal}`;
                            const chunk  = {
                                type   : 'pull',
                                kind   : 'pull',
                                name   : `pr-${id}#${suffix}`,
                                content: element.content,
                                source
                            };

                            chunk.hash = createHashFn(chunk);
                            writeStream.write(JSON.stringify(chunk) + '\n');
                            count++;
                        }
                    }
                }
            }
        }

        return count;
    }
}

export default Neo.setupClass(PullRequestSource);
