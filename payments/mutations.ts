import { internalMutation, mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api.js";
import type { Id } from "../_generated/dataModel.d.ts";

const PACKAGE_DURATIONS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Save a pending Moyasar payment record before redirecting */
export const createPendingPayment = mutation({
  args: {
    paymentId: v.string(),
    type: v.union(v.literal("subscription"), v.literal("boost"), v.literal("commission")),
    amountSar: v.number(),
    packageId: v.optional(v.string()),
    listingId: v.optional(v.id("listings")),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    await ctx.db.insert("payments", {
      userId: user._id,
      paymentId: args.paymentId,
      type: args.type,
      amountSar: args.amountSar,
      packageId: args.packageId,
      listingId: args.listingId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  },
});

/** Called after verifyPayment confirms payment — activate subscription */
export const activateSubscription = internalMutation({
  args: {
    userId: v.string(),
    packageId: v.union(v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
    paymentId: v.string(),
    amountSar: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Find existing pending payment and mark paid
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { status: "paid", paidAt: new Date().toISOString() });

    // Find the user — userId from metadata is the _id string
    const userId = args.userId as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return;

    const days = PACKAGE_DURATIONS[args.packageId] ?? 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Upsert subscription
    const existingSub = await ctx.db
      .query("subscriptionReceipts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existingSub) {
      await ctx.db.patch(existingSub._id, {
        status: "approved",
        packageId: args.packageId,
        reviewedAt: now.toISOString(),
        notes: `مدفوع عبر Moyasar — ${args.paymentId}`,
      });
    } else {
      // Insert a virtual receipt with a placeholder storageId — not ideal but keeps schema compat
      // Instead we mark user as subscriber via a subscription field
    }

    // Mark user as premium subscriber
    await ctx.db.patch(userId, {
      subscriptionPackage: args.packageId,
      subscriptionExpiresAt: expiresAt.toISOString(),
    });
  },
});

/** Activate a boost after Moyasar payment */
export const activateBoostByPayment = internalMutation({
  args: {
    userId: v.string(),
    packageId: v.string(),
    listingId: v.string(),
    paymentId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { status: "paid", paidAt: new Date().toISOString() });

    const listingId = args.listingId as Id<"listings">;
    const userId = args.userId as Id<"users">;

    await ctx.runMutation(internal.boosts.mutations.activateBoostInternal, {
      listingId,
      packageId: args.packageId,
      paymentStatus: "paid",
      checkoutSessionId: args.paymentId,
      userId,
    });
  },
});

/** Mark a commission as paid after Moyasar payment */
export const markCommissionPaid = internalMutation({
  args: {
    listingId: v.string(),
    paymentId: v.string(),
    amountSar: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { status: "paid", paidAt: new Date().toISOString() });

    const listingId = args.listingId as Id<"listings">;
    await ctx.db.patch(listingId, { commissionPaid: true });
  },
});
