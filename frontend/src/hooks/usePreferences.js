import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";

const DEFAULT_PREFS = {
  "mode": "default",

  "platform_weights": {
    "github": 40,
    "leetcode": 40,
    "linkedin": 20
  },

  "github": {
    "repos": 30,
    "stars": 30,
    "commits": 25,
    "consistency": 15
  },

  "leetcode": {
    "easy": 15,
    "medium": 35,
    "hard": 25,
    "streak": 15,
    "consistency": 10
  },

  "linkedin": {
    "headline": 25,
    "about": 30,
    "projects": 25,
    "posting": 20
  }
};

export function usePreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", user.id)
        .single()
        .then(res => {
          setPrefs(res.data?.preferences || DEFAULT_PREFS);
        });
    }
  }, [user?.id]);

  return prefs;
}
