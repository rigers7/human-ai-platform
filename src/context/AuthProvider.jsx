/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../services/supabaseClient';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions and get user
        const initAuth = async () => {
            try {
                const { session: currentSession } = await auth.getSession();
                setSession(currentSession);
                if (currentSession) {
                    const { user: currentUser } = await auth.getUser();
                    setUser(currentUser);
                }
            } catch (error) {
                console.error('Error initializing auth:', error.message);
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        // Subscribe to auth changes
        const { data: { subscription } } = auth.onAuthStateChange((event, currentSession) => {
            setSession(currentSession);
            setUser(currentSession?.user ?? null);
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const value = {
        session,
        user,
        loading,
        signUp: auth.signUp,
        signIn: auth.signIn,
        signOut: auth.signOut,
        resetPassword: auth.resetPassword,
        updatePassword: auth.updatePassword,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

// Custom hook to use auth context
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
