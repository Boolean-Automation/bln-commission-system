import React, { useMemo, useState } from "react";
import {
  useListPeople,
  getListPeopleQueryKey,
} from "@workspace/api-client-react";
import { usePositionNames } from "./PositionSelect";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type RuleExclusions = {
  excludePeople?: string[];
  excludeRoles?: string[];
};

function MultiSelect({
  selected,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  ariaLabel,
  onChange,
}: {
  selected: string[];
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  ariaLabel: string;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  // Always surface currently-selected values even if they are no longer in the
  // source list (e.g. a person was removed), so saved exclusions never silently
  // disappear from the editor.
  const allOptions = useMemo(() => {
    const set = new Set(options.filter((o) => o.trim() !== ""));
    for (const s of selected) if (s.trim() !== "") set.add(s);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [options, selected]);

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            className={cn(
              "w-full justify-between font-normal",
              selected.length === 0 && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {selected.length === 0
                ? placeholder
                : `${selected.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {allOptions.map((opt) => {
                  const checked = selected.includes(opt);
                  return (
                    <CommandItem
                      key={opt}
                      value={opt}
                      onSelect={() => toggle(opt)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          checked ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{opt}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1 font-normal">
              {s}
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => toggle(s)}
                className="rounded-sm opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Per-rule exclusion controls shown for EVERY rule instance. Lets an operator
 * skip a rule for jobs whose sales rep or manager is a specific person, or
 * carries a specific role/position. Stored on the rule instance's `appliesTo`
 * and enforced uniformly across all modules by the engine.
 */
export function RuleExclusionsEditor({
  value,
  onChange,
  tenantId,
}: {
  value: RuleExclusions;
  onChange: (next: RuleExclusions) => void;
  tenantId: string;
}) {
  const { data: people = [] } = useListPeople(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListPeopleQueryKey(tenantId) },
  });
  const positionNames = usePositionNames(tenantId);

  const peopleNames = useMemo(() => {
    const set = new Set(people.map((p) => p.name).filter((n) => n.trim() !== ""));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people]);

  const excludePeople = Array.isArray(value.excludePeople)
    ? value.excludePeople
    : [];
  const excludeRoles = Array.isArray(value.excludeRoles)
    ? value.excludeRoles
    : [];

  return (
    <div className="space-y-4 rounded-md border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">Exclusions</p>
        <p className="text-xs text-muted-foreground">
          Skip this rule for jobs whose sales rep or manager matches the people
          or roles below.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Exclude people</Label>
        <MultiSelect
          selected={excludePeople}
          options={peopleNames}
          placeholder="No people excluded"
          searchPlaceholder="Search people…"
          emptyText="No people found."
          ariaLabel="Exclude people"
          onChange={(next) => onChange({ ...value, excludePeople: next })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Exclude roles</Label>
        <MultiSelect
          selected={excludeRoles}
          options={positionNames}
          placeholder="No roles excluded"
          searchPlaceholder="Search roles…"
          emptyText="No roles configured."
          ariaLabel="Exclude roles"
          onChange={(next) => onChange({ ...value, excludeRoles: next })}
        />
      </div>
    </div>
  );
}
