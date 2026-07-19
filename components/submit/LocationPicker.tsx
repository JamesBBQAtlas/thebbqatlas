"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search } from "lucide-react";

export interface LocationData {
  address: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: LocationData | null;
  onChange: (location: LocationData) => void;
}

const LocationMap = dynamic(
  () => import("@/components/submit/LocationMap").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 rounded-lg bg-black/40 animate-pulse flex items-center justify-center text-white/40 text-sm">
        Loading map...
      </div>
    ),
  }
);

function parseNominatimResult(item: {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}): LocationData {
  const addr = item.address ?? {};
  const city =
    addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? "";
  const country = addr.country ?? "";
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
  const address = street || item.display_name.split(",").slice(0, 2).join(",");

  return {
    address: address.trim(),
    city,
    country,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  };
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationData[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchAddress = useCallback(async (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSuggestions(data.map(parseNominatimResult));
        setShowSuggestions(true);
      }
    } catch {
      setSuggestions([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 3) searchAddress(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, searchAddress]);

  const handleMapClick = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data?.lat) {
        onChange(
          parseNominatimResult({
            display_name: data.display_name,
            lat: String(data.lat),
            lon: String(data.lon),
            address: data.address,
          })
        );
        setQuery(data.display_name?.split(",").slice(0, 3).join(",") ?? "");
      } else {
        onChange({
          address: value?.address ?? "",
          city: value?.city ?? "",
          country: value?.country ?? "",
          lat,
          lng,
        });
      }
    } catch {
      onChange({
        address: value?.address ?? "",
        city: value?.city ?? "",
        country: value?.country ?? "",
        lat,
        lng,
      });
    }
    setShowSuggestions(false);
  };

  const selectSuggestion = (loc: LocationData) => {
    onChange(loc);
    setQuery([loc.address, loc.city, loc.country].filter(Boolean).join(", "));
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="location-search">Find Location *</Label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            id="location-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search address, city, or restaurant location..."
            className="pl-10"
          />
        </div>
        {searching && <p className="text-xs text-white/40 mt-1">Searching...</p>}
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full rounded-md border border-white/20 bg-brand-black shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
                  onClick={() => selectSuggestion(s)}
                >
                  {[s.address, s.city, s.country].filter(Boolean).join(", ")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label>Drop a Pin on the Map *</Label>
        <p className="text-xs text-white/50 mb-2">Click the map to set the exact location, or use search above.</p>
        <LocationMap
          lat={value?.lat ?? 30.27}
          lng={value?.lng ?? -97.74}
          onLocationSelect={handleMapClick}
        />
      </div>

      {value && (
        <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-brand-gold shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{value.address || "Selected location"}</p>
              <p className="text-white/60">
                {[value.city, value.country].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}