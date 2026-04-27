import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";

/** Generate an upload URL for the receipt image */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "يجب تسجيل الدخول",
        code: "UNAUTHENTICATED",
      });
    }
    return await ctx.storage.generateUploadUrl();
  },
});

  /** Submit a bank-transfer receipt for manual review */
export const submitReceipt = mutation({
  args: {
    receiptStorageId: v.id("_storage"),
    packageId: v.union(v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "يجب تسجيل الدخول",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) {
      throw new ConvexError({
        message: "المستخدم غير موجود",
        code: "NOT_FOUND",
      });
    }

    // Check for existing pending receipt
    const existing = await ctx.db
      .query("subscriptionReceipts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const hasPending = existing.some((r) => r.status === "pending");
    if (hasPending) {
      throw new ConvexError({
        message: "لديك إيصال قيد المراجعة بالفعل",
        code: "CONFLICT",
      });
    }

    const receiptId = await ctx.db.insert("subscriptionReceipts", {
      userId: user._id,
      receiptStorageId: args.receiptStorageId,
      packageId: args.packageId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return receiptId;
  },
});
