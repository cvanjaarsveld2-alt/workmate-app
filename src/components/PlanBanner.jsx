// ─── Plan banners ─────────────────────────────────────────────────────────────
// Trial days left (for the company's owner/admins), read-only notice (everyone)
// and the suspended screen. Contact goes through Help (support inbox).
import React from "react";
import { Clock, Lock } from "lucide-react";
import { FEATURES, trialDaysLeft } from "../lib/plan";
import { PRODUCT_NAME } from "../lib/brand";
import { BRAND } from "../lib/constants";
import { Btn, Card } from "./ui";

export function PlanBanner({ plan, isAdmin, onHelp, onPlan = onHelp }) {
  if (!plan) return null;
  if (plan.access === "read_only")
    return (
      <div role="status" className="mx-auto max-w-2xl mt-3 mx-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2 items-start">
        <Lock size={16} className="shrink-0 mt-0.5" />
        <span className="flex-1">
          {plan.status === "past_due" ? "Your account is overdue." : "Your free trial has ended."} You can still view and export your data, but not add or change
          anything.{" "}
          <button type="button" onClick={isAdmin ? onPlan : onHelp} className="font-bold underline">
            {isAdmin ? "Choose a plan" : "Contact us"}
          </button>
        </span>
      </div>
    );
  const days = trialDaysLeft(plan);
  if (isAdmin && days !== null)
    return (
      <div role="status" className="mx-auto max-w-2xl mt-3 mx-4 rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-900 flex gap-2 items-center">
        <Clock size={16} className="shrink-0" />
        <span className="flex-1">
          Free trial: <b>{days} day{days === 1 ? "" : "s"} left</b>.
        </span>
        <button type="button" onClick={onPlan} className="font-bold underline shrink-0">
          Choose a plan
        </button>
      </div>
    );
  return null;
}

export function SuspendedScreen({ onHelp, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BRAND.light }}>
      <Card className="w-full max-w-sm p-6 stack-y-3 text-center">
        <Lock size={32} className="mx-auto" style={{ color: BRAND.primary }} />
        <p className="text-xl font-black text-slate-900">Account on hold</p>
        <p className="text-sm text-slate-500">
          Your company's {PRODUCT_NAME} account is on hold. Your data is safe. Contact us to reactivate it.
        </p>
        <Btn className="w-full" onClick={onHelp}>
          Contact us
        </Btn>
        <button type="button" onClick={onSignOut} className="w-full text-sm font-bold text-slate-500 min-h-[44px]">
          Sign out
        </button>
      </Card>
    </div>
  );
}

// A screen the company's plan doesn't include.
export function LockedFeature({ feature, canUpgrade, onPlan }) {
  const label = FEATURES[feature]?.label || "This feature";
  return (
    <Card className="p-6 stack-y-3 text-center">
      <Lock size={28} className="mx-auto" style={{ color: BRAND.primary }} />
      <p className="text-lg font-black text-slate-900">{label} isn't in your plan</p>
      <p className="text-sm text-slate-500">
        {canUpgrade ? "Upgrade your company's plan to use it. Your data stays as it is." : "Ask your company's master account to upgrade the plan."}
      </p>
      <Btn className="w-full" onClick={onPlan}>
        {canUpgrade ? "See plans" : "See what's included"}
      </Btn>
    </Card>
  );
}
