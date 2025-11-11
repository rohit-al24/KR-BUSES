import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/context/AuthContext";
import Login from "./pages/Login";
import StudentLogin from "./pages/StudentLogin";
import StudentDashboard from "./pages/StudentDashboard";
import Seats from "./pages/Seats";
import Admin from "./pages/Admin";
import Coordinator from "./pages/Coordinator";
import Scan from "./pages/Scan";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/seats" element={<ProtectedRoute><Seats /></ProtectedRoute>} />
              <Route path="/scan" element={<ProtectedRoute allow={['admin','coordinator']}><Scan /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute allow={['admin']}><Admin /></ProtectedRoute>} />
              <Route path="/coordinator" element={<ProtectedRoute allow={['coordinator','staff','admin']}><Coordinator /></ProtectedRoute>} />
              <Route path="/student/login" element={<StudentLogin />} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
