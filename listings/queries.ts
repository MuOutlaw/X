import { v } from "convex/values";
import { query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(v.string()),
    city: v.optional(v.string()),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("newest"), v.literal("price_asc"), v.literal("price_desc"))),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("listings")
      .withIndex("by_status_and_category", (qi) => {
        if (args.category) {
          return qi.eq("status", "active").eq("category", args.category);
        }
        return qi.eq("status", "active");
      })
      .order("desc");

    const results = await q.paginate(args.paginationOpts);

    const filtered = results.page.filter((l) => {
      if (args.city && l.city !== args.city) return false;
      if (args.minPrice !== undefined && l.price < args.minPrice) return false;
      if (args.maxPrice !== undefined && l.price > args.maxPrice) return false;
      return true;
    });

    // Sort after filtering — featured listings always appear first
    if (args.sortBy === "price_asc") {
      filtered.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.price - b.price;
      });
    } else if (args.sortBy === "price_desc") {
      filtered.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return b.price - a.price;
      });
    } else {
      // Default: featured first, then by creation date (already ordered desc)
      filtered.sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return 0;
      });
    }

    // Enrich with seller info
    const enriched = await Promise.all(
      filtered.map(async (listing) => {
        const seller = await ctx.db.get(listing.userId);
        return {
          ...listing,
          seller: seller
            ? { name: seller.name, isVerified: seller.isVerified, rating: seller.rating }
            : null,
        };
      })
    );

    return { ...results, page: enriched };
  },
});

export const search = query({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];

    const results = await ctx.db
      .query("listings")
      .withSearchIndex("search_title", (q) => {
        let sq = q.search("title", args.query).eq("status", "active");
        if (args.category) sq = sq.eq("category", args.category);
        return sq;
      })
      .take(20);

    return await Promise.all(
      results.map(async (listing) => {
        const seller = await ctx.db.get(listing.userId);
        return {
          ...listing,
          seller: seller
            ? { name: seller.name, isVerified: seller.isVerified, rating: seller.rating }
            : null,
        };
      })
    );
  },
});

export const getById = query({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) return null;
    const seller = await ctx.db.get(listing.userId);
    // Only expose safe public fields
    const safeSeller = seller ? {
      _id: seller._id,
      name: seller.name,
      phone: seller.phone,
      city: seller.city,
      bio: seller.bio,
      avatarUrl: seller.avatarUrl,
      isVerified: seller.isVerified,
      rating: seller.rating,
      ratingCount: seller.ratingCount,
      joinedAt: seller.joinedAt,
    } : null;
    return {
      ...listing,
      seller: safeSeller,
    };
  },
});

export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    const featured = await ctx.db
      .query("listings")
      .withIndex("by_status_and_category", (q) => q.eq("status", "active"))
      .order("desc")
      .take(6);

    return await Promise.all(
      featured.map(async (l) => {
        const seller = await ctx.db.get(l.userId);
        return {
          ...l,
          seller: seller
            ? { name: seller.name, isVerified: seller.isVerified, rating: seller.rating }
            : null,
        };
      })
    );
  },
});

export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

// Get listings for the currently authenticated user (no args needed)
export const getMyListings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];
    return await ctx.db
      .query("listings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getSimilar = query({
  args: {
    listingId: v.id("listings"),
    category: v.string(),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("listings")
      .withIndex("by_status_and_category", (q) =>
        q.eq("status", "active").eq("category", args.category)
      )
      .order("desc")
      .take(10);

    const filtered = results
      .filter((l) => l._id !== args.listingId)
      .slice(0, 6);

    return await Promise.all(
      filtered.map(async (l) => {
        const seller = await ctx.db.get(l.userId);
        return {
          ...l,
          seller: seller
            ? { name: seller.name, isVerified: seller.isVerified, rating: seller.rating }
            : null,
        };
      })
    );
  },
});

