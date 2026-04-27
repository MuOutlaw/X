/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_mutations from "../admin/mutations.js";
import type * as admin_queries from "../admin/queries.js";
import type * as analytics_queries from "../analytics/queries.js";
import type * as auctions_internals from "../auctions/internals.js";
import type * as auctions_mutations from "../auctions/mutations.js";
import type * as auctions_queries from "../auctions/queries.js";
import type * as auctions_schedule from "../auctions/schedule.js";
import type * as audit_mutations from "../audit/mutations.js";
import type * as audit_queries from "../audit/queries.js";
import type * as boosts_mutations from "../boosts/mutations.js";
import type * as boosts_packages from "../boosts/packages.js";
import type * as boosts_queries from "../boosts/queries.js";
import type * as comments_mutations from "../comments/mutations.js";
import type * as comments_queries from "../comments/queries.js";
import type * as crons from "../crons.js";
import type * as helpers from "../helpers.js";
import type * as listings from "../listings.js";
import type * as listings_mutations from "../listings/mutations.js";
import type * as listings_queries from "../listings/queries.js";
import type * as livestream_mutations from "../livestream/mutations.js";
import type * as messages_mutations from "../messages/mutations.js";
import type * as messages_queries from "../messages/queries.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as otp_actions from "../otp/actions.js";
import type * as otp_mutations from "../otp/mutations.js";
import type * as payments_moyasarAction from "../payments/moyasarAction.js";
import type * as payments_mutations from "../payments/mutations.js";
import type * as payments_queries from "../payments/queries.js";
import type * as ratings_mutations from "../ratings/mutations.js";
import type * as ratings_queries from "../ratings/queries.js";
import type * as reports_mutations from "../reports/mutations.js";
import type * as reports_queries from "../reports/queries.js";
import type * as savedListings from "../savedListings.js";
import type * as spam_protection from "../spam_protection.js";
import type * as subscriptions_mutations from "../subscriptions/mutations.js";
import type * as subscriptions_queries from "../subscriptions/queries.js";
import type * as users from "../users.js";
import type * as verification_mutations from "../verification/mutations.js";
import type * as verification_queries from "../verification/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/mutations": typeof admin_mutations;
  "admin/queries": typeof admin_queries;
  "analytics/queries": typeof analytics_queries;
  "auctions/internals": typeof auctions_internals;
  "auctions/mutations": typeof auctions_mutations;
  "auctions/queries": typeof auctions_queries;
  "auctions/schedule": typeof auctions_schedule;
  "audit/mutations": typeof audit_mutations;
  "audit/queries": typeof audit_queries;
  "boosts/mutations": typeof boosts_mutations;
  "boosts/packages": typeof boosts_packages;
  "boosts/queries": typeof boosts_queries;
  "comments/mutations": typeof comments_mutations;
  "comments/queries": typeof comments_queries;
  crons: typeof crons;
  helpers: typeof helpers;
  listings: typeof listings;
  "listings/mutations": typeof listings_mutations;
  "listings/queries": typeof listings_queries;
  "livestream/mutations": typeof livestream_mutations;
  "messages/mutations": typeof messages_mutations;
  "messages/queries": typeof messages_queries;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "otp/actions": typeof otp_actions;
  "otp/mutations": typeof otp_mutations;
  "payments/moyasarAction": typeof payments_moyasarAction;
  "payments/mutations": typeof payments_mutations;
  "payments/queries": typeof payments_queries;
  "ratings/mutations": typeof ratings_mutations;
  "ratings/queries": typeof ratings_queries;
  "reports/mutations": typeof reports_mutations;
  "reports/queries": typeof reports_queries;
  savedListings: typeof savedListings;
  spam_protection: typeof spam_protection;
  "subscriptions/mutations": typeof subscriptions_mutations;
  "subscriptions/queries": typeof subscriptions_queries;
  users: typeof users;
  "verification/mutations": typeof verification_mutations;
  "verification/queries": typeof verification_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
