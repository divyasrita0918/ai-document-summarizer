
import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "./prisma.js";
import { downloadOriginalFile, uploadSummary } from "./storage.js";
import { extractText } from "./extractText.js";
import { generateSummary } from "./summarizer.js";
import { notificationQueue } from "./notificationQueue.js";

const worker = new Worker(
  "document-summarization",
  async (job) => {
    const { documentId } = job.data;
    let document;

    console.log(`Processing job: ${job.id}`);
    console.log(`Document ID: ${documentId}`);

    try {
      document = await prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "PROCESSING",
          errorMessage: null,
        },
      });

      const fileBuffer = await downloadOriginalFile(
        document.originalObjectKey
      );

      console.log(`Downloaded ${fileBuffer.length} bytes from MinIO`);

      const extractedText = await extractText(
        fileBuffer,
        document.originalFilename
      );

      console.log(`Extracted ${extractedText.length} characters`);

      const summary = await generateSummary(extractedText);

      console.log(`Generated summary with ${summary.length} characters`);

      const summaryObjectKey = `${documentId}/summary.txt`;

      await uploadSummary(summary, summaryObjectKey);

      await prisma.document.update({
        where: { id: documentId },
        data: {
          summaryObjectKey,
          status: "COMPLETED",
          errorMessage: null,
        },
      });

      await notificationQueue.add(
        "document-completed",
        {
          documentId,
          event: "COMPLETED",
        },
        {
          jobId: `${documentId}-completed`,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      console.log(`Document completed: ${documentId}`);

      return {
        documentId,
        status: "COMPLETED",
        summaryObjectKey,
        summaryCharacters: summary.length,
      };
    } catch (error) {
      const currentAttempt = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? 1;
      const finalAttempt = currentAttempt >= maxAttempts;

      console.error(
        `Attempt ${currentAttempt}/${maxAttempts} failed:`,
        error.message
      );

      if (document) {
        try {
          await prisma.document.update({
            where: { id: documentId },
            data: {
              status: finalAttempt ? "FAILED" : "PROCESSING",
              errorMessage: error.message,
            },
          });

          if (finalAttempt) {
            await notificationQueue.add(
              "document-failed",
              {
                documentId,
                event: "FAILED",
              },
              {
                jobId: `${documentId}-failed`,
                attempts: 3,
                backoff: {
                  type: "exponential",
                  delay: 2000,
                },
                removeOnComplete: true,
                removeOnFail: false,
              }
            );

            console.log(
              `Failure notification queued: ${documentId}`
            );
          }
        } catch (dbError) {
          console.error(
            "Failed to update status or queue notification:",
            dbError.message
          );
        }
      }

      throw error;
    }
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
  await notificationQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("AI worker is listening for document jobs...");
