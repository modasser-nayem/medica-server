import Stripe from "stripe";
import config from "./index";

const stripe = new Stripe(config.stripe.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
  appInfo: { name: "Medica Health Care" },
});

export default stripe;
