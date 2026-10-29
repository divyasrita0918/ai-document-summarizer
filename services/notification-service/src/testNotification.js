
import "dotenv/config";
import { Queue } from "bullmq";

const queue = new Queue("email-notifications", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
  },
});

try {
  const documentId = process.argv[2];

  if (!documentId) {
    throw new Error(
      "Pass a completed document ID as the first argument"
    );
  }

  const job = await queue.add(
    "document-completed",
    {
      documentId,
      event: "COMPLETED",
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  console.log(`Notification queued: ${job.id}`);
} finally {
  await queue.close();
}
