import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export type ColumnOption = { name: string; type: string };

/**
 * Searchable dropdown for picking an Airtable table or column by name.
 *
 * Shared by the Schema Mapping page (FieldMappingEditor) and the Source Data
 * mapping sheets (People / Jobs) so all three surfaces offer the exact same
 * Airtable-sourced picker — no free-text entry, so mappings can't point at a
 * column that doesn't exist.
 */
export function AirtableColumnCombobox({
  value,
  options,
  placeholder,
  emptyText,
  searchPlaceholder = "Search…",
  allowClear,
  disabled,
  onChange,
  invalid,
  className,
}: {
  value: string | null;
  options: ColumnOption[];
  placeholder: string;
  emptyText: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const known = value ? options.some((o) => o.name === value) : true;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-mono text-sm font-normal",
            invalid && "border-destructive bg-destructive/5",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
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
            {allowClear && value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear mapping
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {!known && value && (
                <CommandItem
                  value={value}
                  onSelect={() => setOpen(false)}
                  className="opacity-70"
                >
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  <span className="truncate font-mono">{value}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] uppercase"
                  >
                    not in table
                  </Badge>
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.name}
                  value={opt.name}
                  onSelect={() => {
                    onChange(opt.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate font-mono">{opt.name}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] uppercase tracking-wider"
                  >
                    {opt.type}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
