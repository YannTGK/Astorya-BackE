// utils/presign.js
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
dotenv.config();

const s3 = new S3Client({
  region:   'eu-central-1',
  endpoint: 'https://s3.eu-central-1.wasabisys.com',
  credentials: {
    accessKeyId:     process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
  },
});

export async function presign(key, ttlSeconds = 3600) {
  const cmd = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key:    key,
  });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeconds });
}