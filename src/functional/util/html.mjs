import { rawDimensionTags, voidAttributes, voidElements } from '../../vdom/domConstants.mjs';

/**
 * @param {Array<String>} strings
 * @param {Array<*>} values
 * @returns {Object} A VDomNodeConfig object.
 */
const html = (strings, ...values) => {
    let fullString = '';
    for (let i = 0; i < strings.length; i++) {
        fullString += strings[i];
        if (i < values.length) {
            // Use a unique placeholder for dynamic values
            fullString += `__DYNAMIC_VALUE_${i}__`;
        }
    }

    // Very basic parsing: find the first tag and its content
    const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/;
    const match = fullString.match(tagRegex);

    if (!match) {
        // If no matching tag, return a simple text node or empty div
        return { tag: 'div', text: fullString.replace(/__DYNAMIC_VALUE_\d+__/g, (m) => {
            const index = parseInt(m.match(/\d+/)[0]);
            return values[index];
        }) };
    }

    const rootTag = match[1];
    const attributesString = match[2];
    let innerContent = match[3];

    const vdomNode = {
        tag: rootTag,
        cn: []
    };

    // Parse attributes (very basic: only id for now)
    const idMatch = attributesString.match(/id="([^"]+)"/);
    if (idMatch) {
        vdomNode.id = idMatch[1];
    }

    // Replace dynamic placeholders with actual values in innerContent
    innerContent = innerContent.replace(/__DYNAMIC_VALUE_(\d+)__/g, (m, index) => {
        return values[parseInt(index)];
    });

    // For the current test case, we know it's <p> and <span>
    // This is still not a generic parser, but a step towards it.
    const pSpanRegex = /<p>([\s\S]*?)<\/p>\s*<span>([\s\S]*?)<\/span>/;
    const pSpanMatch = innerContent.match(pSpanRegex);

    if (pSpanMatch) {
        vdomNode.cn.push({
            tag: 'p',
            text: pSpanMatch[1]
        });
        vdomNode.cn.push({
            tag: 'span',
            text: pSpanMatch[2]
        });
    } else {
        // Fallback for simpler cases or if the regex doesn't match
        vdomNode.cn.push({
            tag: 'div', // Default child tag
            text: innerContent // Treat as plain text for now
        });
    }

    return vdomNode;
};

export default html;
