import "dotenv/config";
import express from "express";
import pg from "pg";
import Redis from "ioredis";
import multer from "multer";
import { documentQueue } from "./queue.js";
import { randomUUID } from "node:crypto";
import { uploadOriginalFile, downloadSummary } from "./storage.js";
import { prisma } from "./prisma.js";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

const { Pool } = pg;

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Only PDF, DOCX, and TXT files are allowed"));
    }
  },
});

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

app.get("/api/test-db", async (req, res) => {
  try {
    const documentCount = await prisma.document.count();

    res.json({
      success: true,
      message: "Prisma connected to PostgreSQL",
      documentCount,
    });
  } catch (error) {
    console.error("Prisma database test failed:", error);

    res.status(500).json({
      success: false,
      message: "Prisma database query failed",
    });
  }
});



app.post("/api/documents", upload.array("files", 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      message: "Please upload at least one file",
    });
  }

  const email = req.body.email;

  if (!email) {
    return res.status(400).json({
      message: "Email is required",
    });
  }

  try {
    const batchId = randomUUID();
    const documents = [];

    for (const file of req.files) {
      const objectKey = `${randomUUID()}-${file.originalname}`;

      await uploadOriginalFile(file, objectKey);

      const document = await prisma.document.create({
        data: {
          batchId,
          originalFilename: file.originalname,
          originalObjectKey: objectKey,
          email,
          status: "UPLOADED",
        },
      });

      await documentQueue.add(
  "summarize-document",
  {
    documentId: document.id,
  },
  {
    jobId: document.id,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  }
);

      documents.push({
        id: document.id,
        filename: document.originalFilename,
        status: document.status,
      });
    }

    res.status(201).json({
      message: "Files uploaded and metadata saved successfully",
      batchId,
      documents,
    });
  } catch (error) {
    console.error("Document upload failed:", error);

    res.status(500).json({
      message: "Failed to upload and register documents",
    });
  }
});


app.get("/api/documents/:id", async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!document) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    return res.json({
      id: document.id,
      originalFilename: document.originalFilename,
      status: document.status,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      summaryAvailable: Boolean(document.summaryObjectKey),
    });
  } catch (error) {
    console.error("Document status error:", error.message);

    return res.status(500).json({
      error: "Failed to retrieve document status",
    });
  }
});

app.get("/api/documents/:id/summary", async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!document) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    if (document.status !== "COMPLETED" || !document.summaryObjectKey) {
      return res.status(409).json({
        error: "Summary is not available yet",
        status: document.status,
      });
    }

    const summary = await downloadSummary(
      document.summaryObjectKey
    );

    return res
      .type("text/plain")
      .send(summary);
  } catch (error) {
    console.error("Summary retrieval error:", error.message);

    return res.status(500).json({
      error: "Failed to retrieve summary",
    });
  }
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