
import "dotenv/config";
import { Queue } from "bullmq";

export const notificationQueue = new Queue("email-notifications", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
  },
});
