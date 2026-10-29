
import "dotenv/config";
import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";

const requiredVariables = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is missing from the root .env file`);
  }
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const worker = new Worker(
  "email-notifications",
  async (job) => {
    const { documentId, event } = job.data;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    let subject;
    let text;

    if (event === "COMPLETED") {
      if (
        document.status !== "COMPLETED" ||
        !document.summaryObjectKey
      ) {
        throw new Error(
          "Document is not completed or its summary is missing"
        );
      }

      subject = "Your document summary is ready";

      text = [
        `Your document "${document.originalFilename}" has been summarized successfully.`,
        "",
        "Your summary is ready to retrieve.",
        `Document ID: ${document.id}`,
        `Summary API: http://localhost:3000/api/documents/${document.id}/summary`,
      ].join("\n");
    } else if (event === "FAILED") {
      if (document.status !== "FAILED") {
        throw new Error("Document has not reached FAILED status");
      }

      subject = "Document summarization failed";

      text = [
        `We could not summarize "${document.originalFilename}".`,
        "",
        `Document ID: ${document.id}`,
        `Reason: ${document.errorMessage || "Unknown processing error"}`,
      ].join("\n");
    } else {
      throw new Error(`Unsupported notification event: ${event}`);
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: document.email,
      subject,
      text,
    });

    console.log(
      `Email sent for document ${documentId} to ${document.email}`
    );

    return { documentId, event, sent: true };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: null,
    },
    concurrency: 3,
  }
);

worker.on("completed", (job, result) => {
  console.log("Notification job completed:", result);
});

worker.on("failed", (job, error) => {
  console.error(
    `Notification job ${job?.id} failed:`,
    error.message
  );
});

worker.on("error", (error) => {
  console.error("Notification worker error:", error.message);
});

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  await transporter.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Notification service is listening for email jobs...");
