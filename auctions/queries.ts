import { v } from "convex/values";
import { query } from "../_generated/server";

/** Get a single auction by ID with creator info */
export const getById = query({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, args) => {
    const auction = await ctx.db.get(args.auctionId);
    if (!auction) return null;

    const creator = await ctx.db.get(auction.creatorId);
    const highestBidder = auction.highestBidderId
      ? await ctx.db.get(auction.highestBidderId)
      : null;

    return {
      ...auction,
      creator: creator
        ? {
            _id: creator._id,
            name: creator.name,
            avatarUrl: creator.avatarUrl,
            isVerified: creator.isVerified,
            city: creator.city,
            phone: creator.phone,
          }
        : null,
      highestBidder: highestBidder
        ? {
            _id: highestBidder._id,
            name: highestBidder.name,
            avatarUrl: highestBidder.avatarUrl,
          }
        : null,
    };
  },
});

/** List auctions filtered by status */
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const auctions = await ctx.db
      .query("auctions")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(50);

    const withCreators = await Promise.all(
      auctions.map(async (auction) => {
        const creator = await ctx.db.get(auction.creatorId);
        return {
          ...auction,
          creatorName: creator?.name ?? "مجهول",
          creatorAvatar: creator?.avatarUrl,
          creatorVerified: creator?.isVerified ?? false,
        };
      })
    );
    return withCreators;
  },
});

/** List all non-cancelled auctions (active + scheduled + ended) */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const auctions = await ctx.db
      .query("auctions")
      .order("desc")
      .take(100);

    const filtered = auctions.filter((a) => a.status !== "cancelled");

    const withCreators = await Promise.all(
      filtered.map(async (auction) => {
        const creator = await ctx.db.get(auction.creatorId);
        return {
          ...auction,
          creatorName: creator?.name ?? "مجهول",
          creatorAvatar: creator?.avatarUrl,
          creatorVerified: creator?.isVerified ?? false,
        };
      })
    );
    return withCreators;
  },
});

/** Get bids for an auction, ordered by highest first */
export const getBids = query({
  args: { auctionId: v.id("auctions") },
  handler: async (ctx, args) => {
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_auction", (q) => q.eq("auctionId", args.auctionId))
      .order("desc")
      .take(100);

    const withBidders = await Promise.all(
      bids.map(async (bid) => {
        const bidder = await ctx.db.get(bid.bidderId);
        return {
          ...bid,
          bidderName: bidder?.name ?? "مجهول",
          bidderAvatar: bidder?.avatarUrl,
        };
      })
    );
    return withBidders;
  },
});

/** Get auctions created by a specific user */
export const getByCreator = query({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auctions")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
      .order("desc")
      .take(50);
  },
});

/** Get auctions where the current user has placed bids */
export const getMyBiddedAuctions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return [];

    const myBids = await ctx.db
      .query("bids")
      .withIndex("by_bidder", (q) => q.eq("bidderId", user._id))
      .order("desc")
      .take(200);

    // Unique auction IDs
    const auctionIds = [...new Set(myBids.map((b) => b.auctionId))];
    const auctions = await Promise.all(
      auctionIds.map(async (id) => {
        const auction = await ctx.db.get(id);
        return auction;
      })
    );
    return auctions.filter(Boolean);
  },
});
