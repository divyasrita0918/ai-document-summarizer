
import "dotenv/config";
import { generateSummary } from "./summarizer.js";

const sampleText = `
Co-existence and the four orders in nature.

Nature consists of four orders: material order, plant order,
animal order, and human order.

The material order includes soil, water, air, and minerals.
The plant order includes trees and other vegetation.
The animal order includes animals and birds.
The human order includes human beings.

All four orders are interconnected and contribute to
the balance and continuity of nature.
`;

try {
  const summary = await generateSummary(sampleText);

  console.log("\nGenerated summary:\n");
  console.log(summary);
} catch (error) {
  console.error("Summary generation failed:", error.message);
  process.exitCode = 1;
}
