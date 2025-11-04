import {spawn}         from 'child_process';
import {fileURLToPath} from 'url';
import fs              from 'fs/promises';
import path            from 'path';
import os              from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We need to find the jsdoc executable.
// The original script had a clever way to do this, which I will replicate here.
let jsdocPath;

try {
    // The path is relative to the node_modules directory, so we need to resolve it.
    // This is the most reliable way to find it, assuming it's a dependency.
    jsdocPath = path.dirname(fileURLToPath(import.meta.resolve('jsdoc/jsdoc.js')));
} catch (e) {
    throw new Error('Could not find jsdoc module. Please ensure it is installed.', e);
}

/**
 * Creates a temporary file with the given content.
 * @param {string} content - The content to write to the file.
 * @param {string} postfix - The file extension.
 * @returns {Promise<{path: string, cleanup: Function}>}
 */
async function createTempFile(content, postfix = '.js') {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `jsdocx-${Date.now()}${postfix}`);
    await fs.writeFile(tempPath, content, 'utf8');
    return {
        path: tempPath,
        cleanup: async () => {
            try {
                await fs.unlink(tempPath);
            } catch (e) {
                // Ignore errors on cleanup
            }
        }
    };
}

/**
 * Executes the JSDoc command with the given arguments and configuration.
 * @param {string[]} args - The arguments to pass to JSDoc.
 * @param {object} conf - The JSDoc configuration object.
 * @returns {Promise<string>} - The JSON output from JSDoc.
 */
async function execJSDoc(args, conf) {
    let tempConfFile;
    const cmdArgs = [...args];

    if (conf) {
        tempConfFile = await createTempFile(JSON.stringify(conf), '.json');
        cmdArgs.push('-c', tempConfFile.path);
    }

    return new Promise((resolve, reject) => {
        const proc = spawn('node', [path.join(jsdocPath, 'jsdoc.js'), ...cmdArgs]);
        let output = '';
        let err = '';

        proc.stdout.on('data', data => {
            output += data;
        });

        proc.stderr.on('data', data => {
            err += data;
        });

        proc.on('close', code => {
            if (tempConfFile) {
                tempConfFile.cleanup();
            }
            if (code !== 0 || err) {
                return reject(new Error(err));
            }
            resolve(output);
        });

        proc.on('error', spawnErr => {
            if (tempConfFile) {
                tempConfFile.cleanup();
            }
            reject(spawnErr);
        });
    });
}

/**
 * Builds the arguments for the JSDoc CLI.
 * @param {object} options - The options object.
 * @returns {string[]}
 */
function buildArgs(options) {
    const args = ['-X']; // -X is for explain, which outputs JSON

    if (Array.isArray(options.files)) {
        args.push(...options.files);
    }

    args.push('-e', options.encoding || 'utf8');

    if (options.package) {
        args.push('-P', options.package);
    }
    if (options.recurse) {
        args.push('-r');
    }
    if (options.pedantic) {
        args.push('--pedantic');
    }
    if (options.query) {
        args.push('-q', options.query);
    }

    return args;
}

/**
 * Builds the configuration object for JSDoc.
 * @param {object} options - The options object.
 * @returns {object}
 */
function buildConf(options) {
    const config = options.config || {};

    // A simplified version of the original, focusing on what's needed.
    return {
        tags: {
            allowUnknownTags: options.allowUnknownTags !== false,
            dictionaries: Array.isArray(options.dictionaries) ? options.dictionaries : ['jsdoc', 'closure']
        },
        source: {
            includePattern: options.includePattern || '.+\\.js(doc|x)?$',
            excludePattern: options.excludePattern || '(^|\\/|\\\\)_'
        },
        templates: {
            cleverLinks: false,
            monospaceLinks: false
        },
        plugins: Array.isArray(options.plugins) ? options.plugins : [],
        ...config
    };
}

/**
 * Runs JSDoc and returns the parsed JSON output.
 * @param {object} options - The options for JSDoc.
 * @returns {Promise<any>}
 */
export async function run(options) {
    const args = buildArgs(options);
    const conf = buildConf(options);

    const jsonOutput = await execJSDoc(args, conf);

    try {
        return JSON.parse(jsonOutput);
    } catch (e) {
        console.error('Failed to parse JSDoc output:', jsonOutput);
        throw new Error('JSDoc produced invalid JSON.');
    }
}
