
import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "./prisma.js";
import { downloadOriginalFile } from "./storage.js";
import { extractText } from "./extractText.js";

const worker = new Worker(
  "document-summarization",
  async (job) => {
    const { documentId } = job.data;

    console.log(`Processing job: ${job.id}`);
    console.log(`Document ID: ${documentId}`);

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const fileBuffer = await downloadOriginalFile(
      document.originalObjectKey
    );
    const extractedText = await extractText(
  fileBuffer,
  document.originalFilename
);

console.log(`Extracted ${extractedText.length} characters`);
console.log("Text preview:", extractedText.slice(0, 200));

    console.log(`Filename: ${document.originalFilename}`);
    console.log(`Downloaded ${fileBuffer.length} bytes from MinIO`);

    return {
      documentId,
      downloadedBytes: fileBuffer.length,
    };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: null,
    },
    concurrency: 1,
  }
);

worker.on("completed", (job, result) => {
  console.log("Job completed:", result);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Worker error:", error.message);
});

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("AI worker is listening for document jobs...");
