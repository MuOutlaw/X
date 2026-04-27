"use node";

import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api.js";

const AUTHENTICA_BASE = "https://api.authentica.sa";

function normalizePhone(phone: string): string {
  const clean = phone.replace(/\s/g, "");
  if (/^05\d{8}$/.test(clean)) return "+966" + clean.slice(1);
  if (/^\+9665\d{8}$/.test(clean)) return clean;
  if (/^9665\d{8}$/.test(clean)) return "+" + clean;
  // Handle "5xxxxxxxx" (9 digits no prefix) — from frontend
  if (/^5\d{8}$/.test(clean)) return "+966" + clean;
  return clean;
}

/** Send OTP via Authentica — they generate & send the code */
export const sendOTP = action({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const apiKey = process.env.apikay;
    if (!apiKey) {
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "خدمة الرسائل غير مُعيَّنة" });
    }

    const normalized = normalizePhone(args.phone);
    if (!/^\+9665\d{8}$/.test(normalized)) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "رقم الجوال غير صالح" });
    }

    const res = await fetch(`${AUTHENTICA_BASE}/api/v2/send-otp`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Authorization": apiKey,
      },
      body: JSON.stringify({
        method: "sms",
        phone: normalized,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Authentica send-otp error:", res.status, errText);
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "فشل إرسال رمز التحقق، تأكد من الرقم وحاول مرة أخرى" });
    }

    return { success: true };
  },
});

/** Verify OTP via Authentica — they verify the code */
export const verifyOTP = action({
  args: { phone: v.string(), code: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const apiKey = process.env.apikay;
    if (!apiKey) {
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "خدمة الرسائل غير مُعيَّنة" });
    }

    const normalized = normalizePhone(args.phone);

    const res = await fetch(`${AUTHENTICA_BASE}/api/v2/verify-otp`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Authorization": apiKey,
      },
      body: JSON.stringify({
        phone: normalized,
        otp: args.code,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      console.error("Authentica verify-otp error:", res.status, body);
      // Provide user-friendly messages
      const msg = res.status === 400
        ? "رمز التحقق غير صحيح أو انتهت صلاحيته"
        : "حدث خطأ أثناء التحقق، حاول مرة أخرى";
      throw new ConvexError({ code: "BAD_REQUEST", message: msg });
    }

    // Mark user's phone as verified in our DB
    await ctx.runMutation(internal.otp.mutations.markPhoneVerified, {
      phone: normalized,
    });

    return { success: true };
  },
});
