import fs                from 'fs-extra';
import path              from 'path';
import {Command}         from 'commander/esm.mjs';
import {fileURLToPath}   from 'url';
import {GH_LabelService} from '../../../ai/services.mjs';
import {sanitizeInput}   from '../../util/Sanitizer.mjs';

/**
 * @module buildScripts.createLabelIndex
 * @summary Fetches GitHub labels and generates a JSON index for the Neo.mjs Portal application.
 *
 * This script retrieves all labels from the repository using the Neo.mjs AI SDK (`GH_LabelService`).
 * It calculates contrast colors (black/white) for accessibility based on the label's background color.
 * The output is a `labels.json` file consumed by the Portal's "Tickets" view to render label badges.
 *
 * **Key Features:**
 * - **GitHub Integration:** Fetches live label data directly from the GitHub API.
 * - **Accessibility:** Automatically calculates optimal text contrast colors (YIQ formula).
 * - **Minification:** Outputs a minified JSON file for production use.
 *
 * @see apps/portal/view/news/tickets/Component.mjs
 * @see buildScripts/createTicketIndex.mjs
 * @keywords portal, labels, github, accessibility, build-script, knowledge-base
 */

const ROOT_DIR    = process.cwd();
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/labels.json');

/**
 * Calculates the optimal text color (black or white) for a given background color
 * using the YIQ color space formula.
 * @param {string} hexcolor - The 6-digit hex color (e.g., "aabbcc")
 * @returns {string} - "#000000" or "#ffffff"
 */
function getContrastColor(hexcolor) {
    const r = parseInt(hexcolor.substring(0, 2), 16);
    const g = parseInt(hexcolor.substring(2, 4), 16);
    const b = parseInt(hexcolor.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

/**
 * Main function to fetch labels and generate the index file.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.outputFile] - Path to the output JSON file (defaults to `apps/portal/resources/data/labels.json`)
 * @returns {Promise<void>} Resolves when the JSON file is written
 */
async function createLabelIndex(options = {}) {
    const outputFile = options.outputFile || OUTPUT_FILE;

    console.log('Fetching labels from GitHub...');

    try {
        const response = await GH_LabelService.listLabels();

        if (!response || !response.labels) {
            throw new Error('Invalid response from GH_LabelService');
        }

        const labels = response.labels.map(label => ({
            color      : `#${label.color}`,
            description: label.description,
            name       : label.name,
            textColor  : getContrastColor(label.color)
        }));

        labels.sort((a, b) => a.name.localeCompare(b.name));

        console.log(`Found ${labels.length} labels. Writing to ${outputFile}...`);

        await fs.ensureDir(path.dirname(outputFile));
        await fs.writeJSON(outputFile, labels);

        console.log('Successfully generated labels.json');

    } catch (error) {
        console.error('Error generating label index:', error);
        // We throw here so the caller (CLI or other script) can handle it
        throw error;
    }
}

/**
 * CLI entry point for the script.
 * Handles argument parsing using `commander` and invokes the main `createLabelIndex` function.
 *
 * Supported flags:
 * - `-o, --output <path>`: Custom output file path
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-label-index')
        .description('Generates a JSON index of GitHub labels for the Portal app.')
        .option('-o, --output <path>', 'Output file path', sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createLabelIndex({
        outputFile: opts.output ? path.resolve(ROOT_DIR, opts.output) : undefined
    });
}

const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    runCli()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

export default createLabelIndex;
