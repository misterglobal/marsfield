"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinnedLookup = pinnedLookup;
exports.scanProductUrl = scanProductUrl;
const promises_1 = require("dns/promises");
const https_1 = require("https");
const MAX_HTML_BYTES = 1_500_000;
function pinnedLookup(address) {
    return (_hostname, options, callback) => {
        if (typeof options === 'object' && options?.all) {
            callback(null, [address]);
            return;
        }
        callback(null, address.address, address.family);
    };
}
function privateAddress(address) {
    const normalized = address.toLowerCase().replace(/^::ffff:/, '');
    if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb'))
        return true;
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
        return false;
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
}
async function safeUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('Enter a valid HTTPS product URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
        throw new Error('Product URLs must use public HTTPS without embedded credentials or custom ports');
    if (url.hostname === 'localhost' || url.hostname.endsWith('.local'))
        throw new Error('Local and private-network URLs are not allowed');
    const addresses = await (0, promises_1.lookup)(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => privateAddress(address)))
        throw new Error('Product URL resolves to a private or unsafe network address');
    return { url, address: addresses[0] };
}
async function fetchHtml(value, redirects = 0) {
    if (redirects > 3)
        throw new Error('Product URL redirected too many times');
    const { url, address } = await safeUrl(value);
    return new Promise((resolve, reject) => {
        const request = (0, https_1.request)(url, {
            method: 'GET', servername: url.hostname,
            headers: { 'User-Agent': 'MarsfieldProductScanner/1.0', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
            lookup: pinnedLookup(address),
        }, (response) => {
            const location = response.headers.location;
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
                response.resume();
                void fetchHtml(new URL(location, url).toString(), redirects + 1).then(resolve, reject);
                return;
            }
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                response.resume();
                reject(new Error(`Product page returned HTTP ${response.statusCode || 'error'}`));
                return;
            }
            const contentType = String(response.headers['content-type'] || '').toLowerCase();
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
                response.resume();
                reject(new Error('URL does not point to an HTML product page'));
                return;
            }
            const declared = Number(response.headers['content-length'] || 0);
            if (declared > MAX_HTML_BYTES) {
                response.resume();
                reject(new Error('Product page is too large to scan'));
                return;
            }
            const chunks = [];
            let size = 0;
            response.on('data', (chunk) => { size += chunk.length; if (size > MAX_HTML_BYTES)
                request.destroy(new Error('Product page is too large to scan'));
            else
                chunks.push(chunk); });
            response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), finalUrl: url.toString() }));
        });
        request.setTimeout(12_000, () => request.destroy(new Error('Product page request timed out')));
        request.on('error', reject);
        request.end();
    });
}
function decode(value) {
    return value.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
}
function metadata(html, baseUrl) {
    const metas = {};
    for (const match of html.matchAll(/<meta\s+[^>]*(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>|<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']([^"']+)["'][^>]*>/gi)) {
        metas[(match[1] || match[4] || '').toLowerCase()] = decode(match[2] || match[3] || '');
    }
    const jsonLd = [];
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            jsonLd.push(JSON.parse(match[1].trim()));
        }
        catch { /* malformed merchant markup */ }
    }
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const visibleText = decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).slice(0, 12_000);
    const imageCandidates = [metas['og:image'], metas['twitter:image']].filter(Boolean).map((item) => { try {
        return new URL(item, baseUrl).toString();
    }
    catch {
        return '';
    } }).filter((item) => item.startsWith('https://'));
    return { title, metas, json_ld: jsonLd.slice(0, 12), visible_text: visibleText, image_candidates: imageCandidates };
}
async function scanProductUrl(sourceUrl) {
    const fetched = await fetchHtml(sourceUrl);
    const extracted = metadata(fetched.html, fetched.finalUrl);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new Error('Product scanning is not configured');
    const schema = { type: 'object', additionalProperties: false, properties: {
            name: { type: 'string' }, brand_name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' },
            detected_claims: { type: 'array', items: { type: 'string' } }, restrictions_to_review: { type: 'array', items: { type: 'string' } },
            brand_colours: { type: 'array', items: { type: 'string' } }, image_urls: { type: 'array', items: { type: 'string' } },
        }, required: ['name', 'brand_name', 'description', 'category', 'detected_claims', 'restrictions_to_review', 'brand_colours', 'image_urls'] };
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', instructions: 'Normalize product data extracted from a merchant page. Use only supplied evidence. Do not invent specifications, claims, certifications, ingredients, pricing, colours, or restrictions. detected_claims are unverified marketing claims for human review, never approvals. Include only public HTTPS product image URLs present in the supplied data. Return concise plain text.', input: JSON.stringify({ source_url: fetched.finalUrl, ...extracted }), text: { format: { type: 'json_schema', name: 'product_scan', strict: true, schema } } }) });
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload?.error?.message || 'OpenAI product extraction failed');
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    if (!outputText)
        throw new Error('Product scanner returned no data');
    const result = JSON.parse(outputText);
    const safeImages = [];
    for (const item of (result.image_urls || []).slice(0, 8)) {
        try {
            const candidate = new URL(item, fetched.finalUrl).toString();
            await safeUrl(candidate);
            safeImages.push(candidate);
        }
        catch { /* discard unsafe image URL */ }
    }
    result.image_urls = safeImages;
    return { ...result, source_url: fetched.finalUrl, scanned_at: new Date().toISOString() };
}
