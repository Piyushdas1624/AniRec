import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

interface User {
    id: string;
    email: string;
    username: string;
    displayName: string;
    createdAt?: string;
    settings?: {
        proModel: string;
        flashModel: string;
        theme: string;
    };
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (emailOrUsername: string, password: string) => Promise<void>;
    signup: (email: string, username: string, displayName: string, password: string) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            if (!api.isAuthenticated()) {
                setUser(null);
                setLoading(false);
                return;
            }
            const { user: userData } = await api.getMe();
            setUser(userData);
        } catch {
            setUser(null);
            api.clearToken();
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    // Listen for auth:expired events dispatched by the API client
    // This handles 401 errors gracefully without causing a full page reload loop
    useEffect(() => {
        const handleAuthExpired = () => {
            setUser(null);
            api.clearToken();
            // No need for window.location.href - React Router will handle the redirect
            // via ProtectedRoute detecting user === null
        };
        window.addEventListener('auth:expired', handleAuthExpired);
        return () => window.removeEventListener('auth:expired', handleAuthExpired);
    }, []);

    const login = async (emailOrUsername: string, password: string) => {
        const { user: userData } = await api.login(emailOrUsername, password);
        setUser(userData);
    };

    const signup = async (email: string, username: string, displayName: string, password: string) => {
        const { user: userData } = await api.signup(email, username, displayName, password);
        setUser(userData);
    };

    const logout = () => {
        api.clearToken();
        setUser(null);
        localStorage.removeItem('app_gemini_key');
        localStorage.removeItem('app_pin_hash');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
