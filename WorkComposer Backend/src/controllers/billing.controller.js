import Subscription from "../models/subscription.model.js";
import BillingProfile from "../models/billingProfile.model.js";
import PaymentMethod from "../models/paymentMethod.model.js";
import Invoice from "../models/invoice.model.js";
import { STRIPE_PLANS } from "../config/stripePlans.js";
import { mapStripeSubscriptionStatus } from "../utils/stripeStatusMapper.js";
import {
  createStripeProduct,
  createStripePrice,
} from "../services/stripePlan.service.js";
import {
  createStripeSubscription,
  updateStripeSubscription,
} from "../services/stripeSubscription.service.js";
import { createStripeCheckoutSession } from "../services/stripeCheckout.service.js";
import {
  auditBillingProfileUpdated,
  auditPlanChanged,
} from "../utils/auditService.js";
import { syncStripeCheckoutSession } from "../services/stripeCheckoutSync.service.js";

export const getBillingOverview = async (req, res) => {
  try {
    const organization = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organization) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    const [subscription, billingProfile, paymentMethod] = await Promise.all([
      Subscription.findOneAndUpdate(
        {
          organization,
        },
        {
          $setOnInsert: {
            organization,
            plan: "standard",
            billingCycle: "monthly",
            status: "trial",
            quantity: 1,
          },
        },
        {
          new: true,
          upsert: true,
        },
      ),

      BillingProfile.findOneAndUpdate(
        { organization },
        {
          $setOnInsert: {
            organization,
          },
        },
        {
          new: true,
          upsert: true,
        },
      ),

      PaymentMethod.findOneAndUpdate(
        { organization },
        {
          $setOnInsert: {
            organization,
          },
        },
        {
          new: true,
          upsert: true,
        },
      ),
    ]);

    return res.status(200).json({
      subscription,
      billingProfile,
      paymentMethod,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch billing overview.",
    });
  }
};

export const getSubscription = async (req, res) => {
  try {
    const organization = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organization) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    let subscription = await Subscription.findOne({
      organization,
    });

    if (!subscription) {
      subscription = await Subscription.findOneAndUpdate(
        {
          organization,
        },
        {
          $setOnInsert: {
            organization,
            plan: "standard",
            billingCycle: "monthly",
            status: "trial",
            quantity: 1,
          },
        },
        {
          new: true,
          upsert: true,
        },
      );
    }

    return res.status(200).json(subscription);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch subscription.",
    });
  }
};

export const getInvoices = async (req, res) => {
  try {
    const organization = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organization) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    const invoices = await Invoice.find({
      organization,
    }).sort({
      issuedAt: -1,
    });

    return res.status(200).json({
      invoices,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch invoices.",
    });
  }
};

export const updateBillingProfile = async (req, res) => {
  try {
    const organization = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organization) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    const {
      companyName,
      contactName,
      email,
      address,
      city,
      state,
      postalCode,
      country,
      taxId,
    } = req.body;

    const billingProfile = await BillingProfile.findOneAndUpdate(
      { organization },
      {
        $set: {
          companyName,
          contactName,
          email,
          address,
          city,
          state,
          postalCode,
          country,
          taxId,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      message: "Billing information updated successfully.",
      billingProfile,
    });
  } catch (error) {
    console.error("UPDATE BILLING PROFILE ERROR:", error);

    return res.status(500).json({
      message: "Failed to update billing information.",
    });
  }
};

export const createCheckoutSession = async (req, res) => {
  try {
    const organizationId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    const { plan, billingCycle } = req.body || {};

    if (!plan || !billingCycle) {
      return res.status(400).json({
        message: "Plan and billing cycle are required.",
      });
    }

    if (!STRIPE_PLANS[plan] || !STRIPE_PLANS[plan][billingCycle]) {
      return res.status(400).json({
        message: `Invalid plan (${plan}) or billing cycle (${billingCycle}).`,
      });
    }

    const result = await createStripeCheckoutSession({
      organizationId,
      plan,
      billingCycle,
    });

    return res.status(200).json({
      sessionId: result.session.id,
      checkoutUrl: result.session.url,
    });
  } catch (error) {
    console.error("STRIPE CHECKOUT ERROR:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || "Failed to create Stripe Checkout session.",
      error: error.message || "Failed to create Stripe Checkout session.",
    });
  }
};

export const syncCheckoutSession = async (req, res) => {
  try {
    const organizationId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        message: "Stripe session ID is required.",
      });
    }

    const result = await syncStripeCheckoutSession({
      sessionId,
      organizationId,
    });

    return res.status(200).json({
      message: "Stripe Checkout synced successfully.",
      subscription: result.subscription,
    });
  } catch (error) {
    console.error("STRIPE CHECKOUT SYNC ERROR:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || "Failed to sync Stripe Checkout session.",
      error: error.message || "Failed to sync Stripe Checkout session.",
    });
  }
};

export const changeStripePlan = async (req, res) => {
  try {
    const organizationId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context.",
      });
    }

    const { plan, billingCycle } = req.body || {};

    if (!plan) {
      return res.status(400).json({
        message: "Plan is required.",
      });
    }

    if (!billingCycle) {
      return res.status(400).json({
        message: "Billing cycle is required.",
      });
    }

    if (!STRIPE_PLANS[plan] || !STRIPE_PLANS[plan][billingCycle]) {
      return res.status(400).json({
        message: `Invalid plan (${plan}) or billing cycle (${billingCycle}).`,
      });
    }

    // Get the organization's current subscription
    const currentSubscription = await Subscription.findOne({
      organization: organizationId,
    });

    if (!currentSubscription) {
      return res.status(404).json({
        message: "No active subscription found.",
      });
    }

    if (!currentSubscription.stripeSubscriptionId) {
      return res.status(400).json({
        message: "Stripe subscription ID is missing.",
      });
    }

    const result = await updateStripeSubscription({
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
      organizationId,
      plan,
      billingCycle,
    });

    const mappedStatus = mapStripeSubscriptionStatus(result.subscription.status);

    const updatedSubscription = await Subscription.findOneAndUpdate(
      { organization: organizationId },
      {
        $set: {
          plan,
          billingCycle,
          quantity: result.quantity,
          stripePriceId: result.priceId,
          status: mappedStatus,
        },
      },
      { new: true }
    );

    return res.status(200).json({
      message: "Stripe subscription plan updated successfully.",
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error("STRIPE PLAN CHANGE ERROR:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || "Failed to change Stripe subscription plan.",
      error: error.message || "Failed to change Stripe subscription plan.",
    });
  }
};
