import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { Role } from "../constants.js";

export type AuthTokenPayload = {
  sub: string;
  phone: string;
  role: Role;
};

export function signAccessToken(user: { id: string; phone: string; role: string }) {
  const payload: AuthTokenPayload = {
    sub: user.id,
    phone: user.phone,
    role: user.role as Role
  };

  return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
}

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashSecret(value: string) {
  return bcrypt.hash(value, 10);
}

export async function compareSecret(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

export function comparePlainSecret(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
