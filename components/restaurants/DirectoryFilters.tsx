"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BBQ_STYLES, STYLE_LABELS } from "@/lib/constants/styles";

export function DirectoryFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    router.push(`/directory?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-4">
      <Input
        placeholder="Search by name or city..."
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => update("q", e.target.value)}
        className="max-w-xs"
      />
      <Select defaultValue={params.get("style") ?? "all"} onValueChange={(v) => update("style", v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Style" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Styles</SelectItem>
          {BBQ_STYLES.map((s) => (
            <SelectItem key={s} value={s}>{STYLE_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select defaultValue={params.get("price") ?? "all"} onValueChange={(v) => update("price", v)}>
        <SelectTrigger className="w-32"><SelectValue placeholder="Price" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Prices</SelectItem>
          <SelectItem value="1">$</SelectItem>
          <SelectItem value="2">$$</SelectItem>
          <SelectItem value="3">$$$</SelectItem>
          <SelectItem value="4">$$$$</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}