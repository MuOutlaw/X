import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { checkReportRateLimit } from "../spam_protection.ts";

const REASON_VALIDATOR = v.union(
  v.literal("spam"),
  v.literal("fraud"),
  v.literal("inappropriate"),
  v.literal("wrong_category"),
  v.literal("fake_price"),
  v.literal("other")
);

// Submit a report against a listing
export const reportListing = mutation({
  args: {
    listingId: v.id("listings"),
    reason: REASON_VALIDATOR,
    details: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "الإعلان غير موجود" });

    if (listing.userId === me._id) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "لا يمكنك الإبلاغ عن إعلانك الخاص" });
    }

    // Rate limit
    await checkReportRateLimit(ctx, me._id);

    // Prevent duplicate reports from same user on same listing
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_target_listing", (q) => q.eq("targetListingId", args.listingId))
      .filter((q) => q.eq(q.field("reporterId"), me._id))
      .first();
    if (existing) throw new ConvexError({ code: "CONFLICT", message: "لقد أبلغت عن هذا الإعلان مسبقاً" });

    await ctx.db.insert("reports", {
      reporterId: me._id,
      targetType: "listing",
      targetListingId: args.listingId,
      reason: args.reason,
      details: args.details,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  },
});

// Submit a report against a user
export const reportUser = mutation({
  args: {
    userId: v.id("users"),
    reason: REASON_VALIDATOR,
    details: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const me = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!me) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    if (args.userId === me._id) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "لا يمكنك الإبلاغ عن نفسك" });
    }

    // Rate limit
    await checkReportRateLimit(ctx, me._id);

    // Prevent duplicate user reports
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_target_user", (q) => q.eq("targetUserId", args.userId))
      .filter((q) => q.eq(q.field("reporterId"), me._id))
      .first();
    if (existing) throw new ConvexError({ code: "CONFLICT", message: "لقد أبلغت عن هذا المستخدم مسبقاً" });

    await ctx.db.insert("reports", {
      reporterId: me._id,
      targetType: "user",
      targetUserId: args.userId,
      reason: args.reason,
      details: args.details,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  },
});
