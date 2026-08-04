import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { Role } from "../../constants.js";
import { errorHandler } from "../../lib/http.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { vouchersRouter } from "./vouchers.routes.js";

function appForRole(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: AuthenticatedRequest, _res, next) => {
    req.user = {
      id: "user-1",
      phone: "+40740000000",
      role,
      isActive: true
    };
    next();
  });
  app.use("/api", vouchersRouter);
  app.use(errorHandler);
  return app;
}

describe("voucher admin route authorization", () => {
  it("rejects non-admin staff before executing admin voucher handlers", async () => {
    const response = await request(appForRole(Role.STORE_MANAGER)).get("/api/admin/vouchers");
    expect(response.status).toBe(403);
  });

  it("rejects customers before executing admin voucher handlers", async () => {
    const response = await request(appForRole(Role.CUSTOMER)).post("/api/admin/vouchers/issue-current-record");
    expect(response.status).toBe(403);
  });
});
