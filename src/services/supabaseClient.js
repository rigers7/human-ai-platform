// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase environment variables. ' +
        'Please create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
        'See .env.example for details.'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Authentication helper functions
export const auth = {
    // Sign up a new user
    signUp: async ({ email, password }) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        return { data, error };
    },

    // Sign in a user
    signIn: async ({ email, password }) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { data, error };
    },

    // Sign out the current user
    signOut: async () => {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    // Get the current user session
    getSession: async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        return { session, error };
    },

    // Get the current user
    getUser: async () => {
        const { data: { user }, error } = await supabase.auth.getUser();
        return { user, error };
    },

    // Password reset request
    resetPassword: async (email) => {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password',
        });
        return { data, error };
    },

    // Update user password
    updatePassword: async (newPassword) => {
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword,
        });
        return { data, error };
    },

    // Update user metadata (phone, display name, etc.)
    updateUserMetadata: async ({ phone, fullName }) => {
        const { data, error } = await supabase.auth.updateUser({
            data: {
                phone,
                full_name: fullName,
            }
        });
        return { data, error };
    },

    // Subscribe to auth state changes
    onAuthStateChange: (callback) => {
        return supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    },
};

// Database helper functions for user profiles
export const database = {
    // Get user profile from auth metadata
    getProfile: async () => {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) return { data: null, error };

        return {
            data: {
                email: user?.email || '',
                full_name: user?.user_metadata?.full_name || '',
                phone: user?.user_metadata?.phone || '',
            },
            error: null
        };
    },

    // Update user profile using auth metadata
    updateProfile: async ({ fullName, phone }) => {
        const { data, error } = await supabase.auth.updateUser({
            data: {
                phone: phone || '',
                full_name: fullName || '',
            }
        });
        return { data, error };
    },

    // Backward compatibility: upsertProfile
    upsertProfile: async ({ fullName, phone }) => {
        const { data, error } = await auth.updateUserMetadata({ fullName, phone });
        return { data, error };
    },

    // Delete a user profile (removes metadata)
    deleteProfile: async () => {
        const { error } = await supabase.auth.updateUser({
            data: {
                phone: null,
                full_name: null,
            }
        });
        return { error };
    }
};
