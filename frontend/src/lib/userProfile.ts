// Persistent user profile: stored in localStorage, used across modes
// (passed to AI chat, auto-fills Health Risk + Personal Brief, etc.)

export interface UserProfile {
  // Identity
  display_name: string;

  // Location
  home_district: string | null;

  // Demographics
  age_group: "child" | "teen" | "adult" | "senior";

  // Health
  conditions: string[];      // ["asthma","heart","pregnancy",...]
  smoker: boolean;
  has_purifier: boolean;
  wears_mask_n95: boolean;
  hours_outdoor_per_day: number;

  // Lifestyle
  activities: string[];     // ["running","cycling",...]
  commute: "car" | "public" | "walk" | "bike" | "none";

  // Family
  family_kids_0_6: number;
  family_kids_6_18: number;

  // Business interest
  business_budget_usd: number | null;
  business_categories_interest: string[];

  // Preferences
  preferred_language: "ru" | "kz" | "en";
  notes: string;

  updated_at: string;
}

const KEY = "aqyl.user.profile";

export const DEFAULT_PROFILE: UserProfile = {
  display_name: "",
  home_district: null,
  age_group: "adult",
  conditions: [],
  smoker: false,
  has_purifier: false,
  wears_mask_n95: false,
  hours_outdoor_per_day: 2,
  activities: [],
  commute: "public",
  family_kids_0_6: 0,
  family_kids_6_18: 0,
  business_budget_usd: null,
  business_categories_interest: [],
  preferred_language: "ru",
  notes: "",
  updated_at: new Date().toISOString(),
};

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: UserProfile): UserProfile {
  const next = { ...p, updated_at: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearProfile(): void {
  localStorage.removeItem(KEY);
}

export function isProfileEmpty(p: UserProfile): boolean {
  return (
    !p.display_name && !p.home_district
    && p.conditions.length === 0
    && p.activities.length === 0
    && !p.business_budget_usd
  );
}

// Compact AI-friendly summary of profile for prompts
export function profileSummary(p: UserProfile): Record<string, unknown> | null {
  if (isProfileEmpty(p)) return null;
  return {
    home_district: p.home_district,
    age_group: p.age_group,
    health: {
      conditions: p.conditions,
      smoker: p.smoker,
      has_purifier: p.has_purifier,
      wears_mask_n95: p.wears_mask_n95,
    },
    lifestyle: {
      activities: p.activities,
      commute: p.commute,
      hours_outdoor_per_day: p.hours_outdoor_per_day,
    },
    family: {
      kids_0_6: p.family_kids_0_6,
      kids_6_18: p.family_kids_6_18,
    },
    business: {
      budget_usd: p.business_budget_usd,
      categories_interest: p.business_categories_interest,
    },
    preferred_language: p.preferred_language,
    notes_short: p.notes ? p.notes.slice(0, 200) : "",
  };
}

// React hook for profile - subscribe to changes via window event
import { useEffect, useState } from "react";

const PROFILE_EVENT = "aqyl-profile-updated";

export function emitProfileUpdated(): void {
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
}

export function useUserProfile(): [UserProfile, (p: UserProfile) => void] {
  const [profile, setProfileState] = useState<UserProfile>(() => loadProfile());

  useEffect(() => {
    const handler = () => setProfileState(loadProfile());
    window.addEventListener(PROFILE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(PROFILE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setProfile = (p: UserProfile) => {
    const saved = saveProfile(p);
    setProfileState(saved);
    emitProfileUpdated();
  };

  return [profile, setProfile];
}
