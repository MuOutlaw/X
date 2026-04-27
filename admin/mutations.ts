import { mutation } from "../_generated/server";
import { requireAdmin } from "../helpers";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, { role: args.role });
  },
});

export const setUserVerified = mutation({
  args: { userId: v.id("users"), isVerified: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, { isVerified: args.isVerified });
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId) {
      throw new ConvexError({ message: "لا يمكنك حذف حسابك الخاص", code: "FORBIDDEN" });
    }
    await ctx.db.delete(args.userId);
  },
});

export const updateListingStatus = mutation({
  args: {
    listingId: v.id("listings"),
    status: v.union(v.literal("active"), v.literal("sold"), v.literal("draft")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.listingId, { status: args.status });
  },
});

export const deleteListing = mutation({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.listingId);
  },
});

export const reviewReport = mutation({
  args: {
    reportId: v.id("reports"),
    status: v.union(v.literal("reviewed"), v.literal("dismissed")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.reportId, {
      status: args.status,
      reviewedAt: new Date().toISOString(),
      reviewNote: args.reviewNote,
    });
  },
});

export const reviewVerificationRequest = mutation({
  args: {
    requestId: v.id("verificationRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const req = await ctx.db.get(args.requestId);
    if (!req) throw new ConvexError({ code: "NOT_FOUND", message: "الطلب غير موجود" });

    await ctx.db.patch(args.requestId, {
      status: args.status,
      reviewedAt: new Date().toISOString(),
      notes: args.notes,
    });

    // If approved, mark user as verified
    if (args.status === "approved") {
      await ctx.db.patch(req.userId, { isVerified: true });
    } else {
      // If rejected, ensure not verified (in case of re-review)
      await ctx.db.patch(req.userId, { isVerified: false });
    }
  },
});

export const reviewReceipt = mutation({
  args: {
    receiptId: v.id("subscriptionReceipts"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.receiptId, {
      status: args.status,
      reviewedAt: new Date().toISOString(),
      notes: args.notes,
    });
  },
});
