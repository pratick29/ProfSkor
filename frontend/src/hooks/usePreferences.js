import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import { toast } from "../utils/toast";

const GUEST_PREFS_KEY = "profskor_guest_prefs";

// Keep in sync with backend/core/default_preferences.py
export const DEFAULT_PREFS = {
  mode: "default",
  platform_weights: { github: 40, leetcode: 40, linkedin: 20 },
  github: { repos: 30, stars: 30, commits: 25, consistency: 15 },
  leetcode: { easy: 15, medium: 35, hard: 25, streak: 15, consistency: 10 },
  linkedin: { headline: 20, about: 20, projects: 20, posting: 15, photo: 10, experience: 15 },
};

/** Fill in any sections/keys missing from saved preferences (e.g. older rows or templates). */
export function withDefaults(saved) {
  const out = { ...DEFAULT_PREFS, ...(saved || {}) };
  for (const section of ["platform_weights", "github", "leetcode", "linkedin"]) {
    out[section] = { ...DEFAULT_PREFS[section], ...((saved || {})[section] || {}) };
  }
  return out;
}

async function persist(user, prefs) {
  if (!user) return { error: null };
  if (user.isGuest) {
    try {
      localStorage.setItem(GUEST_PREFS_KEY, JSON.stringify(prefs));
      return { error: null };
    } catch (e) {
      return { error: e };
    }
  }
  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      { user_id: user.id, preferences: prefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  return { error };
}

/**
 * Scoring preferences for the current user, stored in Supabase (or localStorage for guests).
 * - updatePrefs(nextOrFn, { persist }) updates immediately and saves after a short debounce
 * - updateSection(section, key, value) is a shortcut for one weight
 * - savePrefs() saves right away and resolves to { error }
 */
export function usePreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(DEFAULT_PREFS);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let saved = null;
      if (user?.isGuest) {
        try {
          saved = JSON.parse(localStorage.getItem(GUEST_PREFS_KEY) || "null");
        } catch {
          saved = null;
        }
      } else if (user?.id) {
        const { data } = await supabase
          .from("user_preferences")
          .select("preferences")
          .eq("user_id", user.id)
          .maybeSingle();
        saved = data?.preferences || null;
      }
      if (cancelled) return;
      const next = withDefaults(saved);
      latest.current = next;
      setPrefs(next);
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isGuest]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const savePrefs = useCallback(async () => {
    clearTimeout(timer.current);
    return persist(user, latest.current);
  }, [user]);

  const updatePrefs = useCallback(
    (nextOrFn, { persist: shouldPersist = true } = {}) => {
      // Build from the ref, not render state, so back-to-back calls chain correctly
      const next = typeof nextOrFn === "function" ? nextOrFn(latest.current) : nextOrFn;
      latest.current = next;
      setPrefs(next);
      if (!shouldPersist) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const { error } = await persist(user, latest.current);
        if (error) toast.error("Couldn't save your weights. Please try again.");
      }, 500);
    },
    [user]
  );

  const updateSection = useCallback(
    (section, key, value) =>
      updatePrefs((prev) => ({ ...prev, mode: "custom", [section]: { ...prev[section], [key]: value } })),
    [updatePrefs]
  );

  return { prefs, loaded, updatePrefs, updateSection, savePrefs };
}
