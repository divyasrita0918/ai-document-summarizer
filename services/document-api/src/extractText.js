
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import path from "node:path";

export async function extractText(buffer, filename) {
  const extension = path.extname(filename).toLowerCase();

  let text;

  if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (extension === ".txt") {
    text = buffer.toString("utf8");
  } else {
    throw new Error(`Unsupported file type: ${extension}`);
  }

  if (!text || !text.trim()) {
    throw new Error(
      `No readable text found in ${filename}. The file may be empty, scanned, or image-only.`
    );
  }

  return text.trim();
}
