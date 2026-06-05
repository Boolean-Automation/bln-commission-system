// A form-drivable field descriptor. The web builder renders a control per field
// from this metadata, so rule params never have to be hand-edited as JSON.
export type FieldDef = {
  key: string;
  label: string;
  type:
    | "number"
    | "percent"
    | "currency"
    | "text"
    | "select"
    | "multiselect"
    | "stringlist"
    | "list"
    | "position";
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  nullable?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  itemFields?: FieldDef[];
};

export type RuleModuleDef = {
  key: string;
  name: string;
  category: string;
  description: string;
  summary: string;
  // "fields" → render controls from `fields`. "custom" → render the dedicated
  // custom-rule builder (recipient / conditions / calculation).
  builder: "fields" | "custom";
  fields: FieldDef[];
  // Initial params applied when this module is added to a plan.
  defaultParams: Record<string, unknown>;
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
    builder: "fields",
    fields: [
      {
        key: "basis",
        label: "Commission basis",
        type: "select",
        help: "What the rate is applied to.",
        options: [{ value: "totalAmount", label: "Job total" }],
      },
      {
        key: "positions",
        label: "Tier tables by position",
        type: "list",
        help: "One tier table per position. A salesperson is matched to the table for their position.",
        itemFields: [
          {
            key: "position",
            label: "Position name",
            type: "position",
            placeholder: "Any position (default table)",
            help: "Leave blank to use this as the default tier table for any position.",
          },
          {
            key: "tiers",
            label: "Tiers (lowest YTD first)",
            type: "list",
            itemFields: [
              {
                key: "ytdUpTo",
                label: "YTD up to ($)",
                type: "number",
                nullable: true,
                placeholder: "blank = no cap",
                min: 0,
              },
              { key: "rate", label: "Rate", type: "percent", min: 0 },
            ],
          },
        ],
      },
    ],
    defaultParams: {
      basis: "totalAmount",
      positions: [
        { position: "", tiers: [{ ytdUpTo: null, rate: 0.03 }] },
      ],
    },
  },
  {
    key: "gp_gatekeeper",
    name: "GP Gatekeeper",
    category: "Eligibility",
    description:
      "Suppresses commissions on jobs whose gross-profit percentage falls below a floor. Jobs under the floor produce a zero-dollar, gated entry so the suppression is auditable.",
    summary: "Zeroes commissions when job GP% is below the floor",
    builder: "fields",
    fields: [
      {
        key: "floorPct",
        label: "GP floor (%)",
        type: "number",
        help: "Jobs with gross-profit % below this are gated to $0.",
        min: 0,
        max: 100,
      },
      {
        key: "gatedTypes",
        label: "Applies to commission types",
        type: "multiselect",
        options: [
          { value: "SL", label: "Sales Lead (SL)" },
          { value: "SM", label: "Sales Manager (SM)" },
          { value: "PM", label: "Project Manager (PM)" },
          { value: "PMM", label: "Production Manager (PMM)" },
        ],
      },
    ],
    defaultParams: {
      floorPct: 40,
      gatedTypes: ["SL", "SM", "PM", "PMM"],
    },
  },
  {
    key: "sm_cut",
    name: "Sales Manager Override",
    category: "Sales",
    description:
      "Pays every sales manager an override percentage of each qualifying job total. Managers are matched by position substring and/or role, optionally excluding jobs sold by named individuals (e.g. an owner-sold job). A legacy single managerName is still honored when no matcher is set.",
    summary: "Override % of job total for every sales manager",
    builder: "fields",
    fields: [
      { key: "rate", label: "Override rate", type: "percent", min: 0 },
      {
        key: "positionContains",
        label: "Match position",
        type: "position",
        help: "Anyone whose position contains this text qualifies.",
        placeholder: "e.g. sales manager",
      },
      {
        key: "rolesInclude",
        label: "Match roles",
        type: "stringlist",
        help: "Anyone with one of these roles also qualifies.",
      },
      {
        key: "managerName",
        label: "Specific manager (optional)",
        type: "text",
        help: "Only used when no position/role match is set.",
      },
      {
        key: "excludeSoldBy",
        label: "Exclude jobs sold by",
        type: "stringlist",
        help: "Skip the override on jobs sold by these people.",
      },
    ],
    defaultParams: {
      rate: 0.0075,
      positionContains: "sales manager",
      rolesInclude: [],
      excludeSoldBy: [],
    },
  },
  {
    key: "pm_gp_rate",
    name: "Project Manager GP Rate",
    category: "Production",
    description:
      "Pays a project manager (or PM manager) a percentage of the project's gross-profit dollars for jobs they manage.",
    summary: "Percentage of project gross-profit dollars",
    builder: "fields",
    fields: [
      { key: "rate", label: "Rate", type: "percent", min: 0 },
      {
        key: "type",
        label: "Commission type",
        type: "select",
        options: [
          { value: "PM", label: "Project Manager (PM)" },
          { value: "PMM", label: "Production Manager (PMM)" },
        ],
      },
    ],
    defaultParams: { rate: 0.02, type: "PM" },
  },
  {
    key: "review_bonus",
    name: "Five-Star Review Bonus",
    category: "Bonus",
    description:
      "Pays a flat bonus for each five-star customer review linked to a person's job.",
    summary: "Flat bonus per linked five-star review",
    builder: "fields",
    fields: [
      {
        key: "amountPerReview",
        label: "Bonus per review",
        type: "currency",
        min: 0,
      },
    ],
    defaultParams: { amountPerReview: 50 },
  },
  {
    key: "referral_bonus",
    name: "Referral Bonus",
    category: "Bonus",
    description:
      "Pays a flat referral bonus on referral-sourced jobs, excluding roles that are already compensated on the sale.",
    summary: "Flat bonus on referral-sourced jobs",
    builder: "fields",
    fields: [
      { key: "amount", label: "Bonus amount", type: "currency", min: 0 },
      {
        key: "excludeRoles",
        label: "Exclude roles",
        type: "stringlist",
        help: "Roles already paid on the sale are skipped.",
      },
    ],
    defaultParams: { amount: 50, excludeRoles: ["SL", "SM"] },
  },
  {
    key: "custom",
    name: "Custom Rule",
    category: "Custom",
    description:
      "Build a rule from scratch: choose who earns it, set conditions on job and person data, and define how the amount is calculated — flat, percentage of a field, tiered by YTD sales, a free-form formula with @-variables, or conditional if/then branches. Optionally weight pipeline (open) deals for forecasting.",
    summary: "Define your own recipient, conditions, and calculation",
    builder: "custom",
    fields: [],
    defaultParams: {
      label: "Custom rule",
      recipient: { source: "salesRep" },
      conditions: [],
      calculation: { kind: "flat", amount: 0 },
      respectGate: false,
    },
  },
];

export const RULE_MODULE_BY_KEY = new Map(
  RULE_MODULES.map((m) => [m.key, m] as const),
);
