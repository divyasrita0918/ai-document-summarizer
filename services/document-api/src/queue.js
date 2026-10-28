import "dotenv/config";
import { Queue } from "bullmq";

export const documentQueue = new Queue("document-summarization", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
  },
});