import { v } from "convex/values";
import { query } from "../_generated/server";

export const getByListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_listing", (q) => q.eq("listingId", args.listingId))
      .order("desc")
      .take(100);

    return await Promise.all(
      comments.map(async (comment) => {
        const user = await ctx.db.get(comment.userId);
        return {
          ...comment,
          user: user
            ? {
                _id: user._id,
                name: user.name,
                avatarUrl: user.avatarUrl,
                isVerified: user.isVerified,
              }
            : null,
        };
      })
    );
  },
});
