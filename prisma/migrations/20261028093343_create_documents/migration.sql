-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "originalObjectKey" TEXT NOT NULL,
    "summaryObjectKey" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_batchId_idx" ON "documents"("batchId");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");
