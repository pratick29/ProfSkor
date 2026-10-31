import { api } from "../api/client";

const GUEST_STORAGE_KEY = "profskor_guest_profiles";

/**
 * Save a profile score to the database (or localStorage for guest users)
 * @param {string} userId - User ID (or "guest")
 * @param {string} profileType - 'github', 'leetcode', 'linkedin', or 'fullscore'
 * @param {object} profileData - The profile data to save
 * @param {string} profileName - Optional name for the profile
 * @returns {Promise<object>} Saved profile data
 */
export async function saveProfile(userId, profileType, profileData, profileName = null) {
  const name = profileName || `${profileType}_${new Date().toISOString().split("T")[0]}`;
  const saveData = {
    user_id: userId,
    profile_type: profileType,
    profile_name: name,
    profile_data: profileData,
    created_at: new Date().toISOString(),
    id: `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  };

  if (userId === "guest") {
    try {
      const stored = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || "[]");
      stored.unshift(saveData);
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(stored));
      return { success: true, data: saveData };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  try {
    const res = await api.post("/profiles/save", {
      user_id: userId,
      profile_type: profileType,
      profile_name: name,
      profile_data: profileData,
    });
    return { success: true, data: res.data.data };
  } catch (error) {
    console.error("Error saving profile:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get saved profiles for a user
 * @param {string} userId - User ID (or "guest")
 * @param {string} profileType - Optional filter by profile type
 * @returns {Promise<array>} Array of saved profiles
 */
export async function getSavedProfiles(userId, profileType = null) {
  if (userId === "guest") {
    try {
      const stored = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || "[]");
      let list = stored;
      if (profileType) {
        list = stored.filter((p) => p.profile_type === profileType);
      }
      return { success: true, data: list };
    } catch (e) {
      return { success: false, error: e.message, data: [] };
    }
  }

  try {
    const res = await api.get("/profiles/history", {
      params: {
        profile_type: profileType || undefined,
        limit: 100,
      },
    });
    return { success: true, data: res.data?.data || [] };
  } catch (error) {
    console.error("Error fetching saved profiles:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Delete a saved profile (server for signed-in users, localStorage for guests)
 * @returns {Promise<object>} { success, error? }
 */
export async function deleteProfile(userId, profileId) {
  if (userId === "guest") {
    try {
      const stored = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || "[]");
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(stored.filter((p) => p.id !== profileId)));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  try {
    await api.delete(`/profiles/${profileId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Shareable link for a saved profile, or null for guest profiles that only exist in this browser. */
export function shareLink(profile) {
  if (!profile?.id || String(profile.id).startsWith("guest_")) return null;
  return `${window.location.origin}/search?id=${profile.id}`;
}
