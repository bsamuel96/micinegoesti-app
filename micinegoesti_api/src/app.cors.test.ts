import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("production CORS", () => {
  it("allows the public restaurant domain to call the API", async () => {
    const response = await request(createApp())
      .options("/api/orders")
      .set("Origin", "https://micinegoesti.ro")
      .set("Access-Control-Request-Method", "GET");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://micinegoesti.ro");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS access to an unknown origin", async () => {
    const response = await request(createApp())
      .options("/api/orders")
      .set("Origin", "https://untrusted.example")
      .set("Access-Control-Request-Method", "GET");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
