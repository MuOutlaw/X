import { mutation, internalMutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getPackageById } from "./packages.ts";
import { internal } from "../_generated/api.js";
import type { Id } from "../_generated/dataModel.d.ts";

// Public mutation — verifies auth + ownership, then delegates to internal
export const activateBoost = mutation({
  args: {
    listingId: v.id("listings"),
    packageId: v.string(),
    paymentStatus: v.union(v.literal("paid"), v.literal("free")),
    checkoutSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"boosts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "الإعلان غير موجود" });
    if (listing.userId !== user._id) throw new ConvexError({ code: "FORBIDDEN", message: "ليس إعلانك" });

    const pkg = getPackageById(args.packageId);
    if (!pkg) throw new ConvexError({ code: "BAD_REQUEST", message: "الباقة غير موجودة" });

    // Delegate to internal mutation
    const boostId = await ctx.runMutation(internal.boosts.mutations.activateBoostInternal, {
      listingId: args.listingId,
      packageId: args.packageId,
      paymentStatus: args.paymentStatus,
      checkoutSessionId: args.checkoutSessionId,
      userId: user._id,
    });
    return boostId;
  },
});

// Internal mutation — trusted, no auth checks needed
export const activateBoostInternal = internalMutation({
  args: {
    listingId: v.id("listings"),
    packageId: v.string(),
    paymentStatus: v.union(v.literal("paid"), v.literal("free")),
    checkoutSessionId: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "الإعلان غير موجود" });

    const pkg = getPackageById(args.packageId);
    if (!pkg) throw new ConvexError({ code: "BAD_REQUEST", message: "الباقة غير موجودة" });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

    // Deactivate any existing same-package boost for this listing
    const existing = await ctx.db
      .query("boosts")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();
    for (const b of existing) {
      if (b.packageId === args.packageId && b.isActive) {
        await ctx.db.patch(b._id, { isActive: false });
      }
    }

    const boostId = await ctx.db.insert("boosts", {
      listingId: args.listingId,
      userId: args.userId,
      packageId: args.packageId,
      startsAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isActive: true,
      paymentStatus: args.paymentStatus,
      checkoutSessionId: args.checkoutSessionId,
    });

    // Mark listing as featured if package is featured/bundle
    if (args.packageId.startsWith("featured") || args.packageId.startsWith("bundle")) {
      await ctx.db.patch(args.listingId, { isFeatured: true });
    }

    return boostId;
  },
});

// Create a pending boost (before checkout — confirmed via webhook later)
export const createPendingBoost = mutation({
  args: {
    listingId: v.id("listings"),
    packageId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "يجب تسجيل الدخول" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "الإعلان غير موجود" });
    if (listing.userId !== user._id) throw new ConvexError({ code: "FORBIDDEN", message: "ليس إعلانك" });

    const pkg = getPackageById(args.packageId);
    if (!pkg) throw new ConvexError({ code: "BAD_REQUEST", message: "الباقة غير موجودة" });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

    return await ctx.db.insert("boosts", {
      listingId: args.listingId,
      userId: user._id,
      packageId: args.packageId,
      startsAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isActive: false,
      paymentStatus: "pending",
    });
  },
});

// Expire old boosts — internal only, should be called by cron or scheduler
export const expireOldBoosts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const activeBoosts = await ctx.db
      .query("boosts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    for (const boost of activeBoosts) {
      if (boost.expiresAt <= now) {
        await ctx.db.patch(boost._id, { isActive: false });

        // Check if listing has any remaining active boosts
        const remaining = await ctx.db
          .query("boosts")
          .withIndex("by_listing", (q) => q.eq("listingId", boost.listingId))
          .collect();
        const stillBoosted = remaining.some(
          (b) => b._id !== boost._id && b.isActive && b.expiresAt > now &&
            (b.packageId.startsWith("featured") || b.packageId.startsWith("bundle"))
        );
        if (!stillBoosted) {
          await ctx.db.patch(boost.listingId, { isFeatured: false });
        }
      }
    }
  },
});
