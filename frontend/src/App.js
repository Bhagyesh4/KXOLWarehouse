import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Inbound from "./pages/Inbound";
import Outbound from "./pages/Outbound";
import Storage from "./pages/Storage";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import PrintGRN from "./pages/PrintGRN";
import PrintPickList from "./pages/PrintPickList";
import PrintPalletLabels from "./pages/PrintPalletLabels";
import { Toaster } from "sonner";

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Toaster theme="dark" position="top-right" />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route
                        path="/print/grn/:id"
                        element={
                            <ProtectedRoute>
                                <PrintGRN />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/print/pick/:id"
                        element={
                            <ProtectedRoute>
                                <PrintPickList />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/print/labels/:id"
                        element={
                            <ProtectedRoute>
                                <PrintPalletLabels />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        element={
                            <ProtectedRoute>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/inbound" element={<Inbound />} />
                        <Route path="/outbound" element={<Outbound />} />
                        <Route path="/storage" element={<Storage />} />
                        <Route path="/shuttle" element={<Navigate to="/storage" replace />} />
                        <Route path="/reports" element={<Reports />} />
                        <Route path="/admin" element={<Admin />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
