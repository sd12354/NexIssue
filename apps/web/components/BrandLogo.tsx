type BrandLogoProps = {
  size?: number;
  animated?: boolean;
  priority?: boolean;
  className?: string;
};

export function BrandLogo({
  size = 64,
  animated = false,
  priority = false,
  className = "",
}: BrandLogoProps) {
  const image = (
    // Native img avoids next/image wrapper mismatches during hydration.
    <img
      src="/logo.png"
      alt="NexIssue"
      width={size}
      height={size}
      fetchPriority={priority ? "high" : undefined}
      className={`rounded-xl ${className}`}
    />
  );

  if (!animated) return image;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 animate-logo-glow rounded-xl bg-accent/25 blur-xl"
        aria-hidden
      />
      <div className="animate-logo-spin">{image}</div>
    </div>
  );
}
