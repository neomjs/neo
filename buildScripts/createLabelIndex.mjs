import fs                from 'fs';
import path              from 'path';
import {fileURLToPath}   from 'url';
import {GH_LabelService} from '../ai/services.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '../apps/portal/resources/data/labels.json');

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
 */
async function generateLabelIndex() {
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

        console.log(`Found ${labels.length} labels. Writing to ${outputPath}...`);

        fs.writeFileSync(outputPath, JSON.stringify(labels, null, 0)); // Minified

        console.log('Successfully generated labels.json');

    } catch (error) {
        console.error('Error generating label index:', error);
        process.exit(1);
    }
}

if (process.argv[1] === __filename) {
    generateLabelIndex().then(() => {
        process.exit(0);
    });
}

export default generateLabelIndex;
