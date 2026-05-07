import { createContext, useContext, useEffect, useState } from "react";
import { api, formatErr } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null = checking, false = unauth, object = auth
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/auth/me");
                setUser(data);
            } catch {
                setUser(false);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = async (email, password) => {
        try {
            const { data } = await api.post("/auth/login", { email, password });
            if (data.token) localStorage.setItem("wms_token", data.token);
            setUser(data);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: formatErr(e.response?.data?.detail) || e.message };
        }
    };

    const register = async (payload) => {
        try {
            const { data } = await api.post("/auth/register", payload);
            if (data.token) localStorage.setItem("wms_token", data.token);
            setUser(data);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: formatErr(e.response?.data?.detail) || e.message };
        }
    };

    const logout = async () => {
        try {
            await api.post("/auth/logout");
        } catch {}
        localStorage.removeItem("wms_token");
        setUser(false);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
