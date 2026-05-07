import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading || user === null) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#090a0c]">
                <div className="font-mono text-amber-400 tracking-widest text-sm">
                    SCANNING SESSION...
                </div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    return children;
}
