import { query } from "../_generated/server";
import { v } from "convex/values";

// Comprehensive analytics for the currently authenticated seller
export const getMyAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;

    const allListings = await ctx.db
      .query("listings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const active  = allListings.filter((l) => l.status === "active");
    const sold    = allListings.filter((l) => l.status === "sold");
    const draft   = allListings.filter((l) => l.status === "draft");

    const totalViews   = allListings.reduce((s, l) => s + l.views, 0);
    const totalRevenue = sold.reduce((s, l) => s + l.price, 0);

    // Views per listing (top performers)
    const listingStats = allListings.map((l) => ({
      _id: l._id,
      title: l.title,
      category: l.category,
      price: l.price,
      views: l.views,
      status: l.status,
      isFeatured: l.isFeatured,
      createdAt: l.createdAt,
    }));

    // Category breakdown
    const categoryMap: Record<string, number> = {};
    for (const l of active) {
      categoryMap[l.category] = (categoryMap[l.category] ?? 0) + 1;
    }
    const categoryBreakdown = Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count,
    }));

    // Saved counts per listing
    const savedCounts = await Promise.all(
      allListings.map(async (l) => {
        const saves = await ctx.db
          .query("savedListings")
          .withIndex("by_listing", (q) => q.eq("listingId", l._id))
          .collect();
        return { listingId: l._id, count: saves.length };
      })
    );
    const savedCountMap: Record<string, number> = {};
    for (const s of savedCounts) {
      savedCountMap[s.listingId] = s.count;
    }
    const totalSaves = savedCounts.reduce((sum, s) => sum + s.count, 0);

    // Inquiries (conversations started about my listings)
    const inquiries = await Promise.all(
      allListings.map(async (l) => {
        const convs = await ctx.db
          .query("conversations")
          .withIndex("by_listing", (q) => q.eq("listingId", l._id))
          .collect();
        return { listingId: l._id, count: convs.length };
      })
    );
    const inquiryMap: Record<string, number> = {};
    for (const i of inquiries) {
      inquiryMap[i.listingId] = i.count;
    }
    const totalInquiries = inquiries.reduce((sum, i) => sum + i.count, 0);

    // Views over time (last 30 days grouping by createdAt week)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentListings = allListings.filter(
      (l) => new Date(l.createdAt).getTime() >= thirtyDaysAgo
    );

    // Build weekly buckets for last 4 weeks
    const weeklyViews: { week: string; views: number; listings: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = now - (w + 1) * 7 * 24 * 60 * 60 * 1000;
      const weekEnd   = now - w * 7 * 24 * 60 * 60 * 1000;
      const weekListings = recentListings.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= weekStart && t < weekEnd;
      });
      const label = w === 0 ? "هذا الأسبوع"
        : w === 1 ? "الأسبوع الماضي"
        : `منذ ${w + 1} أسابيع`;
      weeklyViews.push({
        week: label,
        views: weekListings.reduce((s, l) => s + l.views, 0),
        listings: weekListings.length,
      });
    }

    // Enrich listing stats with saved/inquiry counts
    const enrichedListingStats = listingStats.map((l) => ({
      ...l,
      saves: savedCountMap[l._id] ?? 0,
      inquiries: inquiryMap[l._id] ?? 0,
    }));

    // Sort top performers by views
    const topByViews = [...enrichedListingStats]
      .filter((l) => l.status === "active")
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    return {
      // Summary stats
      totalListings: allListings.length,
      activeListings: active.length,
      soldListings: sold.length,
      draftListings: draft.length,
      totalViews,
      totalSaves,
      totalInquiries,
      totalRevenue,
      avgRating: user.rating,
      ratingCount: user.ratingCount,
      // Breakdowns
      categoryBreakdown,
      weeklyViews,
      topByViews,
      allListingStats: enrichedListingStats,
    };
  },
});
