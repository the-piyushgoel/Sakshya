import React, { createContext, useContext, useState, useEffect } from "react";
import { DEMO_ACCOUNTS, STORAGE_KEYS } from "../config/authConfig";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load user from localStorage", e);
    }
    return null;
  });

  const [loading, setLoading] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      }
    } catch (e) {
      console.error("Failed to save auth state", e);
    }
  }, [user]);

  /**
   * Login with username and password
   */
  const login = (username, password) => {
    setLoading(true);
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    if (!trimmedUser || !trimmedPass) {
      setLoading(false);
      return { success: false, error: "Please enter both username and password." };
    }

    const matchedAccount = DEMO_ACCOUNTS.find(
      (acc) => acc.username.toLowerCase() === trimmedUser.toLowerCase()
    );

    if (!matchedAccount) {
      setLoading(false);
      return {
        success: false,
        error: `Account '${trimmedUser}' not found. Please use 'kiet' or 'aicte_admin'.`
      };
    }

    if (matchedAccount.password !== trimmedPass) {
      setLoading(false);
      return {
        success: false,
        error: "Invalid password for this account. Please verify credentials."
      };
    }

    // Login successful
    const userSession = {
      username: matchedAccount.username,
      role: matchedAccount.role,
      displayName: matchedAccount.displayName,
      fullName: matchedAccount.fullName,
      designation: matchedAccount.designation,
      institutionId: matchedAccount.institutionId,
      email: matchedAccount.email,
      avatar: matchedAccount.avatar,
      loginTimestamp: new Date().toISOString()
    };

    setUser(userSession);
    setLoading(false);
    return { success: true, user: userSession };
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    } catch (e) {
      console.error("Error clearing user storage", e);
    }
  };

  const isCollege = user?.role === "college";
  const isAicte = user?.role === "aicte";

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isCollege,
        isAicte,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
