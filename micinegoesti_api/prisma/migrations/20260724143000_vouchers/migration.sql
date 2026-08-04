-- Local SQLite mirror for production migration db/14_vouchers.sql.

ALTER TABLE "orders" ADD COLUMN "voucherId" TEXT;
ALTER TABLE "orders" ADD COLUMN "voucherCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "discountAmount" DECIMAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "game_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "userId" TEXT,
    "playerName" TEXT,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "voucher_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL NOT NULL,
    "maximumDiscount" DECIMAL,
    "minimumSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "validityDays" INTEGER,
    "codePrefix" TEXT NOT NULL DEFAULT 'MICI',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "voucher_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "voucher_rules_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceType" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT,
    "gameScoreId" TEXT,
    "sourceScore" INTEGER,
    "previousRecordScore" INTEGER,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL NOT NULL,
    "maximumDiscount" DECIMAL,
    "minimumSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "revokedByUserId" TEXT,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vouchers_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "voucher_rules" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vouchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vouchers_gameScoreId_fkey" FOREIGN KEY ("gameScoreId") REFERENCES "game_scores" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vouchers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vouchers_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "vouchers_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "voucher_redemptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT,
    "orderId" INTEGER NOT NULL,
    "userId" TEXT,
    "voucherCode" TEXT NOT NULL,
    "subtotal" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL,
    "deliveryCost" DECIMAL NOT NULL,
    "finalTotal" DECIMAL NOT NULL,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voucher_redemptions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "voucher_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "voucher_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "orders_voucherId_idx" ON "orders"("voucherId");
CREATE UNIQUE INDEX IF NOT EXISTS "game_scores_sessionId_key" ON "game_scores"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "game_scores_userId_key" ON "game_scores"("userId");
CREATE INDEX IF NOT EXISTS "game_scores_bestScore_idx" ON "game_scores"("bestScore");
CREATE INDEX "voucher_rules_triggerType_isActive_idx" ON "voucher_rules"("triggerType", "isActive");
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");
CREATE INDEX "vouchers_sourceType_idx" ON "vouchers"("sourceType");
CREATE INDEX "vouchers_userId_idx" ON "vouchers"("userId");
CREATE INDEX "vouchers_sessionKey_idx" ON "vouchers"("sessionKey");
CREATE UNIQUE INDEX "vouchers_ruleId_gameScoreId_sourceScore_key" ON "vouchers"("ruleId", "gameScoreId", "sourceScore");
CREATE UNIQUE INDEX "voucher_redemptions_orderId_key" ON "voucher_redemptions"("orderId");
CREATE INDEX "voucher_redemptions_voucherId_redeemedAt_idx" ON "voucher_redemptions"("voucherId", "redeemedAt");
