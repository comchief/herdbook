export type FarmForStatus = {
  trialEndsAt: Date;
  paidThroughDate: Date | null;
};

export type SubscriptionStatus = "trialing" | "active" | "expired";

/** A farm has access as long as it's still inside its 30-day trial, or has
 * a payment that was approved and hasn't run out yet. There's no payment
 * processor here — paidThroughDate only moves forward when the platform
 * admin approves a submitted bank transfer (see src/lib/payments.ts). */
export function subscriptionStatus(farm: FarmForStatus, now: Date = new Date()): SubscriptionStatus {
  if (farm.paidThroughDate && farm.paidThroughDate.getTime() > now.getTime()) return "active";
  if (farm.trialEndsAt.getTime() > now.getTime()) return "trialing";
  return "expired";
}

export function daysRemaining(target: Date, now: Date = new Date()): number {
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export const MONTHLY_PRICE_USD = 30;
export const TRIAL_DAYS = 30;
