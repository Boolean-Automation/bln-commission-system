import React from "react";
import type { PeriodType } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIOD_TYPE_OPTIONS,
  periodKeyOptions,
  formatPeriodKey,
} from "@/lib/periods";

type Props = {
  periodType: PeriodType;
  periodKey: string;
  onChangeType: (next: PeriodType) => void;
  onChangeKey: (next: string) => void;
};

export function PeriodPicker({
  periodType,
  periodKey,
  onChangeType,
  onChangeKey,
}: Props) {
  const keyOptions = periodKeyOptions(periodType);
  return (
    <div className="flex items-center gap-2">
      <Select
        value={periodType}
        onValueChange={(v) => onChangeType(v as PeriodType)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={periodKey} onValueChange={onChangeKey}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {keyOptions.map((k) => (
            <SelectItem key={k} value={k}>
              {formatPeriodKey(periodType, k)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
