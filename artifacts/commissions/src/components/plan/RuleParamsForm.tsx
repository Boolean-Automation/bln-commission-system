import React from "react";
import type { FieldDef } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

type Obj = Record<string, unknown>;

const pctToDisplay = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v) * 100;
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 1e6) / 1e6);
};
const pctToStore = (raw: string): number => {
  const n = Number(raw) / 100;
  return Math.round(n * 1e8) / 1e8;
};

export function defaultForField(f: FieldDef): unknown {
  switch (f.type) {
    case "number":
    case "currency":
      return f.nullable ? null : 0;
    case "percent":
      return 0;
    case "text":
    case "select":
      return "";
    case "multiselect":
    case "stringlist":
    case "list":
      return [];
    default:
      return null;
  }
}

function buildDefaultObject(fields: FieldDef[]): Obj {
  const out: Obj = {};
  for (const f of fields) out[f.key] = defaultForField(f);
  return out;
}

function StringListControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const items = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{field.label}</Label>
      {field.help && (
        <p className="text-xs text-muted-foreground">{field.help}</p>
      )}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={field.placeholder ?? undefined}
              onChange={(e) =>
                onChange(items.map((v, idx) => (idx === i ? e.target.value : v)))
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
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
        onClick={() => onChange([...items, ""])}
      >
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </div>
  );
}

function ListControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const items = Array.isArray(value) ? (value as Obj[]) : [];
  const itemFields = field.itemFields ?? [];
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{field.label}</Label>
      {field.help && (
        <p className="text-xs text-muted-foreground">{field.help}</p>
      )}
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="relative rounded-md border p-3 pr-10">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1.5 top-1.5"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <ObjectForm
              fields={itemFields}
              value={item}
              onChange={(next) =>
                onChange(items.map((it, idx) => (idx === i ? next : it)))
              }
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, buildDefaultObject(itemFields)])}
      >
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = React.useId();

  switch (field.type) {
    case "number":
    case "currency": {
      const display =
        value === null || value === undefined || value === ""
          ? ""
          : String(value);
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {field.label}
          </Label>
          <div className="relative">
            {field.type === "currency" && (
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
            )}
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              className={field.type === "currency" ? "pl-6" : ""}
              value={display}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              step={field.step ?? "any"}
              placeholder={field.placeholder ?? undefined}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onChange(field.nullable ? null : 0);
                  return;
                }
                onChange(Number(raw));
              }}
            />
          </div>
          {field.help && (
            <p className="text-xs text-muted-foreground">{field.help}</p>
          )}
        </div>
      );
    }
    case "percent": {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {field.label}
          </Label>
          <div className="relative">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              className="pr-7"
              value={pctToDisplay(value)}
              min={field.min ?? undefined}
              step="any"
              placeholder={field.placeholder ?? undefined}
              onChange={(e) => {
                const raw = e.target.value;
                onChange(raw === "" ? 0 : pctToStore(raw));
              }}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          {field.help && (
            <p className="text-xs text-muted-foreground">{field.help}</p>
          )}
        </div>
      );
    }
    case "text": {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {field.label}
          </Label>
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.help && (
            <p className="text-xs text-muted-foreground">{field.help}</p>
          )}
        </div>
      );
    }
    case "select": {
      const options = field.options ?? [];
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {field.label}
          </Label>
          <Select
            value={typeof value === "string" ? value : ""}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help && (
            <p className="text-xs text-muted-foreground">{field.help}</p>
          )}
        </div>
      );
    }
    case "multiselect": {
      const options = field.options ?? [];
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{field.label}</Label>
          <div className="space-y-2 rounded-md border p-3">
            {options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      if (c) onChange([...selected, o.value]);
                      else onChange(selected.filter((v) => v !== o.value));
                    }}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
          {field.help && (
            <p className="text-xs text-muted-foreground">{field.help}</p>
          )}
        </div>
      );
    }
    case "stringlist":
      return (
        <StringListControl field={field} value={value} onChange={onChange} />
      );
    case "list":
      return <ListControl field={field} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

function ObjectForm({
  fields,
  value,
  onChange,
}: {
  fields: FieldDef[];
  value: unknown;
  onChange: (v: Obj) => void;
}) {
  const obj = (value ?? {}) as Obj;
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <FieldControl
          key={f.key}
          field={f}
          value={obj[f.key]}
          onChange={(v) => onChange({ ...obj, [f.key]: v })}
        />
      ))}
    </div>
  );
}

export function RuleParamsForm({
  fields,
  value,
  onChange,
}: {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return <ObjectForm fields={fields} value={value} onChange={onChange} />;
}
