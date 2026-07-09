import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';
import path from 'path';

export interface StoredRemoteAsset {
  provider: string;
  bucket: string;
  key: string;
  url: string;
  mimeType: string | null;
  byteSize: number;
  checksum: string;
}

interface StoreRemoteAssetInput {
  sourceUrl: string;
  userId: string;
  predictionId: string;
  assetType: string;
}

interface StoreBufferInput {
  buffer: Buffer;
  userId: string;
  mimeType: string;
  assetType: string;
  namespace: 'uploads' | 'thumbnails' | 'processed';
  objectId?: string;
  originalName?: string;
  metadata?: Record<string, string>;
}

interface R2Config {
  endpoint: string;
  bucket: string;
  publicBaseUrl?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PresignedUpload {
  provider: string;
  bucket: string;
  key: string;
  url: string;
  uploadUrl: string;
  expiresIn: number;
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function parseR2Config(): R2Config | null {
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

function extensionForAsset(sourceUrl: string, mimeType: string | null, assetType: string): string {
  try {
    const ext = path.extname(new URL(sourceUrl).pathname).replace('.', '').toLowerCase();
    if (ext && ext.length <= 8) return ext;
  } catch {
    // Ignore URL parse failures and infer below.
  }

  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return 'jpg';
  if (mimeType?.includes('webp')) return 'webp';
  if (mimeType?.includes('mpeg')) return 'mp3';
  if (mimeType?.includes('wav')) return 'wav';
  if (mimeType?.includes('mp4')) return 'mp4';
  if (mimeType?.includes('json')) return 'json';
  if (mimeType?.includes('text')) return 'txt';

  return assetType === 'image' ? 'png' : assetType === 'document' ? 'json' : 'mp4';
}

export class StorageService {
  private readonly config = parseR2Config();
  private readonly client = this.config
    ? new S3Client({
        region: 'auto',
        endpoint: this.config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      })
    : null;

  public isConfigured(): boolean {
    return Boolean(this.config && this.client);
  }

  public async storeRemoteAsset(input: StoreRemoteAssetInput): Promise<StoredRemoteAsset | null> {
    if (!this.config || !this.client) {
      return null;
    }

    const response = await fetch(input.sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed downloading generated asset: ${response.status} ${response.statusText}`);
    }

    const mimeType = response.headers.get('content-type');
    const buffer = Buffer.from(await response.arrayBuffer());
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const extension = extensionForAsset(input.sourceUrl, mimeType, input.assetType);
    const key = [
      'users',
      input.userId,
      'predictions',
      input.predictionId,
      `${randomUUID()}.${extension}`,
    ].join('/');

    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType || undefined,
        Metadata: {
          source: 'marsfield-generation',
          predictionId: input.predictionId,
        },
      }));
    } catch (error) {
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

  public async storeBuffer(input: StoreBufferInput): Promise<StoredRemoteAsset | null> {
    if (!this.config || !this.client) return null;

    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const extension = extensionForAsset(input.originalName || '', input.mimeType, input.assetType);
    const now = new Date();
    const key = input.namespace === 'uploads'
      ? ['users', input.userId, 'uploads', String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${input.objectId || randomUUID()}.${extension}`].join('/')
      : input.namespace === 'processed'
        ? ['users', input.userId, 'processed', String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${input.objectId || randomUUID()}.${extension}`].join('/')
        : ['users', input.userId, 'thumbnails', `${input.objectId || randomUUID()}.${extension}`].join('/');

    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
        Metadata: input.metadata,
      }));
    } catch (error) {
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

  public async createPresignedUpload(input: {
    userId: string;
    objectId: string;
    mimeType: string;
    assetType: string;
    originalName: string;
  }): Promise<PresignedUpload | null> {
    if (!this.config || !this.client) return null;
    const now = new Date();
    const extension = extensionForAsset(input.originalName, input.mimeType, input.assetType);
    const key = [
      'users', input.userId, 'uploads', String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'), `${input.objectId}.${extension}`,
    ].join('/');
    const expiresIn = 15 * 60;
    const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({
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

  public async inspectObject(key: string): Promise<{ byteSize: number; mimeType: string | null } | null> {
    if (!this.config || !this.client) return null;
    const object = await this.client.send(new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
    return {
      byteSize: Number(object.ContentLength || 0),
      mimeType: object.ContentType || null,
    };
  }

  public async deleteObject(key: string): Promise<boolean> {
    if (!this.config || !this.client) return false;
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
    return true;
  }

  public thumbnailKey(userId: string, assetId: string): string {
    return ['users', userId, 'thumbnails', `${assetId}.webp`].join('/');
  }

  private formatStorageError(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const value = error as {
      name?: string;
      Code?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number; attempts?: number };
    };

    return JSON.stringify({
      name: value.name,
      code: value.Code,
      message: value.message,
      status: value.$metadata?.httpStatusCode,
      attempts: value.$metadata?.attempts,
    });
  }
}

export const storageService = new StorageService();
