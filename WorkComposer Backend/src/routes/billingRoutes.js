import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireBillingAccess } from "../middleware/billingAuth.middleware.js";
import {
  changeStripePlan,
  createCheckoutSession,
  getBillingOverview,
  getInvoices,
  getSubscription,
  syncCheckoutSession,
  updateBillingProfile,
} from "../controllers/billing.controller.js";

const router = express.Router();

router.get("/overview", protect, requireBillingAccess, getBillingOverview);
router.get("/subscription", protect, requireBillingAccess, getSubscription);
router.get("/invoices", protect, requireBillingAccess, getInvoices);
router.put("/billing-profile", protect, requireBillingAccess, updateBillingProfile);
router.post("/create-checkout-session", protect, requireBillingAccess, createCheckoutSession);
router.post("/sync-checkout-session", protect, requireBillingAccess, syncCheckoutSession);
router.post("/change-plan", protect, requireBillingAccess, changeStripePlan);

export default router;
