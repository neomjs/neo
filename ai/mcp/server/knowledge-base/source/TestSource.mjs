import Base       from './Base.mjs';
import TestParser from '../parser/TestParser.mjs';
import fs         from 'fs-extra';
import path       from 'path';

/**
 * @summary Extracts knowledge chunks from the Playwright test suite.
 *
 * This source provider recursively scans the `test/playwright` directory for `.spec.mjs` files.
 * It delegates the parsing logic to `TestParser`, which decomposes the test files into
 * granular chunks (headers and individual test cases) with line number metadata.
 *
 * This ensures that the Knowledge Base contains a detailed map of the project's automated
 * testing capabilities, enabling agents to find relevant test cases for regression testing
 * or example usage.
 *
 * @class Neo.ai.mcp.server.knowledge-base.source.TestSource
 * @extends Neo.ai.mcp.server.knowledge-base.source.Base
 * @singleton
 */
class TestSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.source.TestSource'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.source.TestSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from the test directory.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        // logger.log('Indexing Playwright tests...');
        return await this.indexRawDirectory(writeStream, createHashFn, 'test/playwright', 'test', {
            include: ['.mjs'],
            exclude: ['node_modules', 'test-results', 'reports']
        });
    }

    /**
     * Recursively scans a directory and indexes files as raw source chunks.
     * @param {Object}   writeStream           The stream to write chunks to.
     * @param {Function} createHashFn          Function to create content hash.
     * @param {String}   relativePath          The relative path from cwd to scan.
     * @param {String}   defaultType           The default type to assign to chunks.
     * @param {Object}   options               Configuration options.
     * @param {String[]} options.include       Array of file extensions to include (e.g. ['.mjs', '.md']).
     * @param {String[]} options.exclude       Array of directory names to exclude.
     * @param {Object}   options.typeOverrides Map of path segments to type values (e.g. {'examples': 'example'}).
     * @returns {Promise<Number>} The number of chunks created.
     * @private
     */
    async indexRawDirectory(writeStream, createHashFn, relativePath, defaultType, options={}) {
        let count = 0;
        const fullPath = path.resolve(process.cwd(), relativePath);

        if (!await fs.pathExists(fullPath)) return 0;

        const entries = await fs.readdir(fullPath, {withFileTypes: true});
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const entryName         = entry.name;
            const entryPath         = path.join(fullPath, entryName);
            const relativeEntryPath = path.join(relativePath, entryName);

            if (entry.isDirectory()) {
                if (options.exclude?.includes(entryName)) continue;
                count += await this.indexRawDirectory(writeStream, createHashFn, relativeEntryPath, defaultType, options);
            } else if (entry.isFile()) {
                const ext = path.extname(entryName);
                if (options.include?.includes(ext)) {
                    const content = await fs.readFile(entryPath, 'utf-8');
                    let type      = defaultType;

                    if (options.typeOverrides) {
                        for (const [key, value] of Object.entries(options.typeOverrides)) {
                            if (relativeEntryPath.includes(`/${key}/`)) {
                                type = value;
                                break;
                            }
                        }
                    }

                    // Special handling for Playwright test files to split them into granular chunks
                    if (type === 'test' && ext === '.mjs') {
                        const testChunks = TestParser.parse(content, relativeEntryPath);
                        if (testChunks.length > 0) {
                            testChunks.forEach(chunk => {
                                chunk.hash = createHashFn(chunk);
                                writeStream.write(JSON.stringify(chunk) + '\n');
                                count++;
                            });
                            continue; // Skip default processing
                        }
                        // If parsing returned no chunks (e.g. no tests found), fall through to default
                    }

                    // Determine kind based on extension or content
                    let kind = 'module';
                    if (type === 'test') kind = 'test-spec';
                    if (ext === '.md')   kind = 'documentation';

                    const chunk = {
                        type,
                        kind,
                        name  : relativeEntryPath,
                        content,
                        source: relativeEntryPath
                    };

                    chunk.hash = createHashFn(chunk);
                    writeStream.write(JSON.stringify(chunk) + '\n');
                    count++;
                }
            }
        }
        return count;
    }
}

export default Neo.setupClass(TestSource);
