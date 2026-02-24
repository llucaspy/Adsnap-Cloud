-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agency" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL DEFAULT '',
    "pi" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "segmentation" TEXT NOT NULL DEFAULT 'PRIVADO',
    "flightStart" DATETIME,
    "flightEnd" DATETIME,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isScheduled" BOOLEAN NOT NULL DEFAULT false,
    "scheduledTimes" TEXT NOT NULL DEFAULT '[]',
    "lastCaptureAt" DATETIME,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Capture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "screenshotPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "auditNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Capture_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "nexusMaxRetries" INTEGER NOT NULL DEFAULT 3,
    "nexusTimeout" INTEGER NOT NULL DEFAULT 60000,
    "nexusDelay" INTEGER NOT NULL DEFAULT 3000,
    "autoCleanupDays" INTEGER NOT NULL DEFAULT 30,
    "webhookUrl" TEXT,
    "performanceMode" BOOLEAN NOT NULL DEFAULT false,
    "feedPollingRate" INTEGER NOT NULL DEFAULT 5000,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "bannerFormats" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
