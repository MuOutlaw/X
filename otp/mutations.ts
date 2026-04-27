import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/** Mark the user with this phone as phoneVerified */
export const markPhoneVerified = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return;

    await ctx.db.patch(user._id, {
      phone: args.phone,
      phoneVerified: true,
    });
  },
});
