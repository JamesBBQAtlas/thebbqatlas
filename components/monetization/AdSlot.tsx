interface AdSlotProps {
  slot: "sidebar" | "in-content" | "between-reviews" | "homepage";
  className?: string;
}

export function AdSlot({ slot, className }: AdSlotProps) {
  return (
    <>
      {/*
        ADSENSE / EZOIC SLOT — {slot}
        Replace this comment block with your ad unit code once approved.
        Example (AdSense):
        <ins className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client="ca-pub-XXXXXXXX"
          data-ad-slot="XXXXXXXX"
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      */}
      <div
        className={className}
        data-ad-slot={slot}
        aria-hidden="true"
      />
    </>
  );
}