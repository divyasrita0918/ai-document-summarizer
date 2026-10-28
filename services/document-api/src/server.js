import "dotenv/config";
import express from "express";
import pg from "pg";
import Redis from "ioredis";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

const postgres = new Pool({
  connectionString: process.env.DATABASE_URL
});

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT)
});

const minio = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY
  },
  forcePathStyle: true
});

app.use(express.json());

app.get("/health", async (req, res) => {
  const checks = {
    api: "ok",
    postgres: "error",
    redis: "error",
    minio: "error"
  };

  try {
    await postgres.query("SELECT 1");
    checks.postgres = "ok";
  } catch (error) {
    console.error("PostgreSQL health check failed:", error.message);
  }

  try {
    await redis.ping();
    checks.redis = "ok";
  } catch (error) {
    console.error("Redis health check failed:", error.message);
  }

  try {
    await minio.send(new ListBucketsCommand({}));
    checks.minio = "ok";
  } catch (error) {
    console.error("MinIO health check failed:", error.message);
  }

  const healthy = Object.values(checks).every(
    (status) => status === "ok"
  );

  res.status(healthy ? 200 : 503).json(checks);
});

app.listen(PORT, () => {
  console.log(`Document API running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await Promise.allSettled([
    postgres.end(),
    redis.quit()
  ]);
  process.exit(0);
});