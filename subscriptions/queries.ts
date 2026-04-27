import { query } from "../_generated/server";
import { ConvexError } from "convex/values";

/** Get the current user's subscription receipts */
export const getMyReceipts = query({
  args: {},
  handler: async (ctx) => {
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

    if (!user) return [];

    const receipts = await ctx.db
      .query("subscriptionReceipts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Enrich with image URLs
    return await Promise.all(
      receipts.map(async (receipt) => {
        const imageUrl = await ctx.storage.getUrl(receipt.receiptStorageId);
        return {
          _id: receipt._id,
          status: receipt.status,
          packageId: receipt.packageId,
          notes: receipt.notes,
          createdAt: receipt.createdAt,
          reviewedAt: receipt.reviewedAt,
          imageUrl,
        };
      }),
    );
  },
});
