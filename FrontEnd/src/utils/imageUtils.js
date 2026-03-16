// Utility functions to build image URLs for the catalog.
// Images are now hosted in a Cloudinary folder supplied via environment
// variable. The value **must** be provided; without it the helper will
// emit an empty string and log a warning so missing configuration is
// obvious during development or in production.

const RAW_PREFIX = import.meta.env.VITE_CLOUDINARY_FOLDER;
if (!RAW_PREFIX || !RAW_PREFIX.trim()) {
    // throw during build so deployment fails if env var is missing.
    throw new Error(
        "VITE_CLOUDINARY_FOLDER must be defined in the environment; " +
        "check your .env or the hosting platform settings."
    );
}
// normalise the configured value; it always ends with a slash
const PREFIX = RAW_PREFIX.trim().replace(/\/?$/, "/");

function buildUrl(codigo) {
    if (!codigo) return "";
    return `${PREFIX}${encodeURIComponent(codigo)}.jpg`;
}

/**
 * Return the full image URL for a given product code.
 * @param {string} codigo
 * @returns {string}
 */
export function getImageUrl(codigo) {
    return buildUrl(codigo);
}

/**
 * Alias for getImageUrl – kept for semantic clarity in places where a
 * thumbnail is requested.
 */
export function getThumbnailUrl(codigo) {
    return buildUrl(codigo);
}

/**
 * Alias for getImageUrl – used when rendering the larger detail image.
 */
export function getDetailUrl(codigo) {
    return buildUrl(codigo);
}
