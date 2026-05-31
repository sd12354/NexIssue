import { Suspense } from "react";

import { LoadingScreen } from "@/components/LoadingScreen";
import SettingsPage from "./SettingsPage";

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen compact message="Loading settings…" />}>
      <SettingsPage />
    </Suspense>
  );
}
