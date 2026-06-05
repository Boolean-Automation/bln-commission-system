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
import { cn } from "@/lib/utils";
import { PositionSelect, usePositionNames } from "./PositionSelect";

type Obj = Record<string, unknown>;

const PositionNamesContext = React.createContext<string[]>([]);

const SCALAR_TYPES = ["number", "currency", "percent", "text", "select", "position"];
const isScalarField = (f: FieldDef): boolean => SCALAR_TYPES.includes(f.type);
const isTableList = (field: FieldDef): boolean => {
  const itemFields = field.itemFields ?? [];
  return itemFields.length > 0 && itemFields.every(isScalarField);
};

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
    case "position":
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

function PositionCell({
  field,
  value,
  onChange,
  ariaLabel,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ariaLabel: string;
}) {
  const names = React.useContext(PositionNamesContext);
  return (
    <PositionSelect
      names={names}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      placeholder={field.placeholder ?? undefined}
      className="h-8"
    />
  );
}

function PositionField({
  field,
  value,
  onChange,
  id,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  id?: string;
}) {
  const names = React.useContext(PositionNamesContext);
  return (
    <PositionSelect
      names={names}
      value={value}
      onChange={onChange}
      id={id}
      placeholder={field.placeholder ?? undefined}
    />
  );
}

function CellControl({
  field,
  value,
  onChange,
  ariaLabel,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ariaLabel: string;
}) {
  switch (field.type) {
    case "number":
    case "currency": {
      const display =
        value === null || value === undefined || value === ""
          ? ""
          : String(value);
      return (
        <div className="relative">
          {field.type === "currency" && (
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
          )}
          <Input
            type="number"
            inputMode="decimal"
            aria-label={ariaLabel}
            className={cn("h-8", field.type === "currency" && "pl-6")}
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
      );
    }
    case "percent":
      return (
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            aria-label={ariaLabel}
            className="h-8 pr-7"
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
      );
    case "text":
      return (
        <Input
          className="h-8"
          aria-label={ariaLabel}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "position":
      return (
        <PositionCell
          field={field}
          value={value}
          onChange={onChange}
          ariaLabel={ariaLabel}
        />
      );
    case "select": {
      const options = field.options ?? [];
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8" aria-label={ariaLabel}>
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
      );
    }
    default:
      return null;
  }
}

function TableListControl({
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
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {itemFields.map((f) => (
                <th
                  key={f.key}
                  className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"
                >
                  {f.label}
                </th>
              ))}
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={itemFields.length + 1}
                  className="px-2 py-3 text-center text-xs text-muted-foreground"
                >
                  No rows yet
                </td>
              </tr>
            )}
            {items.map((item, i) => (
              <tr key={i} className="border-b last:border-0">
                {itemFields.map((f) => (
                  <td key={f.key} className="px-2 py-1.5 align-top">
                    <CellControl
                      field={f}
                      value={item[f.key]}
                      ariaLabel={`${f.label} (row ${i + 1})`}
                      onChange={(v) =>
                        onChange(
                          items.map((it, idx) =>
                            idx === i ? { ...it, [f.key]: v } : it,
                          ),
                        )
                      }
                    />
                  </td>
                ))}
                <td className="px-1 py-1.5 align-middle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() =>
                      onChange(items.filter((_, idx) => idx !== i))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function ListControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (isTableList(field)) {
    return <TableListControl field={field} value={value} onChange={onChange} />;
  }
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
    case "position": {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {field.label}
          </Label>
          <PositionField
            field={field}
            value={value}
            onChange={onChange}
            id={id}
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
  tenantId,
}: {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  tenantId: string | null | undefined;
}) {
  const names = usePositionNames(tenantId);
  return (
    <PositionNamesContext.Provider value={names}>
      <ObjectForm fields={fields} value={value} onChange={onChange} />
    </PositionNamesContext.Provider>
  );
}
