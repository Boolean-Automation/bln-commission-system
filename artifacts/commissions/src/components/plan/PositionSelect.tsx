import React, { useMemo } from "react";
import {
  useListPositions,
  getListPositionsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Clear sentinel + value prefix. Real position names are namespaced with VALUE_PREFIX
// so an arbitrary name (even literally "__any__") can never collide with CLEAR.
const CLEAR = "__any__";
const VALUE_PREFIX = "v:";
const encode = (name: string) => VALUE_PREFIX + name;
const decode = (v: string) =>
  v === CLEAR ? "" : v.startsWith(VALUE_PREFIX) ? v.slice(VALUE_PREFIX.length) : v;

export function usePositionNames(tenantId: string | null | undefined): string[] {
  const id = tenantId ?? "";
  const { data } = useListPositions(id, {
    query: { enabled: !!id, queryKey: getListPositionsQueryKey(id) },
  });
  return useMemo(() => (data ?? []).map((p) => p.name), [data]);
}

export function PositionSelect({
  names,
  value,
  onChange,
  ariaLabel,
  placeholder,
  id,
  className,
  allowClear = true,
}: {
  names: string[];
  value: unknown;
  onChange: (v: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  id?: string;
  className?: string;
  allowClear?: boolean;
}) {
  const current = typeof value === "string" ? value : "";

  // Always include the current value as an option, even if it is no longer in
  // the configured list, so existing rule params never silently lose their value.
  const options = useMemo(() => {
    const set = new Set(names.filter((n) => n.trim() !== ""));
    if (current.trim() !== "") set.add(current);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [names, current]);

  return (
    <Select
      value={current === "" ? CLEAR : encode(current)}
      onValueChange={(v) => onChange(decode(v))}
    >
      <SelectTrigger id={id} className={cn(className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? "Select position…"} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && (
          <SelectItem value={CLEAR}>{placeholder ?? "Any position"}</SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o} value={encode(o)}>
            {o}
          </SelectItem>
        ))}
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No positions configured yet
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
