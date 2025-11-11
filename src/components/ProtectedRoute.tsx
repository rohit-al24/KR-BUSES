import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface Props {
  children: React.ReactElement;
  allow?: string[]; // allowed roles
}

const ProtectedRoute: React.FC<Props> = ({ children, allow }) => {
  const { session, loading, profile } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!session) return <Navigate to="/" replace />;
  if (allow && profile && !allow.includes(profile.role)) {
    return <div className="p-6 text-center text-red-600">Access denied</div>;
  }
  return children;
};

export default ProtectedRoute;
