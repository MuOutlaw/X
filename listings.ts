import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const listListings = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(v.string()),
    city: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Full-text search path
    if (args.search && args.search.trim().length > 0) {
      const q = ctx.db
        .query("listings")
        .withSearchIndex("search_title", (s) => {
          let builder = s.search("title", args.search!);
          if (args.category) builder = builder.eq("category", args.category);
          if (args.city) builder = builder.eq("city", args.city);
          return builder.eq("status", "active");
        });
      const results = await q.take(50);
      // Enrich with user data (only safe public fields)
      const enriched = await Promise.all(
        results.map(async (listing) => {
          const user = await ctx.db.get(listing.userId);
          const safeUser = user ? {
            _id: user._id,
            name: user.name,
            phone: user.phone,
            city: user.city,
            avatarUrl: user.avatarUrl,
            isVerified: user.isVerified,
            rating: user.rating,
            ratingCount: user.ratingCount,
          } : null;
          return { ...listing, user: safeUser };
        })
      );
      return {
        page: enriched,
        isDone: true,
        continueCursor: "",
      };
    }

    // Index-based path
    let baseQuery;
    if (args.category && args.city) {
      baseQuery = ctx.db
        .query("listings")
        .withIndex("by_status_and_category", (q) =>
          q.eq("status", "active").eq("category", args.category!)
        )
        .filter((q) => q.eq(q.field("city"), args.city!));
    } else if (args.category) {
      baseQuery = ctx.db
        .query("listings")
        .withIndex("by_status_and_category", (q) =>
          q.eq("status", "active").eq("category", args.category!)
        );
    } else if (args.city) {
      baseQuery = ctx.db
        .query("listings")
        .withIndex("by_status_and_city", (q) =>
          q.eq("status", "active").eq("city", args.city!)
        );
    } else {
      baseQuery = ctx.db
        .query("listings")
        .withIndex("by_status", (q) => q.eq("status", "active"));
    }

    const paginatedResult = await baseQuery
      .order("desc")
      .paginate(args.paginationOpts);

    const enriched = await Promise.all(
      paginatedResult.page.map(async (listing) => {
        const user = await ctx.db.get(listing.userId);
        const safeUser = user ? {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          city: user.city,
          avatarUrl: user.avatarUrl,
          isVerified: user.isVerified,
          rating: user.rating,
          ratingCount: user.ratingCount,
        } : null;
        return { ...listing, user: safeUser };
      })
    );

    return { ...paginatedResult, page: enriched };
  },
});

export const getFeaturedListings = query({
  args: {},
  handler: async (ctx) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(6);
    return await Promise.all(
      listings.map(async (listing) => {
        const user = await ctx.db.get(listing.userId);
        const safeUser = user ? {
          _id: user._id,
          name: user.name,
          phone: user.phone,
          city: user.city,
          avatarUrl: user.avatarUrl,
          isVerified: user.isVerified,
          rating: user.rating,
          ratingCount: user.ratingCount,
        } : null;
        return { ...listing, user: safeUser };
      })
    );
  },
});

export const getListingById = query({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.id);
    if (!listing) return null;
    const user = await ctx.db.get(listing.userId);
    // Only expose public user fields
    const safeUser = user ? {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      city: user.city,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
      rating: user.rating,
      ratingCount: user.ratingCount,
      joinedAt: user.joinedAt,
    } : null;
    return { ...listing, user: safeUser };
  },
});

export const getListingsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("listings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});
