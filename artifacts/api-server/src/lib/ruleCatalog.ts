export type RuleModuleDef = {
  key: string;
  name: string;
  category: string;
  description: string;
  summary: string;
  paramsSchema: Record<string, unknown>;
};

// The library of configurable commission rule modules. Tenants compose a plan
// out of instances of these modules with tenant-specific params.
export const RULE_MODULES: RuleModuleDef[] = [
  {
    key: "tiered_ytd_rate",
    name: "Tiered YTD Rate",
    category: "Sales",
    description:
      "Pays a sales-lead commission as a percentage of the job total. The rate steps up as the salesperson's year-to-date sales cross configured thresholds, and the tier table can differ by service-line position.",
    summary: "Rate scales with YTD sales tier x job total",
    paramsSchema: {
      basis: { type: "string", enum: ["totalAmount"], default: "totalAmount" },
      positions: {
        type: "array",
        description: "One tier table per position (e.g. Sales Level 1, Sales Level 2)",
        items: {
          position: "string",
          tiers: "array of { ytdUpTo: number|null, rate: number }",
        },
      },
    },
  },
  {
    key: "gp_gatekeeper",
    name: "GP Gatekeeper",
    category: "Eligibility",
    description:
      "Suppresses commissions on jobs whose gross-profit percentage falls below a floor. Jobs under the floor produce a zero-dollar, gated entry so the suppression is auditable.",
    summary: "Zeroes commissions when job GP% is below the floor",
    paramsSchema: {
      floorPct: { type: "number", default: 40 },
      gatedTypes: {
        type: "array",
        items: { type: "string" },
        default: ["SL", "SM", "PM", "PMM"],
      },
    },
  },
  {
    key: "sm_cut",
    name: "Sales Manager Override",
    category: "Sales",
    description:
      "Pays every sales manager an override percentage of each qualifying job total. Managers are matched by position substring and/or role, optionally excluding jobs sold by named individuals (e.g. an owner-sold job). A legacy single managerName is still honored when no matcher is set.",
    summary: "Override % of job total for every sales manager",
    paramsSchema: {
      rate: { type: "number", default: 0.0075 },
      positionContains: { type: "string", default: "sales manager" },
      rolesInclude: { type: "array", items: { type: "string" }, default: [] },
      managerName: { type: "string" },
      excludeSoldBy: { type: "array", items: { type: "string" }, default: [] },
    },
  },
  {
    key: "pm_gp_rate",
    name: "Project Manager GP Rate",
    category: "Production",
    description:
      "Pays a project manager (or PM manager) a percentage of the project's gross-profit dollars for jobs they manage.",
    summary: "Percentage of project gross-profit dollars",
    paramsSchema: {
      rate: { type: "number", default: 0.02 },
      type: { type: "string", enum: ["PM", "PMM"], default: "PM" },
    },
  },
  {
    key: "review_bonus",
    name: "Five-Star Review Bonus",
    category: "Bonus",
    description:
      "Pays a flat bonus for each five-star customer review linked to a person's job.",
    summary: "Flat bonus per linked five-star review",
    paramsSchema: {
      amountPerReview: { type: "number", default: 50 },
    },
  },
  {
    key: "referral_bonus",
    name: "Referral Bonus",
    category: "Bonus",
    description:
      "Pays a flat referral bonus on referral-sourced jobs, excluding roles that are already compensated on the sale.",
    summary: "Flat bonus on referral-sourced jobs",
    paramsSchema: {
      amount: { type: "number", default: 50 },
      excludeRoles: {
        type: "array",
        items: { type: "string" },
        default: ["SL", "SM"],
      },
    },
  },
];

export const RULE_MODULE_BY_KEY = new Map(
  RULE_MODULES.map((m) => [m.key, m] as const),
);
