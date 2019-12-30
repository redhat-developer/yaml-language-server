export const KUBERNETES_SCHEMA_URL = 'https://raw.githubusercontent.com/garethr/kubernetes-json-schema/master/v1.14.0-standalone-strict/all.json';

/**
 * Resolve kubernetes to url
 * @param url The URL that you want to resolve
 */
export function resolveURL(url: string) {
    if (url.toLowerCase() === 'kubernetes') {
        return KUBERNETES_SCHEMA_URL;
    }
    return url;
}
