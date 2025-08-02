import { processFileContent } from '../../util/astTemplateProcessor.mjs';

/**
 * This Webpack loader is responsible for applying the AST-based `html` template
 * transformation to `.mjs` files during the Webpack build process.
 *
 * It acts as a pre-processor for JavaScript files before they are handled by other
 * loaders or bundled by Webpack.
 *
 * @param {string} source The source code of the file being processed.
 * @returns {string} The transformed source code.
 */
export default function(source) {
    // `this.resourcePath` is a property provided by Webpack's loader context,
    // giving us the absolute path to the file being processed. This is crucial
    // for logging meaningful errors.
    const result = processFileContent(source, this.resourcePath);

    // Return the (potentially modified) content to the next loader in the chain.
    return result.content;
};
