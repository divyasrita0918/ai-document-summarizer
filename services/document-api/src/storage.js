import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const minio = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function uploadOriginalFile(file, objectKey) {
  await minio.send(
    new PutObjectCommand({
      Bucket: process.env.MINIO_ORIGINALS_BUCKET,
      Key: objectKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );
}

export async function downloadOriginalFile(objectKey) {
  const response = await minio.send(
    new GetObjectCommand({
      Bucket: process.env.MINIO_ORIGINALS_BUCKET,
      Key: objectKey,
    })
  );

  return Buffer.from(await response.Body.transformToByteArray());
}