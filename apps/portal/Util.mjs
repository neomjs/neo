/**
 * @param {String|null} searchString
 * @returns {Function}
 */
export function getSearchParams(searchString) {
    if (searchString?.startsWith('?')) {
        searchString = searchString.substring(1)
    }

    return searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {}
}
