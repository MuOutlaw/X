import { query } from "../_generated/server";
import { ConvexError } from "convex/values";

// Get current user's latest verification request
export const getMyRequest = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;

    const req = await ctx.db
      .query("verificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    if (!req) return null;

    const idImageUrl = await ctx.storage.getUrl(req.idImageStorageId);
    const selfieUrl = req.selfieStorageId ? await ctx.storage.getUrl(req.selfieStorageId) : null;

    return { ...req, idImageUrl, selfieUrl };
  },
});
