"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BBQ_STYLES, STYLE_LABELS } from "@/lib/constants/styles";

export interface MapFilterState {
  style: string;
  price: string;
  search: string;
}

interface MapFiltersProps {
  filters: MapFilterState;
  onChange: (filters: MapFilterState) => void;
}

export function MapFilters({ filters, onChange }: MapFiltersProps) {
  const update = (key: keyof MapFilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="absolute left-4 top-4 z-[1000] flex flex-col gap-2 w-48">
      <Select value={filters.style} onValueChange={(v) => update("style", v)}>
        <SelectTrigger>
          <SelectValue placeholder="Style" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Styles</SelectItem>
          {BBQ_STYLES.map((s) => (
            <SelectItem key={s} value={s}>
              {STYLE_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.price} onValueChange={(v) => update("price", v)}>
        <SelectTrigger>
          <SelectValue placeholder="Price" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Prices</SelectItem>
          <SelectItem value="1">$</SelectItem>
          <SelectItem value="2">$$</SelectItem>
          <SelectItem value="3">$$$</SelectItem>
          <SelectItem value="4">$$$$</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder="Search spots..."
        value={filters.search}
        onChange={(e) => update("search", e.target.value)}
        className="mt-1"
      />
    </div>
  );
}