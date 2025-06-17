/**
 * The following top-level attributes will get converted into styles:
 * height, maxHeight, maxWidth, minHeight, minWidth, width
 *
 * Some tags must not do the transformation, so we add them here.
 * @member {Set} rawDimensionTags
 */
export const rawDimensionTags = new Set([
    'circle',
    'clipPath',
    'ellipse',
    'filter',
    'foreignObject',
    'image',
    'marker',
    'mask',
    'pattern',
    'rect',
    'svg',
    'use'
]);

/**
 * Void attributes inside html tags
 * @member {Set} voidAttributes
 * @protected
 */
export const voidAttributes = new Set([
    'checked',
    'defer',
    'disabled',
    'ismap',
    'multiple',
    'nohref',
    'noresize',
    'noshade',
    'nowrap',
    'open',
    'readonly',
    'required',
    'reversed',
    'selected'
]);

/**
 * Void html tags
 * @member {Set} voidElements
 * @protected
 */
export const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
]);
