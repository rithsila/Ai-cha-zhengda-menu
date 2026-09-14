/**
 * R2 Image CDN Worker
 *
 * Serves images from R2 with proper Cache-Control headers
 * so Cloudflare CDN caches them at the edge.
 *
 * R2 custom domains return cf-cache-status: DYNAMIC by default,
 * which means no CDN caching. This worker fixes that.
 */

interface Env {
  BUCKET: R2Bucket;
}

/** 1 year in seconds */
const ONE_YEAR = 31536000;

/** Map file extension → content type */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // remove leading "/"

    // Only allow GET/HEAD
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Block empty key (root path)
    if (!key) {
      return new Response('Not Found', { status: 404 });
    }

    // Get object from R2
    const object = await env.BUCKET.get(key);

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    // Detect content type from extension, fallback to R2 metadata
    const ext = '.' + key.split('.').pop()?.toLowerCase();
    const contentType =
      CONTENT_TYPES[ext] || object.httpMetadata?.contentType || 'application/octet-stream';

    // Build response with cache headers
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
    headers.set('CDN-Cache-Control', `public, max-age=${ONE_YEAR}`);
    headers.set('ETag', object.httpEtag);

    if (object.httpMetadata?.contentDisposition) {
      headers.set('Content-Disposition', object.httpMetadata.contentDisposition);
    }

    // Allow cross-origin access from menu app
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, {
      headers,
      status: 200,
    });
  },
} satisfies ExportedHandler<Env>;
