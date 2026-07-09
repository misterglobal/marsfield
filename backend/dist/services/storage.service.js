"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = exports.StorageService = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
function envValue(name) {
    const value = process.env[name]?.trim();
    if (!value)
        return undefined;
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1).trim();
    }
    return value;
}
function parseR2Config() {
    const bucketUrl = envValue('R2_BUCKET_URL') || envValue('CLOUDFLARE_R2_BUCKET_URL');
    const endpointFromEnv = envValue('R2_ENDPOINT') || envValue('CLOUDFLARE_R2_ENDPOINT');
    const bucketFromEnv = envValue('R2_BUCKET') || envValue('CLOUDFLARE_R2_BUCKET');
    const accessKeyId = envValue('R2_ACCESS_KEY_ID') || envValue('CLOUDFLARE_R2_ACCESS_KEY_ID');
    const secretAccessKey = envValue('R2_SECRET_ACCESS_KEY') || envValue('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    if (!accessKeyId || !secretAccessKey) {
        return null;
    }
    if (bucketUrl) {
        const parsed = new URL(bucketUrl);
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const bucket = bucketFromEnv || pathParts[0];
        if (!bucket) {
            throw new Error('R2_BUCKET_URL must include a bucket path or R2_BUCKET must be set');
        }
        return {
            endpoint: `${parsed.protocol}//${parsed.host}`,
            bucket,
            publicBaseUrl: envValue('R2_PUBLIC_BASE_URL') || envValue('CLOUDFLARE_R2_PUBLIC_BASE_URL'),
            accessKeyId,
            secretAccessKey,
        };
    }
    if (!endpointFromEnv || !bucketFromEnv) {
        return null;
    }
    return {
        endpoint: endpointFromEnv.replace(/\/+$/, ''),
        bucket: bucketFromEnv,
        publicBaseUrl: envValue('R2_PUBLIC_BASE_URL') || envValue('CLOUDFLARE_R2_PUBLIC_BASE_URL'),
        accessKeyId,
        secretAccessKey,
    };
}
function extensionForAsset(sourceUrl, mimeType, assetType) {
    try {
        const ext = path_1.default.extname(new URL(sourceUrl).pathname).replace('.', '').toLowerCase();
        if (ext && ext.length <= 8)
            return ext;
    }
    catch {
        // Ignore URL parse failures and infer below.
    }
    if (mimeType?.includes('png'))
        return 'png';
    if (mimeType?.includes('jpeg') || mimeType?.includes('jpg'))
        return 'jpg';
    if (mimeType?.includes('webp'))
        return 'webp';
    if (mimeType?.includes('mpeg'))
        return 'mp3';
    if (mimeType?.includes('wav'))
        return 'wav';
    if (mimeType?.includes('mp4'))
        return 'mp4';
    if (mimeType?.includes('json'))
        return 'json';
    if (mimeType?.includes('text'))
        return 'txt';
    return assetType === 'image' ? 'png' : assetType === 'document' ? 'json' : 'mp4';
}
class StorageService {
    config = parseR2Config();
    client = this.config
        ? new client_s3_1.S3Client({
            region: 'auto',
            endpoint: this.config.endpoint,
            forcePathStyle: true,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            },
        })
        : null;
    isConfigured() {
        return Boolean(this.config && this.client);
    }
    async storeRemoteAsset(input) {
        if (!this.config || !this.client) {
            return null;
        }
        const response = await fetch(input.sourceUrl);
        if (!response.ok) {
            throw new Error(`Failed downloading generated asset: ${response.status} ${response.statusText}`);
        }
        const mimeType = response.headers.get('content-type');
        const buffer = Buffer.from(await response.arrayBuffer());
        const checksum = (0, crypto_1.createHash)('sha256').update(buffer).digest('hex');
        const extension = extensionForAsset(input.sourceUrl, mimeType, input.assetType);
        const key = [
            'users',
            input.userId,
            'predictions',
            input.predictionId,
            `${(0, crypto_1.randomUUID)()}.${extension}`,
        ].join('/');
        try {
            await this.client.send(new client_s3_1.PutObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType || undefined,
                Metadata: {
                    source: 'marsfield-generation',
                    predictionId: input.predictionId,
                },
            }));
        }
        catch (error) {
            throw new Error(`R2 upload failed: ${this.formatStorageError(error)}`);
        }
        const publicBaseUrl = this.config.publicBaseUrl?.replace(/\/+$/, '');
        const url = publicBaseUrl
            ? `${publicBaseUrl}/${key}`
            : `${this.config.endpoint}/${this.config.bucket}/${key}`;
        return {
            provider: 'cloudflare_r2',
            bucket: this.config.bucket,
            key,
            url,
            mimeType,
            byteSize: buffer.byteLength,
            checksum,
        };
    }
    async storeBuffer(input) {
        if (!this.config || !this.client)
            return null;
        const checksum = (0, crypto_1.createHash)('sha256').update(input.buffer).digest('hex');
        const extension = extensionForAsset(input.originalName || '', input.mimeType, input.assetType);
        const now = new Date();
        const key = input.namespace === 'uploads'
            ? ['users', input.userId, 'uploads', String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${input.objectId || (0, crypto_1.randomUUID)()}.${extension}`].join('/')
            : input.namespace === 'processed'
                ? ['users', input.userId, 'processed', String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${input.objectId || (0, crypto_1.randomUUID)()}.${extension}`].join('/')
                : ['users', input.userId, 'thumbnails', `${input.objectId || (0, crypto_1.randomUUID)()}.${extension}`].join('/');
        try {
            await this.client.send(new client_s3_1.PutObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
                Body: input.buffer,
                ContentType: input.mimeType,
                Metadata: input.metadata,
            }));
        }
        catch (error) {
            throw new Error(`R2 upload failed: ${this.formatStorageError(error)}`);
        }
        const publicBaseUrl = this.config.publicBaseUrl?.replace(/\/+$/, '');
        const url = publicBaseUrl
            ? `${publicBaseUrl}/${key}`
            : `${this.config.endpoint}/${this.config.bucket}/${key}`;
        return {
            provider: 'cloudflare_r2',
            bucket: this.config.bucket,
            key,
            url,
            mimeType: input.mimeType,
            byteSize: input.buffer.byteLength,
            checksum,
        };
    }
    async createPresignedUpload(input) {
        if (!this.config || !this.client)
            return null;
        const now = new Date();
        const extension = extensionForAsset(input.originalName, input.mimeType, input.assetType);
        const key = [
            'users', input.userId, 'uploads', String(now.getUTCFullYear()),
            String(now.getUTCMonth() + 1).padStart(2, '0'), `${input.objectId}.${extension}`,
        ].join('/');
        const expiresIn = 15 * 60;
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            ContentType: input.mimeType,
        }), { expiresIn });
        const publicBaseUrl = this.config.publicBaseUrl?.replace(/\/+$/, '');
        const url = publicBaseUrl
            ? `${publicBaseUrl}/${key}`
            : `${this.config.endpoint}/${this.config.bucket}/${key}`;
        return {
            provider: 'cloudflare_r2',
            bucket: this.config.bucket,
            key,
            url,
            uploadUrl,
            expiresIn,
        };
    }
    async inspectObject(key) {
        if (!this.config || !this.client)
            return null;
        const object = await this.client.send(new client_s3_1.HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        }));
        return {
            byteSize: Number(object.ContentLength || 0),
            mimeType: object.ContentType || null,
        };
    }
    async deleteObject(key) {
        if (!this.config || !this.client)
            return false;
        await this.client.send(new client_s3_1.DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        }));
        return true;
    }
    thumbnailKey(userId, assetId) {
        return ['users', userId, 'thumbnails', `${assetId}.webp`].join('/');
    }
    formatStorageError(error) {
        if (!error || typeof error !== 'object') {
            return String(error);
        }
        const value = error;
        return JSON.stringify({
            name: value.name,
            code: value.Code,
            message: value.message,
            status: value.$metadata?.httpStatusCode,
            attempts: value.$metadata?.attempts,
        });
    }
}
exports.StorageService = StorageService;
exports.storageService = new StorageService();
