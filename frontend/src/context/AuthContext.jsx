import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase";

const AuthContext = createContext();

const GUEST_USER = {
  id: "guest",
  email: "guest@local",
  user_metadata: { user_type: "candidate" },
  isGuest: true,
};

export function AuthProvider({ children }) {
  const isStoredGuest = () => localStorage.getItem("profskor_guest") === "true";
  const [user, setUser] = useState(() => (isStoredGuest() ? GUEST_USER : null));
  const [userType, setUserType] = useState(() => (isStoredGuest() ? localStorage.getItem("userType") || "candidate" : null));
  // true until the Supabase session check finishes, so protected routes don't redirect on refresh
  const [loading, setLoading] = useState(true);

  const signInAsGuest = () => {
    const type = localStorage.getItem("userType") || "candidate";
    setUser(GUEST_USER);
    setUserType(type);
    localStorage.setItem("userType", type);
    localStorage.setItem("profskor_guest", "true");
  };

  const signOutGuest = () => {
    if (user?.isGuest) {
      setUser(null);
      setUserType(null);
      localStorage.removeItem("profskor_guest");
    }
  };

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        if (data?.user) {
          setUser(data.user);
          const type =
            data.user.user_metadata?.user_type ||
            localStorage.getItem("userType") ||
            "candidate";
          setUserType(type);
        } else if (localStorage.getItem("profskor_guest") === "true") {
          setUser(GUEST_USER);
          setUserType(localStorage.getItem("userType") || "candidate");
        } else {
          setUser(null);
          setUserType(null);
        }
      } catch {
        if (!mounted) return;
        if (localStorage.getItem("profskor_guest") === "true") {
          setUser(GUEST_USER);
          setUserType(localStorage.getItem("userType") || "candidate");
        } else {
          setUser(null);
          setUserType(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_e, session) => {
        if (!mounted) return;
        if (session?.user) {
          setUser(session.user);
          const type =
            session.user.user_metadata?.user_type ||
            localStorage.getItem("userType") ||
            "candidate";
          setUserType(type);
        } else if (localStorage.getItem("profskor_guest") !== "true") {
          setUser(null);
          setUserType(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Admin is granted server-side via app_metadata, which users cannot edit themselves
  const isAdmin = !user?.isGuest && user?.app_metadata?.role === "admin";

  const updateUserType = (type) => {
    setUserType(type);
    localStorage.setItem("userType", type);
    if (user && !user.isGuest) {
      supabase.auth.updateUser({ data: { user_type: type } });
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, userType, isAdmin, loading, updateUserType, signInAsGuest, signOutGuest }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
