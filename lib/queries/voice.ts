import { createAnonClient } from "@/lib/supabase/anon";
import type { VoiceLine, VoiceSlot } from "@/lib/types/database";

/** All active voice-bank lines. Public (anon) read; cache-friendly. */
export async function getVoiceLines(): Promise<VoiceLine[]> {
  try {
    const s = createAnonClient();
    const { data } = await s
      .from("voice_lines")
      .select("*")
      .eq("is_active", true)
      .order("slot", { ascending: true })
      .order("sort_order", { ascending: true });
    if (data?.length) return data as VoiceLine[];
  } catch {
    // table may not exist yet (pre-migration) — degrade to no lines
  }
  return [];
}

export function linesForSlot(lines: VoiceLine[], slot: VoiceSlot): VoiceLine[] {
  return lines.filter((l) => l.slot === slot);
}

/** Random line for a slot (server-side, per request). Null if the slot is empty. */
export function pickLine(lines: VoiceLine[], slot: VoiceSlot): VoiceLine | null {
  const pool = linesForSlot(lines, slot);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
