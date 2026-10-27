import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { FDRProvider } from "./context/FDRContext";
import { ToastProvider } from "./context/ToastContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { FDRRegister } from "./pages/FDRRegister";
import { FDRRegistrationForm } from "./pages/FDRRegistrationForm";
import { BankConfirmations } from "./pages/BankConfirmations";

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <FDRProvider>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="/login" element={<Login />} />

              {/* Protected Workspace Layout */}
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/fdr-register" element={<FDRRegister />} />
                <Route path="/fdr-register/new" element={<FDRRegistrationForm />} />
                <Route path="/bank-confirmations" element={<BankConfirmations />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </FDRProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
