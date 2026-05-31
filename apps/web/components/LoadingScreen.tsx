import { BrandLogo } from "./BrandLogo";

type LoadingScreenProps = {
  message?: string;
  compact?: boolean;
};

export function LoadingScreen({
  message = "Loading…",
  compact = false,
}: LoadingScreenProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <BrandLogo size={40} animated />
        {message ? (
          <p className="animate-loading-fade text-sm text-muted">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5">
      <BrandLogo size={72} animated priority />
      {message ? (
        <p className="animate-loading-fade mt-6 text-sm font-medium text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
