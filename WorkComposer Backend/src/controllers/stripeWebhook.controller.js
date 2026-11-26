import stripe from "../config/stripe.js";
import Subscription from "../models/subscription.model.js";
import Invoice from "../models/invoice.model.js";
import { syncStripeCheckoutSession } from "../services/stripeCheckoutSync.service.js";
import {
  mapStripeSubscriptionStatus,
  mapStripeInvoiceStatus,
  convertStripeAmountToStandard,
} from "../utils/stripeStatusMapper.js";

export const handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("STRIPE WEBHOOK SIGNATURE ERROR:", error.message);

    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  console.log("STRIPE WEBHOOK RECEIVED:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data?.object;
        const organizationId = session?.metadata?.organizationId;
        if (session?.mode === "subscription" && organizationId && session?.id) {
          try {
            await syncStripeCheckoutSession({
              sessionId: session.id,
              organizationId,
            });
          } catch (syncErr) {
            console.error("Webhook checkout sync failed:", syncErr);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const stripeSub = event.data?.object;
        if (!stripeSub) break;
        const subId = stripeSub.id;
        const customerId =
          typeof stripeSub.customer === "string"
            ? stripeSub.customer
            : stripeSub.customer?.id;
        const orgId = stripeSub.metadata?.organizationId;

        let existing = orgId
          ? await Subscription.findOne({ organization: orgId })
          : await Subscription.findOne({ stripeSubscriptionId: subId });

        if (!existing && customerId) {
          existing = await Subscription.findOne({ stripeCustomerId: customerId });
        }

        if (existing) {
          // GUARD: If existing subscription record has transitioned to a newer stripeSubscriptionId,
          // ignore updates belonging to the obsolete subscription.
          if (existing.stripeSubscriptionId && subId && existing.stripeSubscriptionId !== subId) {
            console.warn(
              `[StripeWebhook] Stale event for obsolete subscription ${subId} ignored; current active is ${existing.stripeSubscriptionId}`
            );
            break;
          }

          // Out-of-order check: If local subscription is cancelled and incoming event is older than cancellation, ignore
          if (existing.status === "cancelled" && stripeSub.status !== "canceled" && stripeSub.status !== "cancelled") {
            const incomingPeriodEnd = stripeSub.current_period_end ? stripeSub.current_period_end * 1000 : 0;
            const existingCancelledAt = existing.cancelledAt ? new Date(existing.cancelledAt).getTime() : 0;
            if (incomingPeriodEnd < existingCancelledAt) {
              console.warn(
                `[StripeWebhook] Stale out-of-order event for cancelled subscription ${subId} ignored.`
              );
              break;
            }
          }

          // Out-of-order check: If incoming current_period_end is older than existing expiresAt, ignore stale update
          if (existing.expiresAt && stripeSub.current_period_end) {
            const incomingEnd = stripeSub.current_period_end * 1000;
            const existingEnd = new Date(existing.expiresAt).getTime();
            if (incomingEnd < existingEnd && existing.status !== "cancelled") {
              console.warn(
                `[StripeWebhook] Stale out-of-order event for subscription ${subId} ignored (incoming end ${incomingEnd} < existing end ${existingEnd}).`
              );
              break;
            }
          }

          const mappedStatus = mapStripeSubscriptionStatus(stripeSub.status);
          const price = stripeSub.items?.data?.[0]?.price;
          const quantity = stripeSub.items?.data?.[0]?.quantity || existing.quantity || 1;
          const plan = stripeSub.metadata?.plan || existing.plan || "standard";
          const billingCycle =
            stripeSub.metadata?.billingCycle ||
            existing.billingCycle ||
            (price?.recurring?.interval === "year" ? "annual" : "monthly");

          const cancelledAt = stripeSub.canceled_at
            ? new Date(stripeSub.canceled_at * 1000)
            : mappedStatus === "cancelled"
              ? (existing.cancelledAt ? new Date(existing.cancelledAt) : new Date())
              : null;

          await Subscription.findOneAndUpdate(
            { id: existing.id },
            {
              $set: {
                status: mappedStatus,
                plan,
                billingCycle,
                quantity,
                stripePriceId: price?.id || existing.stripePriceId,
                stripeSubscriptionId: subId,
                expiresAt: stripeSub.current_period_end
                  ? new Date(stripeSub.current_period_end * 1000)
                  : undefined,
                cancelledAt,
              },
            },
            { new: true }
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data?.object;
        if (!stripeSub) break;
        const subId = stripeSub.id;
        const orgId = stripeSub.metadata?.organizationId;

        let existing = orgId
          ? await Subscription.findOne({ organization: orgId })
          : await Subscription.findOne({ stripeSubscriptionId: subId });

        if (existing) {
          // GUARD: If existing subscription record has transitioned to a newer stripeSubscriptionId,
          // ignore deletion belonging to the obsolete subscription.
          if (existing.stripeSubscriptionId && subId && existing.stripeSubscriptionId !== subId) {
            console.warn(
              `[StripeWebhook] Stale deletion for obsolete subscription ${subId} ignored; current active is ${existing.stripeSubscriptionId}`
            );
            break;
          }

          await Subscription.findOneAndUpdate(
            { id: existing.id },
            {
              $set: {
                status: "cancelled",
                cancelledAt: stripeSub.canceled_at
                  ? new Date(stripeSub.canceled_at * 1000)
                  : (existing.cancelledAt ? new Date(existing.cancelledAt) : new Date()),
              },
            },
            { new: true }
          );
        }
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const stripeInvoice = event.data?.object;
        if (!stripeInvoice) break;
        const invoiceNumber = stripeInvoice.number || stripeInvoice.id;
        const customerId =
          typeof stripeInvoice.customer === "string"
            ? stripeInvoice.customer
            : stripeInvoice.customer?.id;
        const subId =
          typeof stripeInvoice.subscription === "string"
            ? stripeInvoice.subscription
            : stripeInvoice.subscription?.id;

        let metaOrgId =
          stripeInvoice.subscription_details?.metadata?.organizationId ||
          stripeInvoice.metadata?.organizationId;

        const sub = subId
          ? await Subscription.findOne({ stripeSubscriptionId: subId })
          : customerId
            ? await Subscription.findOne({ stripeCustomerId: customerId })
            : null;

        // Verify tenant consistency between metadata and database record
        if (metaOrgId && sub && sub.organization && metaOrgId !== sub.organization.toString()) {
          console.error(
            `[StripeWebhook] Security Alert: Cross-tenant mismatch between invoice metadata org (${metaOrgId}) and subscription org (${sub.organization})`
          );
          metaOrgId = sub.organization.toString();
        }

        const orgId = metaOrgId || sub?.organization;

        if (orgId && invoiceNumber) {
          const rawAmount = stripeInvoice.amount_paid !== undefined ? stripeInvoice.amount_paid : (stripeInvoice.total || 0);
          const currency = (stripeInvoice.currency || "USD").toUpperCase();
          const amount = convertStripeAmountToStandard(rawAmount, currency);
          const status = mapStripeInvoiceStatus(stripeInvoice.status);

          await Invoice.findOneAndUpdate(
            { invoiceNumber },
            {
              $set: {
                organization: orgId,
                invoiceNumber,
                amount,
                currency,
                status,
                billingPeriodStart: stripeInvoice.period_start
                  ? new Date(stripeInvoice.period_start * 1000)
                  : null,
                billingPeriodEnd: stripeInvoice.period_end
                  ? new Date(stripeInvoice.period_end * 1000)
                  : null,
                issuedAt: stripeInvoice.created
                  ? new Date(stripeInvoice.created * 1000)
                  : new Date(),
                paidAt: stripeInvoice.status === "paid" ? new Date() : null,
                pdfUrl:
                  stripeInvoice.invoice_pdf ||
                  stripeInvoice.hosted_invoice_url ||
                  "",
              },
            },
            { upsert: true, new: true }
          );
        } else {
          console.warn("[StripeWebhook] Invoice received with unresolvable organization context:", invoiceNumber);
        }
        break;
      }

      case "invoice.payment_failed": {
        const stripeInvoice = event.data?.object;
        if (!stripeInvoice) break;
        const invoiceNumber = stripeInvoice.number || stripeInvoice.id;
        const customerId =
          typeof stripeInvoice.customer === "string"
            ? stripeInvoice.customer
            : stripeInvoice.customer?.id;
        const subId =
          typeof stripeInvoice.subscription === "string"
            ? stripeInvoice.subscription
            : stripeInvoice.subscription?.id;

        let metaOrgId =
          stripeInvoice.subscription_details?.metadata?.organizationId ||
          stripeInvoice.metadata?.organizationId;

        const sub = subId
          ? await Subscription.findOne({ stripeSubscriptionId: subId })
          : customerId
            ? await Subscription.findOne({ stripeCustomerId: customerId })
            : null;

        if (metaOrgId && sub && sub.organization && metaOrgId !== sub.organization.toString()) {
          console.error(
            `[StripeWebhook] Security Alert: Cross-tenant mismatch between invoice metadata org (${metaOrgId}) and subscription org (${sub.organization})`
          );
          metaOrgId = sub.organization.toString();
        }

        const orgId = metaOrgId || sub?.organization;

        if (orgId && invoiceNumber) {
          const rawAmount = stripeInvoice.amount_due !== undefined ? stripeInvoice.amount_due : (stripeInvoice.total || 0);
          const currency = (stripeInvoice.currency || "USD").toUpperCase();
          const amount = convertStripeAmountToStandard(rawAmount, currency);

          await Invoice.findOneAndUpdate(
            { invoiceNumber },
            {
              $set: {
                organization: orgId,
                invoiceNumber,
                amount,
                currency,
                status: "failed",
                billingPeriodStart: stripeInvoice.period_start
                  ? new Date(stripeInvoice.period_start * 1000)
                  : null,
                billingPeriodEnd: stripeInvoice.period_end
                  ? new Date(stripeInvoice.period_end * 1000)
                  : null,
                issuedAt: stripeInvoice.created
                  ? new Date(stripeInvoice.created * 1000)
                  : new Date(),
                pdfUrl:
                  stripeInvoice.invoice_pdf ||
                  stripeInvoice.hosted_invoice_url ||
                  "",
              },
            },
            { upsert: true, new: true }
          );

          await Subscription.findOneAndUpdate(
            { organization: orgId },
            {
              $set: {
                status: "suspended",
              },
            },
            { new: true }
          );
        } else {
          console.warn("[StripeWebhook] Failed invoice received with unresolvable organization context:", invoiceNumber);
        }
        break;
      }

      case "invoice.voided": {
        const stripeInvoice = event.data?.object;
        if (!stripeInvoice) break;
        const invoiceNumber = stripeInvoice.number || stripeInvoice.id;
        const customerId =
          typeof stripeInvoice.customer === "string"
            ? stripeInvoice.customer
            : stripeInvoice.customer?.id;
        const subId =
          typeof stripeInvoice.subscription === "string"
            ? stripeInvoice.subscription
            : stripeInvoice.subscription?.id;

        let metaOrgId =
          stripeInvoice.subscription_details?.metadata?.organizationId ||
          stripeInvoice.metadata?.organizationId;

        const sub = subId
          ? await Subscription.findOne({ stripeSubscriptionId: subId })
          : customerId
            ? await Subscription.findOne({ stripeCustomerId: customerId })
            : null;

        if (metaOrgId && sub && sub.organization && metaOrgId !== sub.organization.toString()) {
          console.error(
            `[StripeWebhook] Security Alert: Cross-tenant mismatch in invoice.voided metadata org (${metaOrgId}) vs subscription org (${sub.organization})`
          );
          metaOrgId = sub.organization.toString();
        }

        const orgId = metaOrgId || sub?.organization;

        if (orgId && invoiceNumber) {
          const status = mapStripeInvoiceStatus("void");
          await Invoice.findOneAndUpdate(
            { invoiceNumber },
            {
              $set: {
                organization: orgId,
                invoiceNumber,
                status,
              },
            },
            { upsert: true, new: true }
          );
        } else {
          console.warn("[StripeWebhook] Voided invoice received with unresolvable organization context:", invoiceNumber);
        }
        break;
      }

      default:
        console.log(`[StripeWebhook] Unhandled Stripe event: ${event.type}`);
    }
  } catch (handlerErr) {
    console.error("Error processing Stripe webhook event:", handlerErr);
    return res.status(500).json({ error: "Webhook handler failed" });
  }

  return res.status(200).json({
    received: true,
  });
};