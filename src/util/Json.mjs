import Base from '../core/Base.mjs';

const codeBlockRegex = /```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i;

/**
 * Utility class for robust JSON handling.
 *
 * Its primary purpose is to safely extract and parse JSON content from text that may contain
 * Markdown formatting, code block wrappers (fenced code blocks), or other noise.
 * This is particularly useful when processing responses from AI models which often wrap
 * JSON output in Markdown code blocks despite instructions to the contrary.
 *
 * @class Neo.util.Json
 * @extends Neo.core.Base
 */
class Json extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Json'
         * @protected
         */
        className: 'Neo.util.Json'
    }

    /**
     * Attempts to extract and parse a JSON object from a string.
     *
     * It specifically looks for and strips Markdown code block delimiters
     * (e.g. ```json ... ```, ```javascript ... ```, or just ``` ... ```)
     * before attempting to parse the enclosed content.
     *
     * @param {String} text The input string which may contain a markdown-wrapped JSON block.
     * @returns {Object|null} The parsed JSON object, or null if parsing failed.
     */
    static extract(text) {
        if (!text) return null;

        let jsonString = text.trim();

        // Matches ```json ... ``` or ```javascript ... ``` or ``` ... ```
        // capturing group 1 is the content
        const match = jsonString.match(codeBlockRegex);

        if (match) {
            jsonString = match[1].trim();
        }

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            // console.error('Neo.util.Json.extract: Failed to parse JSON', e);
            return null;
        }
    }
}

export default Neo.setupClass(Json);
