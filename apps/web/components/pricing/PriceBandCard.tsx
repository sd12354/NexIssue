import type {
  PriceSourceDiagnostic,
  PriceSourceDiagnostics,
  SoldCompsBreakdown,
  SourcePriceBands,
} from "@app/api";

type PriceBandCardProps = {
  title: string;
  subtitle: string;
  bands: SourcePriceBands;
};

const WINDOWS = [
  { key: "30", label: "30d", low: "low30", median: "median30", high: "high30", count: "count30" },
  { key: "60", label: "60d", low: "low60", median: "median60", high: "high60", count: "count60" },
  { key: "90", label: "90d", low: "low90", median: "median90", high: "high90", count: "count90" },
] as const;

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatNote(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (/error 522|cloudflare|temporarily unavailable/i.test(message)) {
    return "Pricing service temporarily unreachable. Tap refresh to try again.";
  }
  if (message.trimStart().startsWith("{")) {
    return "Could not load comps right now. Tap refresh to try again.";
  }
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

function diagnosticLabel(
  source: "GoCollect" | "eBay Finding" | "eBay Browse",
  diag: PriceSourceDiagnostic | undefined,
  fallbackCount: number | null,
  unit: "sales" | "listings",
): { label: string; tone: "ok" | "muted" | "warn" } {
  if (diag) {
    switch (diag.status) {
      case "ok":
        return { label: `${source}: ${diag.count} ${unit}`, tone: "ok" };
      case "no_data":
        return { label: `${source}: 0 ${unit}`, tone: "muted" };
      case "not_configured":
        return { label: `${source}: not configured`, tone: "warn" };
      case "error":
        return { label: `${source}: error`, tone: "warn" };
    }
  }
  if (fallbackCount != null && fallbackCount > 0) {
    return { label: `${source}: ${fallbackCount} ${unit}`, tone: "ok" };
  }
  return { label: `${source}: 0 ${unit}`, tone: "muted" };
}

function toneClass(tone: "ok" | "muted" | "warn"): string {
  if (tone === "warn") return "text-danger";
  if (tone === "ok") return "text-foreground";
  return "text-muted";
}

function renderSoldDiagnostics(
  diagnostics: PriceSourceDiagnostics | undefined,
  breakdown: SoldCompsBreakdown | undefined,
) {
  const gc = diagnosticLabel(
    "GoCollect",
    diagnostics?.gocollect,
    breakdown?.gocollect ?? null,
    "sales",
  );
  const ebay = diagnosticLabel(
    "eBay Finding",
    diagnostics?.ebaySold,
    breakdown?.ebay ?? null,
    "sales",
  );
  return (
    <p className="mt-1 text-xs">
      <span className={toneClass(gc.tone)}>{gc.label}</span>
      <span className="text-muted"> · </span>
      <span className={toneClass(ebay.tone)}>{ebay.label}</span>
    </p>
  );
}

function renderActiveDiagnostics(
  diagnostics: PriceSourceDiagnostics | undefined,
  compsStored: number,
) {
  const d = diagnosticLabel(
    "eBay Browse",
    diagnostics?.ebayActive,
    compsStored,
    "listings",
  );
  return <p className={`mt-1 text-xs ${toneClass(d.tone)}`}>{d.label}</p>;
}

export function PriceBandCard({ title, subtitle, bands }: PriceBandCardProps) {
  const note = formatNote(bands.message);
  const isSold = bands.source === "gocollect";

  return (
    <div className="rounded-card border border-surface-border bg-surface p-4">
      <div className="mb-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
        {isSold
          ? renderSoldDiagnostics(bands.diagnostics, bands.breakdown)
          : renderActiveDiagnostics(bands.diagnostics, bands.compsStored)}
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px] font-bold uppercase tracking-wide text-muted">
        <span />
        <span className="text-right">Low</span>
        <span className="text-right">Median</span>
        <span className="text-right">High</span>
      </div>

      {WINDOWS.map((window) => {
        const low = bands[window.low];
        const median = bands[window.median];
        const high = bands[window.high];
        const count = bands[window.count];

        return (
          <div key={window.key} className="border-t border-surface-border py-2">
            <div className="grid grid-cols-4 gap-2 text-sm">
              <span className="font-semibold text-muted">{window.label}</span>
              <span className="text-right font-mono">{formatPrice(low)}</span>
              <span className="text-right font-mono text-accent">
                {formatPrice(median)}
              </span>
              <span className="text-right font-mono">{formatPrice(high)}</span>
            </div>
            <p className="mt-1 pl-9 font-mono text-[11px] text-muted">
              {count} comps
            </p>
          </div>
        );
      })}

      {note ? <p className="mt-3 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
