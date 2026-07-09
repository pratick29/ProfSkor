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
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);

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
      } catch (_err) {
        if (!mounted) return;
        if (localStorage.getItem("profskor_guest") === "true") {
          setUser(GUEST_USER);
          setUserType(localStorage.getItem("userType") || "candidate");
        } else {
          setUser(null);
          setUserType(null);
        }
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

  const updateUserType = (type) => {
    setUserType(type);
    localStorage.setItem("userType", type);
    if (user && !user.isGuest) {
      supabase.auth.updateUser({ data: { user_type: type } });
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, userType, updateUserType, signInAsGuest, signOutGuest }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
