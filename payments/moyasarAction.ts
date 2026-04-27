"use node";

import { action, internalAction } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api.js";

const MOYASAR_BASE = "https://api.moyasar.com/v1";

function getApiKey(): string {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (!key) throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "مفتاح Moyasar غير مُعيَّن" });
  return key;
}

/** Create a Moyasar payment intent and return the hosted payment URL */
export const createPayment = action({
  args: {
    amount: v.number(),        // in SAR (will be converted to halalas ×100)
    description: v.string(),
    metadata: v.object({
      type: v.union(v.literal("subscription"), v.literal("boost"), v.literal("commission")),
      packageId: v.optional(v.string()),
      listingId: v.optional(v.string()),
      userId: v.string(),
    }),
    callbackUrl: v.string(),
  },
  handler: async (_ctx, args): Promise<{ paymentId: string; paymentUrl: string }> => {
    const apiKey = getApiKey();
    const appUrl = process.env.VITE_APP_URL ?? "https://alsafat.onhercules.app";

    const body = {
      amount: Math.round(args.amount * 100), // convert to halalas
      currency: "SAR",
      description: args.description,
      callback_url: args.callbackUrl || `${appUrl}/payment/callback`,
      metadata: args.metadata,
      source: { type: "creditcard" },
    };

    const res = await fetch(`${MOYASAR_BASE}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof err.message === "string" ? err.message : "فشل إنشاء الدفع";
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: msg });
    }

    const data = await res.json() as { id: string; source?: { transaction_url?: string } };
    const paymentUrl = data.source?.transaction_url ?? `${appUrl}/payment/status?id=${data.id}`;

    return { paymentId: data.id, paymentUrl };
  },
});

/** Verify a payment by ID and update the DB accordingly */
export const verifyPayment = action({
  args: { paymentId: v.string() },
  handler: async (ctx, args): Promise<{ status: string; amount: number; metadata: Record<string, string> }> => {
    const apiKey = getApiKey();

    const res = await fetch(`${MOYASAR_BASE}/payments/${args.paymentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
    });

    if (!res.ok) {
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "تعذر التحقق من الدفع" });
    }

    const payment = await res.json() as {
      id: string;
      status: string;
      amount: number;
      currency: string;
      metadata?: Record<string, string>;
    };

    const metadata = payment.metadata ?? {};
    const amountSar = payment.amount / 100;

    // If paid — activate in DB
    if (payment.status === "paid") {
      await ctx.runAction(internal.payments.moyasarAction.activateAfterPayment, {
        paymentId: args.paymentId,
        metadata,
        amountSar,
      });
    }

    return { status: payment.status, amount: amountSar, metadata };
  },
});

/** Internal: activate subscription / boost / commission after successful payment */
export const activateAfterPayment = internalAction({
  args: {
    paymentId: v.string(),
    metadata: v.record(v.string(), v.string()),
    amountSar: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const { type, packageId, listingId, userId } = args.metadata;

    if (type === "subscription" && packageId) {
      await ctx.runMutation(internal.payments.mutations.activateSubscription, {
        userId,
        packageId: packageId as "weekly" | "biweekly" | "monthly",
        paymentId: args.paymentId,
        amountSar: args.amountSar,
      });
    } else if (type === "boost" && packageId && listingId) {
      await ctx.runMutation(internal.payments.mutations.activateBoostByPayment, {
        userId,
        packageId,
        listingId,
        paymentId: args.paymentId,
      });
    } else if (type === "commission" && listingId) {
      await ctx.runMutation(internal.payments.mutations.markCommissionPaid, {
        listingId,
        paymentId: args.paymentId,
        amountSar: args.amountSar,
      });
    }
  },
});
