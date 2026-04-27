import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers.ts";

/** Check if current user is allowed to start a live stream */
export const canStream = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { allowed: false, reason: "يجب تسجيل الدخول" };

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return { allowed: false, reason: "المستخدم غير موجود" };

    if (!user.isVerified) {
      return { allowed: false, reason: "يجب توثيق حسابك أولاً. تواصل مع الإدارة." };
    }

    const now = new Date().toISOString();
    const hasPremium =
      !!user.subscriptionPackage &&
      !!user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt > now;

    if (!hasPremium) {
      return { allowed: false, reason: "البث المباشر متاح فقط لأصحاب الباقات المميزة." };
    }

    return { allowed: true, reason: null };
  },
});

/** Start a live stream for an auction — only verified users with active premium subscription */
export const startStream = mutation({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) {
      throw new ConvexError({ code: "NOT_FOUND", message: "المزاد غير موجود" });
    }
    if (auction.creatorId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "فقط صاحب المزاد يمكنه بدء البث" });
    }
    if (auction.status !== "active" && auction.status !== "scheduled") {
      throw new ConvexError({ code: "BAD_REQUEST", message: "لا يمكن بدء البث لمزاد منتهي أو ملغي" });
    }

    // Only verified accounts can stream
    if (!user.isVerified) {
      throw new ConvexError({ code: "FORBIDDEN", message: "يجب توثيق حسابك أولاً لبدء بث مباشر. تواصل مع الإدارة للتوثيق." });
    }

    // Only users with active premium subscription can stream
    const now = new Date().toISOString();
    const hasPremium =
      !!user.subscriptionPackage &&
      !!user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt > now;

    if (!hasPremium) {
      throw new ConvexError({ code: "FORBIDDEN", message: "البث المباشر متاح فقط لأصحاب الباقات المميزة. يرجى الاشتراك في إحدى الباقات." });
    }

    // Check if there's already an active stream
    const existing = await ctx.db
      .query("liveStreams")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .filter((q) => q.eq(q.field("status"), "live"))
      .first();

    if (existing) {
      return { streamId: existing._id, channelName: existing.channelName };
    }

    // Create unique channel name: auction-{auctionId}-{timestamp}
    const channelName = `auction-${args.auctionId}-${Date.now()}`;

    const streamId = await ctx.db.insert("liveStreams", {
      auctionId: args.auctionId,
      hostId: user._id,
      channelName,
      status: "live",
      viewerCount: 0,
      startedAt: new Date().toISOString(),
    });

    return { streamId, channelName };
  },
});

/** End a live stream */
export const endStream = mutation({
  args: { streamId: v.id("liveStreams") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const stream = await ctx.db.get(args.streamId);
    if (!stream) {
      throw new ConvexError({ code: "NOT_FOUND", message: "البث غير موجود" });
    }
    if (stream.hostId !== user._id && user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "ليس لديك صلاحية إيقاف هذا البث" });
    }
    if (stream.status === "ended") {
      return { success: true };
    }

    await ctx.db.patch(args.streamId, {
      status: "ended",
      endedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

/** Update viewer count — requires authentication to prevent abuse */
export const updateViewerCount = mutation({
  args: {
    streamId: v.id("liveStreams"),
    delta: v.union(v.literal(1), v.literal(-1)), // only allow +1 or -1
  },
  handler: async (ctx, args) => {
    // Require auth to prevent anonymous abuse
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const stream = await ctx.db.get(args.streamId);
    if (!stream || stream.status !== "live") return;

    const newCount = Math.max(0, stream.viewerCount + args.delta);
    await ctx.db.patch(args.streamId, { viewerCount: newCount });
  },
});

/** Get all currently live streams with auction info */
export const getActiveStreams = query({
  args: {},
  handler: async (ctx) => {
    const streams = await ctx.db
      .query("liveStreams")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .order("desc")
      .take(20);

    return await Promise.all(
      streams.map(async (stream) => {
        const auction = await ctx.db.get(stream.auctionId);
        const host = await ctx.db.get(stream.hostId);
        return {
          ...stream,
          auctionTitle: auction?.title ?? "مزاد",
          auctionImage: auction?.images?.[0] ?? null,
          hostName: host?.name ?? "مجهول",
        };
      })
    );
  },
});

/** Get active live stream for an auction */
export const getByAuction = query({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, args) => {
    const stream = await ctx.db
      .query("liveStreams")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .filter((q) => q.eq(q.field("status"), "live"))
      .first();

    if (!stream) return null;

    const host = await ctx.db.get(stream.hostId);
    return {
      ...stream,
      hostName: host?.name ?? "مجهول",
      hostAvatar: host?.avatarUrl,
    };
  },
});
