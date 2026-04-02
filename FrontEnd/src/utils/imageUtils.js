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

// Detectar suporte a WebP para otimizações
let webpSupported = null;

function supportsWebP() {
    if (webpSupported !== null) return webpSupported;

    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        webpSupported = canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
    } catch (e) {
        webpSupported = false;
    }
    return webpSupported;
}

function buildUrl(codigo, options = {}) {
    if (!codigo) return "";

    const {
        format = 'auto', // 'jpg', 'webp', 'auto'
        width = null,
        quality = 'auto', // 'auto', 'png', 85, 75, etc
        optimized = false, // aplica otimizações para conexão fraca
    } = options;

    let ext = 'jpg';

    // Se format é 'auto', escolhe WebP se suportado
    if (format === 'auto') {
        ext = supportsWebP() ? 'webp' : 'jpg';
    } else {
        ext = format;
    }

    // URL simples sem transformações
    let url = `${PREFIX}${encodeURIComponent(codigo)}.${ext}`;

    // Se Cloudinary (URL contém 'cloudinary'), adicionar transformações
    if (PREFIX.includes('cloudinary') && (width || optimized || quality !== 'auto')) {
        const transforms = [];

        if (width) {
            transforms.push(`w_${width}`);
            transforms.push('c_limit'); // não aumenta se original for menor
        }

        if (quality === 'auto') {
            transforms.push('q_auto');
        } else if (typeof quality === 'number') {
            transforms.push(`q_${quality}`);
        }

        // Para conexão fraca, usa formato automático
        if (optimized) {
            transforms.push('f_auto'); // formato automático
        }

        if (transforms.length > 0) {
            // PREFIX: https://res.cloudinary.com/dpmdodbzz/image/upload/v1772044095/catalogo-abr/
            // Precisa inserir transformações APÓS /image/upload/ e ANTES de v1772044095
            // Resultado: https://res.cloudinary.com/dpmdodbzz/image/upload/w_200,q_auto/v1772044095/catalogo-abr/codigo.jpg
            const transformString = transforms.join(',');

            // Encontrar a posição após /image/upload/
            const imageUploadIndex = PREFIX.indexOf('/image/upload/');
            if (imageUploadIndex !== -1) {
                const basePart = PREFIX.substring(0, imageUploadIndex + '/image/upload/'.length);
                const restPart = PREFIX.substring(imageUploadIndex + '/image/upload/'.length);
                url = `${basePart}${transformString}/${restPart}${encodeURIComponent(codigo)}.${ext}`;
            }
        }
    }

    return url;
}

/**
 * Return the full image URL for a given product code.
 * @param {string} codigo
 * @param {Object} options - { format, width, quality, optimized }
 * @returns {string}
 */
export function getImageUrl(codigo, options = {}) {
    return buildUrl(codigo, { format: 'auto', ...options });
}

/**
 * Alias for getImageUrl – kept for semantic clarity in places where a
 * thumbnail is requested. Optimizado para thumbnails pequenos.
 */
export function getThumbnailUrl(codigo, optimized = false) {
    return buildUrl(codigo, {
        format: 'auto',
        width: optimized ? 150 : 200,
        quality: optimized ? 75 : 'auto',
        optimized: optimized
    });
}

/**
 * Alias for getImageUrl – used when rendering the larger detail image.
 * Otimizado para telas de diferentes tamanhos.
 */
export function getDetailUrl(codigo, width = null, optimized = false) {
    return buildUrl(codigo, {
        format: 'auto',
        width: width || (optimized ? 600 : 800),
        quality: optimized ? 75 : 'auto',
        optimized: optimized
    });
}

/**
 * Retorna URL adequada baseada na qualidade da conexão
 * @param {string} codigo
 * @param {'thumbnail' | 'detail'} type
 * @param {Object} connectionInfo - { isSlowNetwork: boolean }
 * @returns {string}
 */
export function getOptimizedImageUrl(codigo, type = 'thumbnail', connectionInfo = {}) {
    const { isSlowNetwork = false } = connectionInfo;

    if (type === 'thumbnail') {
        return getThumbnailUrl(codigo, isSlowNetwork);
    }
    return getDetailUrl(codigo, isSlowNetwork ? 600 : 800, isSlowNetwork);
}

/**
 * Detecta suporte a WebP e retorna formato apropriado
 */
export function getWebpSupport() {
    return supportsWebP();
}
