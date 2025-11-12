import Base from './Base.mjs';

/**
 * @summary Provides a remote API for workers to safely read from and write to the document's head.
 *
 * This main thread addon acts as a proxy, allowing code running in the App worker
 * to manage SEO-related tags like the document title, meta tags, canonical URLs, and structured data (ld+json).
 * This is crucial for Single-Page Applications (SPAs) that need to update head metadata as the user navigates
 * without requiring a full page reload.
 *
 * @class Neo.main.addon.DocumentHead
 * @extends Neo.main.addon.Base
 */
class DocumentHead extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.DocumentHead'
         * @protected
         */
        className: 'Neo.main.addon.DocumentHead',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'getCanonical',
                'getLdJson',
                'getTag',
                'getTitle',
                'setCanonical',
                'setLdJson',
                'setTag',
                'setTitle'
            ]
        }
    }

    /**
     * Retrieves the href of the canonical link tag.
     * @returns {String|null} The canonical URL, or null if not found.
     */
    getCanonical() {
        const canonical = document.head.querySelector('link[rel="canonical"]');
        return canonical?.href || null
    }

    /**
     * Retrieves and parses the content of the ld+json script tag.
     * @returns {Object|null} The parsed JSON data, or null if the tag is not found or parsing fails.
     */
    getLdJson() {
        const script = document.head.querySelector('script[type="application/ld+json"]');

        if (script) {
            try {
                return JSON.parse(script.textContent)
            } catch (e) {
                console.error('Error parsing ld+json content', e);
                return null
            }
        }

        return null
    }

    /**
     * Finds a specific <meta> or <link> tag in the document head and returns its attributes.
     * @param {Object} config A configuration object to identify the tag.
     * @returns {Object|null} An object containing all attributes of the found tag, or null if not found.
     */
    getTag(config) {
        const {tag, ...attributes} = config;
        let selector;

        if (tag === 'meta') {
            if (attributes.name) {
                selector = `meta[name="${attributes.name}"]`
            } else if (attributes.property) {
                selector = `meta[property="${attributes.property}"]`
            }
        } else if (tag === 'link') {
            if (attributes.rel) {
                selector = `link[rel="${attributes.rel}"]`
            }
        }

        if (selector) {
            const existingTag = document.head.querySelector(selector);

            if (existingTag) {
                const attrs = {};

                for (const attr of existingTag.attributes) {
                    attrs[attr.name] = attr.value
                }
                return {tag, ...attrs}
            }
        }

        return null
    }

    /**
     * Retrieves the current document title.
     * @returns {String}
     */
    getTitle() {
        return document.title
    }

    /**
     * A convenience method to set the canonical URL.
     * @param {Object} data
     * @param {String} data.url The canonical URL to set.
     */
    setCanonical({url}) {
        this.setTag({
            tag : 'link',
            rel : 'canonical',
            href: url
        })
    }

    /**
     * Creates or updates the ld+json script tag with new structured data.
     * @param {Object} data The JavaScript object to be stringified and set as the script's content.
     */
    setLdJson({data}) {
        let script = document.head.querySelector('script[type="application/ld+json"]');

        if (!script) {
            script = document.createElement('script');
            script.type = 'application/ld+json';
            document.head.appendChild(script)
        }

        script.textContent = JSON.stringify(data, null, 2)
    }

    /**
     * Creates or updates a <meta> or <link> tag in the document head.
     * It finds an existing tag based on the same 'name', 'property' (for meta), or 'rel' (for link),
     * updates its attributes, or creates a new tag if one does not exist. This method is designed
     * to be efficient by modifying existing tags in place rather than removing and re-adding them.
     * @param {Object} config The configuration for the tag, including the tag name and its attributes.
     */
    setTag(config) {
        const {tag, ...attributes} = config;
        let selector, tagElement;

        if (tag === 'meta') {
            if (attributes.name) {
                selector = `meta[name="${attributes.name}"]`
            } else if (attributes.property) {
                selector = `meta[property="${attributes.property}"]`
            }
        } else if (tag === 'link') {
            if (attributes.rel) {
                selector = `link[rel="${attributes.rel}"]`
            }
        }

        tagElement = selector ? document.head.querySelector(selector) : null;

        if (!tagElement) {
            tagElement = document.createElement(tag);
        }

        for (const [key, value] of Object.entries(attributes)) {
            tagElement.setAttribute(key, value)
        }

        // Only append if it's a new element
        if (!tagElement.parentNode) {
            document.head.appendChild(tagElement)
        }
    }

    /**
     * Sets the document title.
     * @param {Object} data
     * @param {String} data.value The new title for the document.
     */
    setTitle({value}) {
        document.title = value
    }
}

export default Neo.setupClass(DocumentHead);
