import Base from './Base.mjs';

/**
 * Basic Read and write access for document.head
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
     * @returns {String|null}
     */
    getCanonical() {
        const canonical = document.head.querySelector('link[rel="canonical"]');
        return canonical?.href || null
    }

    /**
     * @returns {Object|null}
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
     * Gets a <meta> or <link> tag from the document head.
     * @param {Object} config
     * @returns {Object|null}
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
     * @returns {String}
     */
    getTitle() {
        return document.title
    }

    /**
     * @param {Object} data
     * @param {String} data.url
     */
    setCanonical({url}) {
        this.setTag({
            tag : 'link',
            rel : 'canonical',
            href: url
        })
    }

    /**
     * @param {Object} data
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
     * updates its attributes, or creates a new tag if one does not exist.
     * @param {Object} config The configuration for the tag, including the tag name.
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
     * @param {Object} data
     * @param {String} data.value
     */
    setTitle({value}) {
        document.title = value
    }
}

export default Neo.setupClass(DocumentHead);
