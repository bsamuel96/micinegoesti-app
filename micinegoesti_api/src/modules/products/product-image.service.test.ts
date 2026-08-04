import { describe, expect, it } from "vitest";
import { validateProductImage } from "./product-image.service.js";

const image = { size: 10, mimetype: "image/jpeg", originalname: "produs.jpg", buffer: Buffer.from("image") };

describe("product image validation", () => {
  it("accepts supported images", () => expect(() => validateProductImage(image)).not.toThrow());
  it("rejects SVG", () => expect(() => validateProductImage({ ...image, mimetype: "image/svg+xml", originalname: "x.svg" })).toThrow("Formatul"));
  it("rejects oversized images", () => expect(() => validateProductImage({ ...image, size: 11 * 1024 * 1024 })).toThrow("10 MB"));
  it("rejects empty buffers", () => expect(() => validateProductImage({ ...image, buffer: Buffer.alloc(0) })).toThrow("goală"));
});

