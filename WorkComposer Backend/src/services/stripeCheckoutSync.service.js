import stripe from "../config/stripe.js";
import Subscription from "../models/subscription.model.js";
import PaymentMethod from "../models/paymentMethod.model.js";
import { mapStripeSubscriptionStatus } from "../utils/stripeStatusMapper.js";

export const syncStripeCheckoutSession = async ({
  sessionId,
  organizationId,
}) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer", "subscription.default_payment_method"],
  });

  if (session.mode !== "subscription") {
    throw new Error("Stripe Checkout session is not a subscription session.");
  }

  if (session.payment_status !== "paid") {
    throw new Error("Stripe Checkout payment has not been completed.");
  }

  const stripeSubscription = session.subscription;

  if (!stripeSubscription) {
    throw new Error("Stripe subscription was not found.");
  }

  // Cross-tenant security check
  const sessionOrgId =
    session.metadata?.organizationId ||
    stripeSubscription.metadata?.organizationId ||
    (typeof session.customer === "object" ? session.customer?.metadata?.organizationId : null);

  if (sessionOrgId && sessionOrgId !== organizationId.toString()) {
    const error = new Error("Cross-tenant checkout session access denied.");
    error.statusCode = 403;
    throw error;
  }

  const price = stripeSubscription.items?.data?.[0]?.price;

  const quantity = stripeSubscription.items?.data?.[0]?.quantity || 1;

  if (!price) {
    throw new Error("Stripe subscription price was not found.");
  }

  const plan =
    session.metadata?.plan || stripeSubscription.metadata?.plan || "standard";

  const billingCycle =
    session.metadata?.billingCycle ||
    stripeSubscription.metadata?.billingCycle ||
    (price.recurring?.interval === "year" ? "annual" : "monthly");

  const subscriptionStatus = mapStripeSubscriptionStatus(stripeSubscription.status);

  const subscription = await Subscription.findOneAndUpdate(
    {
      organization: organizationId,
    },
    {
      $set: {
        stripeCustomerId:
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id || "",

        stripeSubscriptionId: stripeSubscription.id,

        stripePriceId: price.id,

        quantity,

        plan,

        billingCycle,

        status: subscriptionStatus,

        startsAt: stripeSubscription.start_date
          ? new Date(stripeSubscription.start_date * 1000)
          : new Date(),

        expiresAt: stripeSubscription.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000)
          : undefined,
      },
    },
    {
      new: true,
      upsert: true,
    },
  );

  // Sync payment method if card details are present
  try {
    const defaultPm = stripeSubscription.default_payment_method;
    if (defaultPm && typeof defaultPm === "object" && defaultPm.card) {
      await PaymentMethod.findOneAndUpdate(
        { organization: organizationId },
        {
          $set: {
            brand: defaultPm.card.brand || "",
            last4: defaultPm.card.last4 || "",
            expiryMonth: defaultPm.card.exp_month || null,
            expiryYear: defaultPm.card.exp_year || null,
            cardholderName: defaultPm.billing_details?.name || "",
            isDefault: true,
          },
        },
        { upsert: true, new: true }
      );
    }
  } catch (pmError) {
    console.error("Non-fatal: Failed to sync payment method details from checkout session:", pmError);
  }

  return {
    session,
    stripeSubscription,
    subscription,
  };
};
