import { query } from "../_generated/server";
import { requireAdmin } from "../helpers";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return user?.role === "admin";
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx): Promise<{
    totalUsers: number;
    totalListings: number;
    activeListings: number;
    soldListings: number;
    totalReports: number;
    pendingReports: number;
  }> => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const listings = await ctx.db.query("listings").collect();
    const reports = await ctx.db.query("reports").collect();
    return {
      totalUsers: users.length,
      totalListings: listings.length,
      activeListings: listings.filter((l) => l.status === "active").length,
      soldListings: listings.filter((l) => l.status === "sold").length,
      totalReports: reports.length,
      pendingReports: reports.filter((r) => r.status === "pending").length,
    };
  },
});

export const getAllUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").order("desc").paginate(args.paginationOpts);
  },
});

export const getAllListings = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let results;
    if (args.status && (args.status === "active" || args.status === "sold" || args.status === "draft")) {
      results = await ctx.db
        .query("listings")
        .withIndex("by_status", (q) => q.eq("status", args.status as "active" | "sold" | "draft"))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      results = await ctx.db.query("listings").order("desc").paginate(args.paginationOpts);
    }
    const enriched = await Promise.all(
      results.page.map(async (listing) => {
        const user = await ctx.db.get(listing.userId);
        return { ...listing, userName: user?.name ?? "مجهول" };
      })
    );
    return { ...results, page: enriched };
  },
});

export const getAllReports = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const results = await ctx.db.query("reports").order("desc").paginate(args.paginationOpts);
    const enriched = await Promise.all(
      results.page.map(async (report) => {
        const reporter = await ctx.db.get(report.reporterId);
        const targetListing = report.targetListingId ? await ctx.db.get(report.targetListingId) : null;
        const targetUser = report.targetUserId ? await ctx.db.get(report.targetUserId) : null;
        return {
          ...report,
          reporterName: reporter?.name ?? "مجهول",
          targetListingTitle: targetListing?.title ?? null,
          targetUserName: targetUser?.name ?? null,
        };
      })
    );
    return { ...results, page: enriched };
  },
});

export const getAllVerificationRequests = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{
    page: {
      _id: string;
      userId: string;
      idType: string;
      idNumber: string;
      status: string;
      notes?: string;
      reviewedAt?: string;
      createdAt: string;
      idImageUrl: string | null;
      selfieUrl: string | null;
      userName: string;
      userPhone: string | null;
    }[];
    isDone: boolean;
    continueCursor: string;
  }> => {
    await requireAdmin(ctx);

    const validStatuses = ["pending", "approved", "rejected"] as const;
    type VStatus = typeof validStatuses[number];
    const s = args.status as VStatus | undefined;

    let results;
    if (s && validStatuses.includes(s)) {
      results = await ctx.db
        .query("verificationRequests")
        .withIndex("by_status", (q) => q.eq("status", s))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      results = await ctx.db
        .query("verificationRequests")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const enriched = await Promise.all(
      results.page.map(async (req) => {
        const user = await ctx.db.get(req.userId);
        const idImageUrl = await ctx.storage.getUrl(req.idImageStorageId);
        const selfieUrl = req.selfieStorageId ? await ctx.storage.getUrl(req.selfieStorageId) : null;
        return {
          _id: req._id as string,
          userId: req.userId as string,
          idType: req.idType,
          idNumber: req.idNumber,
          status: req.status,
          notes: req.notes,
          reviewedAt: req.reviewedAt,
          createdAt: req.createdAt,
          idImageUrl,
          selfieUrl,
          userName: user?.name ?? "مجهول",
          userPhone: user?.phone ?? null,
        };
      })
    );

    return { ...results, page: enriched };
  },
});

export const getAllReceipts = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{
    page: {
      _id: string;
      status: string;
      packageId: string;
      createdAt: string;
      reviewedAt?: string;
      notes?: string;
      imageUrl: string | null;
      userName: string;
      userPhone: string | null;
    }[];
    isDone: boolean;
    continueCursor: string;
  }> => {
    await requireAdmin(ctx);

    let results;
    const validStatuses = ["pending", "approved", "rejected"] as const;
    type ReceiptStatus = typeof validStatuses[number];
    const s = args.status as ReceiptStatus | undefined;

    if (s && validStatuses.includes(s)) {
      results = await ctx.db
        .query("subscriptionReceipts")
        .withIndex("by_status", (q) => q.eq("status", s))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      results = await ctx.db
        .query("subscriptionReceipts")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const enriched = await Promise.all(
      results.page.map(async (receipt) => {
        const user = await ctx.db.get(receipt.userId);
        const imageUrl = await ctx.storage.getUrl(receipt.receiptStorageId);
        return {
          _id: receipt._id as string,
          status: receipt.status,
          packageId: receipt.packageId,
          createdAt: receipt.createdAt,
          reviewedAt: receipt.reviewedAt,
          notes: receipt.notes,
          imageUrl,
          userName: user?.name ?? "مجهول",
          userPhone: user?.phone ?? null,
        };
      })
    );

    return { ...results, page: enriched };
  },
});
