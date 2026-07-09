import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useFeatureGate(featureKey, defaultValue = false) {
  const [enabled, setEnabled] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function checkFeature() {
      try {
        const res = await api.get(`/me/features/${featureKey}`);
        if (active) {
          setEnabled(Boolean(res.data?.enabled));
        }
      } catch {
        if (active) {
          setEnabled(defaultValue);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    checkFeature();
    return () => {
      active = false;
    };
  }, [featureKey, defaultValue]);

  return { enabled, loading };
}
