import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api.js";

// Toggle save/unsave a listing
export const toggleSave = mutation({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args): Promise<{ saved: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "يجب تسجيل الدخول أولاً", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "المستخدم غير موجود", code: "NOT_FOUND" });

    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_user_and_listing", (q) =>
        q.eq("userId", user._id).eq("listingId", args.listingId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { saved: false };
    } else {
      await ctx.db.insert("savedListings", {
        userId: user._id,
        listingId: args.listingId,
        savedAt: new Date().toISOString(),
      });

      // Notify the listing owner (not if saving own listing)
      const listing = await ctx.db.get(args.listingId);
      if (listing && listing.userId !== user._id) {
        await ctx.scheduler.runAfter(0, internal.notifications.mutations.createNotification, {
          userId: listing.userId,
          type: "listing_saved",
          title: "حفظ إعلانك",
          body: `${user.name ?? "مستخدم"} حفظ إعلانك "${listing.title}"`,
          listingId: args.listingId,
          actorId: user._id,
        });
      }

      return { saved: true };
    }
  },
});

// Check if a listing is saved by the current user
export const isSaved = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return false;

    const existing = await ctx.db
      .query("savedListings")
      .withIndex("by_user_and_listing", (q) =>
        q.eq("userId", user._id).eq("listingId", args.listingId)
      )
      .unique();

    return !!existing;
  },
});

// Get all saved listings for the current user (with listing data)
export const getMySaved = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];

    const saved = await ctx.db
      .query("savedListings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const listings = await Promise.all(
      saved.map(async (s) => {
        const listing = await ctx.db.get(s.listingId);
        if (!listing || listing.status === "draft") return null;
        const seller = await ctx.db.get(listing.userId);
        return {
          ...listing,
          savedAt: s.savedAt,
          savedId: s._id,
          sellerName: seller?.name ?? "بائع",
          sellerRating: seller?.rating ?? 0,
          sellerIsVerified: seller?.isVerified ?? false,
        };
      })
    );

    return listings.filter(Boolean);
  },
});

// Get the count of users who saved a listing
export const getSaveCount = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const saves = await ctx.db
      .query("savedListings")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .collect();
    return saves.length;
  },
});
