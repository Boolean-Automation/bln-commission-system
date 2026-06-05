import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  variablesForRule,
  type FormulaVariable,
  type ManualVariable,
} from "@workspace/rule-validation";
import { PositionSelect, usePositionNames } from "./PositionSelect";

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
  tenantId,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  tenantId: string | null | undefined;
}) {
  const positionNames = usePositionNames(tenantId);
  const cfg = value ?? {};
  const recipient = (cfg["recipient"] as Obj) ?? { source: "salesRep" };
  const conditions = Array.isArray(cfg["conditions"])
    ? (cfg["conditions"] as Obj[])
    : [];
  const calculation = (cfg["calculation"] as Obj) ?? { kind: "flat", amount: 0 };
  const calcKind = (calculation["kind"] as string) ?? "flat";
  const manualVars = Array.isArray(cfg["manualVars"])
    ? (cfg["manualVars"] as Obj[])
    : [];
  const availableVars = React.useMemo(
    () =>
      variablesForRule(
        manualVars
          .filter((m) => typeof m["key"] === "string")
          .map((m) => ({
            key: m["key"] as string,
            label: m["label"] as string | undefined,
            value: Number(m["value"]) || 0,
          })) as ManualVariable[],
      ),
    [manualVars],
  );

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
              <Label className="text-xs font-medium">Position</Label>
              <PositionSelect
                names={positionNames}
                value={(recipient["positionContains"] as string) ?? ""}
                onChange={(v) => patchRecipient({ positionContains: v })}
                placeholder="Any position"
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
              {cond["field"] === "person.position" ? (
                <div className="w-[140px]">
                  <PositionSelect
                    names={positionNames}
                    value={
                      cond["value"] === undefined || cond["value"] === null
                        ? ""
                        : String(cond["value"])
                    }
                    placeholder="Any position"
                    onChange={(v) =>
                      patch({
                        conditions: conditions.map((c, idx) =>
                          idx === i ? { ...c, value: v } : c,
                        ),
                      })
                    }
                  />
                </div>
              ) : (
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
              )}
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
            else if (v === "tiered")
              patch({
                calculation: {
                  kind: "tiered",
                  basisField: "totalAmount",
                  tiers: [{ upTo: null, rate: 0 }],
                },
              });
            else if (v === "formula")
              patch({ calculation: { kind: "formula", expression: "" } });
            else
              patch({
                calculation: {
                  kind: "conditional",
                  branches: [
                    {
                      when: {
                        field: CONDITION_FIELDS[0]!.value,
                        op: "gt",
                        value: "",
                      },
                      result: { kind: "percent", field: "totalAmount", rate: 0 },
                    },
                  ],
                  otherwise: { kind: "flat", amount: 0 },
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
            <SelectItem value="formula">Formula (with @ variables)</SelectItem>
            <SelectItem value="conditional">
              Conditional (if / then / otherwise)
            </SelectItem>
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

        {calcKind === "formula" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Formula</Label>
            <FormulaInput
              value={(calculation["expression"] as string) ?? ""}
              onChange={(v) => patchCalc({ expression: v })}
              variables={availableVars}
              placeholder="e.g. @job.gpAmount * 0.1 + 100"
            />
          </div>
        )}

        {calcKind === "conditional" && (
          <ConditionalCalc
            value={calculation}
            onChange={patchCalc}
            variables={availableVars}
            positionNames={positionNames}
          />
        )}
      </div>

      {/* Manual inputs */}
      <ManualVarsEditor
        value={manualVars}
        onChange={(v) => patch({ manualVars: v })}
      />

      {/* Forecast / weighting */}
      <ForecastEditor
        value={(cfg["forecast"] as Obj) ?? null}
        onChange={(v) => patch({ forecast: v })}
      />

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

// ── Formula input with `@` variable autocomplete ────────────────────────────
// A plain textarea that, when the admin types `@`, surfaces a filtered dropdown
// of the available variables (built-in job/person fields + this rule's manual
// inputs). Selecting one inserts its `@token`. Keyboard: ↑/↓ to move, Enter/Tab
// to insert, Esc to dismiss.
function FormulaInput({
  value,
  onChange,
  variables,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  variables: FormulaVariable[];
  placeholder?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [triggerStart, setTriggerStart] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    return variables.filter(
      (v) =>
        v.path.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
    );
  }, [variables, query]);

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/@([a-zA-Z0-9_.]*)$/);
    if (m) {
      setTriggerStart(caret - m[0].length);
      setQuery(m[1] ?? "");
      setActiveIndex(0);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const insert = (v: FormulaVariable) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, triggerStart);
    const after = value.slice(caret);
    const next = `${before}${v.token} ${after}`;
    onChange(next);
    setOpen(false);
    const pos = before.length + v.token.length + 1;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={2}
        className="font-mono text-sm"
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => {
          const el = e.currentTarget;
          detect(el.value, el.selectionStart ?? el.value.length);
        }}
        onClick={(e) => {
          const el = e.currentTarget;
          detect(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % filtered.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(filtered[activeIndex]!);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
        onBlur={() => requestAnimationFrame(() => setOpen(false))}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.map((v, i) => (
            <button
              type="button"
              key={v.token}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(v);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="font-mono text-xs">{v.token}</span>
              <span className="truncate text-xs text-muted-foreground">
                {v.label}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Type <span className="font-mono">@</span> to insert a field. Supports{" "}
        <span className="font-mono">+ - * / %</span>, parentheses, and{" "}
        <span className="font-mono">min, max, abs, round, floor, ceil</span>.
      </p>
    </div>
  );
}

// ── Result calculation (leaf): flat / percent / formula ─────────────────────
function ResultCalcEditor({
  value,
  onChange,
  variables,
}: {
  value: Obj;
  onChange: (next: Obj) => void;
  variables: FormulaVariable[];
}) {
  const kind = (value["kind"] as string) ?? "flat";
  return (
    <div className="space-y-2">
      <Select
        value={kind}
        onValueChange={(v) => {
          if (v === "flat") onChange({ kind: "flat", amount: 0 });
          else if (v === "percent")
            onChange({ kind: "percent", field: "totalAmount", rate: 0 });
          else onChange({ kind: "formula", expression: "" });
        }}
      >
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="flat">Flat amount</SelectItem>
          <SelectItem value="percent">Percentage of a field</SelectItem>
          <SelectItem value="formula">Formula</SelectItem>
        </SelectContent>
      </Select>

      {kind === "flat" && (
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            className="pl-6"
            value={String(get(value, ["amount"], 0))}
            onChange={(e) =>
              onChange({
                ...value,
                amount: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
        </div>
      )}

      {kind === "percent" && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={(value["field"] as string) ?? "totalAmount"}
            onValueChange={(v) => onChange({ ...value, field: v })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="totalAmount">Job total</SelectItem>
              <SelectItem value="gpAmount">Job gross profit</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Input
              type="number"
              className="pr-7"
              value={pctToDisplay(value["rate"])}
              onChange={(e) =>
                onChange({ ...value, rate: pctToStore(e.target.value) })
              }
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>
      )}

      {kind === "formula" && (
        <FormulaInput
          value={(value["expression"] as string) ?? ""}
          onChange={(v) => onChange({ ...value, expression: v })}
          variables={variables}
          placeholder="e.g. @job.gpAmount * 0.1"
        />
      )}
    </div>
  );
}

// ── Conditional calculation: ordered if/then branches + otherwise ───────────
function ConditionalCalc({
  value,
  onChange,
  variables,
  positionNames,
}: {
  value: Obj;
  onChange: (next: Obj) => void;
  variables: FormulaVariable[];
  positionNames: string[];
}) {
  const branches = Array.isArray(value["branches"])
    ? (value["branches"] as Obj[])
    : [];
  const otherwise = (value["otherwise"] as Obj) ?? { kind: "flat", amount: 0 };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Branches are checked in order; the first matching branch wins. If none
        match, the “otherwise” result is used.
      </p>
      <div className="space-y-3">
        {branches.map((branch, i) => {
          const when = (branch["when"] as Obj) ?? {};
          const result = (branch["result"] as Obj) ?? { kind: "flat", amount: 0 };
          return (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {i === 0 ? "If" : "Else if"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    onChange({
                      ...value,
                      branches: branches.filter((_, idx) => idx !== i),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <ConditionRow
                cond={when}
                positionNames={positionNames}
                onChange={(c) =>
                  onChange({
                    ...value,
                    branches: branches.map((b, idx) =>
                      idx === i ? { ...b, when: c } : b,
                    ),
                  })
                }
              />
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Then pay
                </Label>
                <ResultCalcEditor
                  value={result}
                  variables={variables}
                  onChange={(r) =>
                    onChange({
                      ...value,
                      branches: branches.map((b, idx) =>
                        idx === i ? { ...b, result: r } : b,
                      ),
                    })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({
            ...value,
            branches: [
              ...branches,
              {
                when: { field: CONDITION_FIELDS[0]!.value, op: "gt", value: "" },
                result: { kind: "flat", amount: 0 },
              },
            ],
          })
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add branch
      </Button>
      <div className="space-y-1.5 rounded-md border border-dashed p-3">
        <Label className="text-xs font-semibold">Otherwise pay</Label>
        <ResultCalcEditor
          value={otherwise}
          variables={variables}
          onChange={(r) => onChange({ ...value, otherwise: r })}
        />
      </div>
    </div>
  );
}

// ── A single field/op/value condition row (used by branches) ────────────────
function ConditionRow({
  cond,
  positionNames,
  onChange,
}: {
  cond: Obj;
  positionNames: string[];
  onChange: (next: Obj) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={(cond["field"] as string) ?? CONDITION_FIELDS[0]!.value}
        onValueChange={(v) => onChange({ ...cond, field: v })}
      >
        <SelectTrigger className="h-8 flex-1">
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
        onValueChange={(v) => onChange({ ...cond, op: v })}
      >
        <SelectTrigger className="h-8 w-[110px]">
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
      {cond["field"] === "person.position" ? (
        <div className="w-[140px]">
          <PositionSelect
            names={positionNames}
            value={
              cond["value"] === undefined || cond["value"] === null
                ? ""
                : String(cond["value"])
            }
            placeholder="Any position"
            onChange={(v) => onChange({ ...cond, value: v })}
          />
        </div>
      ) : (
        <Input
          className="h-8 w-[140px]"
          value={
            cond["value"] === undefined || cond["value"] === null
              ? ""
              : String(cond["value"])
          }
          placeholder="value"
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
        />
      )}
    </div>
  );
}

// ── Manual inputs: admin-named numeric constants usable as @manual.<key> ─────
function ManualVarsEditor({
  value,
  onChange,
}: {
  value: Obj[];
  onChange: (v: Obj[]) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-semibold">Manual inputs</p>
        <p className="text-xs text-muted-foreground">
          Named numbers (e.g. a quota or bonus pool) you can reference in
          formulas as <span className="font-mono">@manual.&lt;name&gt;</span>.
        </p>
      </div>
      <div className="space-y-2">
        {value.map((mv, i) => {
          const key = (mv["key"] as string) ?? "";
          return (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">Name</Label>
                <Input
                  className="h-8 font-mono text-sm"
                  value={key}
                  placeholder="quota"
                  onChange={(e) =>
                    onChange(
                      value.map((m, idx) =>
                        idx === i ? { ...m, key: e.target.value } : m,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Label (optional)
                </Label>
                <Input
                  className="h-8"
                  value={(mv["label"] as string) ?? ""}
                  placeholder="Monthly quota"
                  onChange={(e) =>
                    onChange(
                      value.map((m, idx) =>
                        idx === i ? { ...m, label: e.target.value } : m,
                      ),
                    )
                  }
                />
              </div>
              <div className="w-[120px] space-y-1">
                <Label className="text-[11px] text-muted-foreground">Value</Label>
                <Input
                  className="h-8"
                  type="number"
                  value={
                    mv["value"] === undefined || mv["value"] === null
                      ? ""
                      : String(mv["value"])
                  }
                  onChange={(e) =>
                    onChange(
                      value.map((m, idx) =>
                        idx === i
                          ? {
                              ...m,
                              value:
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value),
                            }
                          : m,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { key: "", label: "", value: 0 }])}
      >
        <Plus className="h-4 w-4 mr-1" /> Add manual input
      </Button>
    </div>
  );
}

// ── Forecast / weighting: book pipeline (open) jobs at a weighted rate ───────
function ForecastEditor({
  value,
  onChange,
}: {
  value: Obj | null;
  onChange: (v: Obj) => void;
}) {
  const enabled = value?.["enabled"] === true;
  const openStatuses = Array.isArray(value?.["openStatuses"])
    ? (value!["openStatuses"] as string[])
    : ["open"];
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Forecast pipeline / open deals</p>
          <p className="text-xs text-muted-foreground">
            Book open jobs at a weighted fraction of full commission. Off by
            default; closed/completed jobs are never weighted.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(c) =>
            onChange({
              enabled: c,
              weightPct:
                typeof value?.["weightPct"] === "number"
                  ? (value!["weightPct"] as number)
                  : 0.5,
              openStatuses,
            })
          }
        />
      </div>
      {enabled && (
        <div className="space-y-3">
          <div className="w-[140px] space-y-1.5">
            <Label className="text-xs font-medium">Weight</Label>
            <div className="relative">
              <Input
                type="number"
                className="pr-7"
                value={pctToDisplay(value?.["weightPct"])}
                onChange={(e) =>
                  onChange({
                    ...(value ?? {}),
                    enabled: true,
                    openStatuses,
                    weightPct: pctToStore(e.target.value),
                  })
                }
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <StringList
            label="Open / pipeline job statuses"
            value={openStatuses}
            placeholder="e.g. open"
            onChange={(v) =>
              onChange({
                ...(value ?? {}),
                enabled: true,
                weightPct:
                  typeof value?.["weightPct"] === "number"
                    ? (value!["weightPct"] as number)
                    : 0.5,
                openStatuses: v,
              })
            }
          />
        </div>
      )}
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
