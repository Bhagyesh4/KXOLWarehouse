import axios from "axios";

export const API = process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "/api";

export const api = axios.create({
    baseURL: API,
});

// also send Bearer fallback if cookie is blocked
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("wms_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export function formatErr(detail) {
    if (detail == null) return "Something went wrong.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail
            .map((e) => (e?.msg ? e.msg : JSON.stringify(e)))
            .join(" ");
    return String(detail);
}
