import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

type Obj = Record<string, unknown>;

const CONDITION_FIELDS: { value: string; label: string }[] = [
  { value: "job.totalAmount", label: "Job total ($)" },
  { value: "job.gpAmount", label: "Job gross profit ($)" },
  { value: "job.gpPct", label: "Job gross profit (%)" },
  { value: "job.leadSource", label: "Lead source" },
  { value: "job.status", label: "Job status" },
  { value: "job.customer", label: "Customer" },
  { value: "person.position", label: "Person position" },
  { value: "person.ytdSales", label: "Person YTD sales" },
  { value: "person.roles", label: "Person roles" },
];

const OPS: { value: string; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
];

const pctToDisplay = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v) * 100;
  return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : "";
};
const pctToStore = (raw: string): number =>
  raw === "" ? 0 : Math.round((Number(raw) / 100) * 1e8) / 1e8;

function get(obj: Obj, path: string[], fallback: unknown): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Obj))
      cur = (cur as Obj)[k];
    else return fallback;
  }
  return cur ?? fallback;
}

export function CustomRuleBuilder({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const cfg = value ?? {};
  const recipient = (cfg["recipient"] as Obj) ?? { source: "salesRep" };
  const conditions = Array.isArray(cfg["conditions"])
    ? (cfg["conditions"] as Obj[])
    : [];
  const calculation = (cfg["calculation"] as Obj) ?? { kind: "flat", amount: 0 };
  const calcKind = (calculation["kind"] as string) ?? "flat";

  const patch = (next: Obj) => onChange({ ...cfg, ...next });
  const patchRecipient = (next: Obj) =>
    patch({ recipient: { ...recipient, ...next } });
  const patchCalc = (next: Obj) =>
    patch({ calculation: { ...calculation, ...next } });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Rule label</Label>
        <Input
          value={(cfg["label"] as string) ?? ""}
          placeholder="e.g. Big Job Bonus"
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>

      {/* Recipient */}
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-semibold">Who earns this commission?</p>
        <Select
          value={(recipient["source"] as string) ?? "salesRep"}
          onValueChange={(v) => patchRecipient({ source: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="salesRep">The sales rep on the job</SelectItem>
            <SelectItem value="manager">The manager on the job</SelectItem>
            <SelectItem value="match">
              People matched by position or role
            </SelectItem>
          </SelectContent>
        </Select>
        {recipient["source"] === "match" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Position contains
              </Label>
              <Input
                value={(recipient["positionContains"] as string) ?? ""}
                placeholder="e.g. sales manager"
                onChange={(e) =>
                  patchRecipient({ positionContains: e.target.value })
                }
              />
            </div>
            <StringList
              label="Match roles"
              value={
                Array.isArray(recipient["rolesInclude"])
                  ? (recipient["rolesInclude"] as string[])
                  : []
              }
              placeholder="e.g. SM"
              onChange={(v) => patchRecipient({ rolesInclude: v })}
            />
          </div>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-3 rounded-md border p-3">
        <div>
          <p className="text-sm font-semibold">Conditions</p>
          <p className="text-xs text-muted-foreground">
            All conditions must match for the commission to apply. Leave empty
            to apply to every job.
          </p>
        </div>
        <div className="space-y-2">
          {conditions.map((cond, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={(cond["field"] as string) ?? CONDITION_FIELDS[0]!.value}
                onValueChange={(v) =>
                  patch({
                    conditions: conditions.map((c, idx) =>
                      idx === i ? { ...c, field: v } : c,
                    ),
                  })
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={(cond["op"] as string) ?? "eq"}
                onValueChange={(v) =>
                  patch({
                    conditions: conditions.map((c, idx) =>
                      idx === i ? { ...c, op: v } : c,
                    ),
                  })
                }
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-[140px]"
                value={
                  cond["value"] === undefined || cond["value"] === null
                    ? ""
                    : String(cond["value"])
                }
                placeholder="value"
                onChange={(e) =>
                  patch({
                    conditions: conditions.map((c, idx) =>
                      idx === i ? { ...c, value: e.target.value } : c,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  patch({
                    conditions: conditions.filter((_, idx) => idx !== i),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            patch({
              conditions: [
                ...conditions,
                { field: CONDITION_FIELDS[0]!.value, op: "eq", value: "" },
              ],
            })
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add condition
        </Button>
      </div>

      {/* Calculation */}
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-semibold">How is the amount calculated?</p>
        <Select
          value={calcKind}
          onValueChange={(v) => {
            if (v === "flat") patch({ calculation: { kind: "flat", amount: 0 } });
            else if (v === "percent")
              patch({
                calculation: { kind: "percent", field: "totalAmount", rate: 0 },
              });
            else
              patch({
                calculation: {
                  kind: "tiered",
                  basisField: "totalAmount",
                  tiers: [{ upTo: null, rate: 0 }],
                },
              });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flat">Flat amount</SelectItem>
            <SelectItem value="percent">Percentage of a field</SelectItem>
            <SelectItem value="tiered">Tiered by YTD sales</SelectItem>
          </SelectContent>
        </Select>

        {calcKind === "flat" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                className="pl-6"
                value={String(get(calculation, ["amount"], 0))}
                onChange={(e) =>
                  patchCalc({
                    amount: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        )}

        {calcKind === "percent" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Of field</Label>
              <Select
                value={(calculation["field"] as string) ?? "totalAmount"}
                onValueChange={(v) => patchCalc({ field: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="totalAmount">Job total</SelectItem>
                  <SelectItem value="gpAmount">Job gross profit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rate</Label>
              <div className="relative">
                <Input
                  type="number"
                  className="pr-7"
                  value={pctToDisplay(calculation["rate"])}
                  onChange={(e) => patchCalc({ rate: pctToStore(e.target.value) })}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>
        )}

        {calcKind === "tiered" && (
          <TieredCalc value={calculation} onChange={patchCalc} />
        )}
      </div>

      {/* Gate */}
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Respect the GP gatekeeper floor</p>
          <p className="text-xs text-muted-foreground">
            Zero this commission on jobs below the GP floor.
          </p>
        </div>
        <Switch
          checked={cfg["respectGate"] === true}
          onCheckedChange={(c) => patch({ respectGate: c })}
        />
      </div>
    </div>
  );
}

function TieredCalc({
  value,
  onChange,
}: {
  value: Obj;
  onChange: (next: Obj) => void;
}) {
  const tiers = Array.isArray(value["tiers"]) ? (value["tiers"] as Obj[]) : [];
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Basis</Label>
        <Select
          value={(value["basisField"] as string) ?? "totalAmount"}
          onValueChange={(v) => onChange({ basisField: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="totalAmount">Job total</SelectItem>
            <SelectItem value="gpAmount">Job gross profit</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Label className="text-xs font-medium">Tiers (lowest YTD first)</Label>
      <div className="space-y-2">
        {tiers.map((tier, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                YTD up to ($)
              </Label>
              <Input
                type="number"
                placeholder="blank = no cap"
                value={
                  tier["upTo"] === null || tier["upTo"] === undefined
                    ? ""
                    : String(tier["upTo"])
                }
                onChange={(e) =>
                  onChange({
                    tiers: tiers.map((t, idx) =>
                      idx === i
                        ? {
                            ...t,
                            upTo:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : t,
                    ),
                  })
                }
              />
            </div>
            <div className="w-[110px] space-y-1">
              <Label className="text-[11px] text-muted-foreground">Rate</Label>
              <div className="relative">
                <Input
                  type="number"
                  className="pr-7"
                  value={pctToDisplay(tier["rate"])}
                  onChange={(e) =>
                    onChange({
                      tiers: tiers.map((t, idx) =>
                        idx === i
                          ? { ...t, rate: pctToStore(e.target.value) }
                          : t,
                      ),
                    })
                  }
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                onChange({ tiers: tiers.filter((_, idx) => idx !== i) })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ tiers: [...tiers, { upTo: null, rate: 0 }] })
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add tier
      </Button>
    </div>
  );
}

function StringList({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              onChange={(e) =>
                onChange(value.map((v, idx) => (idx === i ? e.target.value : v)))
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, ""])}
      >
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </div>
  );
}
