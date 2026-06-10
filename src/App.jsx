import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthProvider';
import Signup from './pages/Signup';
import SignIn from './pages/SignIn';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import Dashboard from "./pages/Dashboard";

function AuthLayout() {
  const { user } = useAuth();
  const location = useLocation();

  // Allow reset-password page even when authenticated (user gets auto-authenticated via reset link)
  if (user && location.pathname !== '/reset-password') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome</h1>
          <p className="text-gray-600">Please sign in to continue</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
          {(() => {
            switch (location.pathname) {
              case '/signup':
                return <Signup />;
              case '/forgot-password':
                return <ForgotPassword />;
              case '/reset-password':
                return <ResetPassword />;
              default:
                return <SignIn />;
            }
          })()}

          {location.pathname !== '/forgot-password' && location.pathname !== '/reset-password' && (
            <div className="text-center text-sm text-gray-600">
              {location.pathname === '/signup' ? (
                <p>
                  Already have an account?{' '}
                  <Link to="/signin" className="btn">
                    Sign In
                  </Link>
                </p>
              ) : (
                <p>
                  Don't have an account?{' '}
                  <Link to="/signup" className="btn">
                    Sign Up
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/signin" replace />} />
          <Route path="/signup" element={<AuthLayout />} />
          <Route path="/signin" element={<AuthLayout />} />
          <Route path="/forgot-password" element={<AuthLayout />} />
          <Route path="/reset-password" element={<AuthLayout />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
