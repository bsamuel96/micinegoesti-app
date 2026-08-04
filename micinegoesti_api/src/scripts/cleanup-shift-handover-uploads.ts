import dotenv from "dotenv";
import { cleanupExpiredShiftHandoverUploads } from "../modules/shift-handover/shift-handover.uploads.js";

dotenv.config();

try {
  const result = await cleanupExpiredShiftHandoverUploads();
  console.log(`[shift-handover cleanup] checked=${result.checked} deleted=${result.deleted} missing=${result.missing} failed=${result.failed}`);
  if (result.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error("[shift-handover cleanup] failed", error);
  process.exitCode = 1;
}
