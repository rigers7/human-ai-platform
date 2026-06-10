import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { database, auth } from '../services/supabaseClient';
import { Link } from 'react-router-dom';
import {
    LuArrowLeft, LuSave, LuEye, LuEyeOff, LuPencil, LuX,
    LuUser, LuShield, LuLogOut, LuLoader, LuCircleCheck, LuCircleAlert
} from 'react-icons/lu';

export default function Profile() {
    const { user, signOut } = useAuth();

    // --- STATE ---
    const [profile, setProfile] = useState({ fullName: '', phone: '', email: '' });
    const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'security'
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [originalProfile, setOriginalProfile] = useState(null);

    // --- FETCH DATA ---
    useEffect(() => {
        if (!user) return;
        const fetchProfile = async () => {
            const { data } = await database.getProfile();
            if (data) {
                setProfile({
                    fullName: data.full_name || '',
                    phone: data.phone || '',
                    email: data.email || '',
                });
            }
            setLoading(false);
        };
        fetchProfile();
    }, [user]);

    // --- HANDLERS ---
    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setError(''); setSuccess(''); setSaving(true);
        try {
            const result = await database.updateProfile({ fullName: profile.fullName, phone: profile.phone });
            if (result.error) throw result.error;
            setSuccess('Profile updated successfully');
            setIsEditingProfile(false);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) { setError(err.message || 'Failed to update'); }
        finally { setSaving(false); }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (passwordData.newPassword !== passwordData.confirmPassword) { setError('Passwords do not match'); return; }
        if (passwordData.newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
        setSaving(true);
        try {
            const { error } = await auth.updatePassword(passwordData.newPassword);
            if (error) throw error;
            setSuccess('Password updated successfully');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) { setError(err.message || 'Failed to update password'); }
        finally { setSaving(false); }
    };

    const handleStartEdit = () => {
        setOriginalProfile({ ...profile });
        setIsEditingProfile(true);
    };

    const handleCancelEdit = () => {
        if (originalProfile) setProfile(originalProfile);
        setIsEditingProfile(false);
        setError('');
    };

    // --- RENDER HELPERS ---
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4 text-gray-400">
                    <LuLoader className="animate-spin" size={32} />
                    <span className="text-sm font-medium">Loading profile...</span>
                </div>
            </div>
        );
    }

    const getInitials = (name) => {
        if (!name) return user?.email?.[0].toUpperCase() || 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900 pb-20">

            {/* 1. Header Area (Matches Dashboard Sticky Header Vibe) */}
            <div className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            to="/dashboard"
                            className="p-2 -ml-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-full transition-all"
                        >
                            <LuArrowLeft size={20} />
                        </Link>
                        <h1 className="text-lg font-bold text-gray-900">Account Settings</h1>
                    </div>
                    <button
                        onClick={signOut}
                        className="text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-full transition-all flex items-center gap-2"
                    >
                        <LuLogOut size={14} /> Sign Out
                    </button>
                </div>
            </div>

            {/* 2. Main Layout (Grid) */}
            <div className="max-w-5xl mx-auto px-6 py-10">

                {/* GLOBAL ALERT MESSAGES */}
                {(success || error) && (
                    <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${success ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                        {success ? <LuCircleCheck size={20} /> : <LuCircleAlert size={20} />}
                        <span className="text-sm font-medium">{success || error}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

                    {/* LEFT COLUMN: User Card & Navigation */}
                    <div className="md:col-span-4 space-y-6">

                        {/* User Card */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-gray-900 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-4 shadow-md">
                                {getInitials(profile.fullName)}
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">{profile.fullName || 'User'}</h2>
                            <p className="text-sm text-gray-400 mt-1">{profile.email}</p>
                            <div className="mt-4 px-3 py-1 bg-gray-100 text-gray-500 text-xs font-semibold uppercase tracking-wide rounded-full">
                                Free Plan
                            </div>
                        </div>

                        {/* Navigation Menu */}
                        <nav className="flex flex-col space-y-1">
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'profile'
                                    ? 'bg-black text-white shadow-md'
                                    : 'text-gray-600 hover:bg-white hover:shadow-sm'
                                    }`}
                            >
                                <LuUser size={18} /> Personal Details
                            </button>
                            <button
                                onClick={() => setActiveTab('security')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'security'
                                    ? 'bg-black text-white shadow-md'
                                    : 'text-gray-600 hover:bg-white hover:shadow-sm'
                                    }`}
                            >
                                <LuShield size={18} /> Password & Security
                            </button>
                        </nav>
                    </div>

                    {/* RIGHT COLUMN: Content Forms */}
                    <div className="md:col-span-8">
                        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm min-h-[400px]">

                            {/* --- TAB: PROFILE DETAILS --- */}
                            {activeTab === 'profile' && (
                                <div className="animate-in fade-in duration-300">
                                    <div className="flex justify-between items-start mb-8">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">Personal Information</h3>
                                            <p className="text-sm text-gray-500 mt-1">Update your personal details here.</p>
                                        </div>
                                        {!isEditingProfile ? (
                                            <button
                                                onClick={handleStartEdit}
                                                className="p-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                                                title="Edit Profile"
                                            >
                                                <LuPencil size={18} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleCancelEdit}
                                                className="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 transition-colors"
                                                title="Cancel Editing"
                                            >
                                                <LuX size={18} />
                                            </button>
                                        )}
                                    </div>

                                    <form onSubmit={handleProfileUpdate} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Full Name */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Full Name</label>
                                                <input
                                                    type="text"
                                                    disabled={!isEditingProfile}
                                                    value={profile.fullName}
                                                    onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                                                    className={`w-full p-3 rounded-xl text-sm font-medium transition-all outline-none focus:ring-2 focus:ring-black/5 ${isEditingProfile
                                                        ? "bg-white border border-gray-200 focus:border-black"
                                                        : "bg-gray-50 border border-transparent text-gray-500 cursor-not-allowed"
                                                        }`}
                                                />
                                            </div>

                                            {/* Phone */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phone</label>
                                                <input
                                                    type="tel"
                                                    disabled={!isEditingProfile}
                                                    value={profile.phone}
                                                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                                    className={`w-full p-3 rounded-xl text-sm font-medium transition-all outline-none focus:ring-2 focus:ring-black/5 ${isEditingProfile
                                                        ? "bg-white border border-gray-200 focus:border-black"
                                                        : "bg-gray-50 border border-transparent text-gray-500 cursor-not-allowed"
                                                        }`}
                                                />
                                            </div>
                                        </div>

                                        {/* Email - Always Disabled */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email Address</label>
                                            <input
                                                type="email"
                                                disabled
                                                value={profile.email}
                                                className="w-full p-3 rounded-xl text-sm font-medium bg-gray-50 border border-transparent text-gray-500 cursor-not-allowed"
                                            />
                                            <p className="text-[10px] text-gray-400">Email cannot be changed manually. Contact support.</p>
                                        </div>

                                        {isEditingProfile && (
                                            <div className="pt-4 flex justify-end">
                                                <button
                                                    type="submit"
                                                    disabled={saving}
                                                    className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 active:scale-95 disabled:opacity-50"
                                                >
                                                    {saving ? <LuLoader className="animate-spin" /> : <LuSave />}
                                                    Save Changes
                                                </button>
                                            </div>
                                        )}
                                    </form>
                                </div>
                            )}

                            {/* --- TAB: SECURITY --- */}
                            {activeTab === 'security' && (
                                <div className="animate-in fade-in duration-300">
                                    <div className="mb-8">
                                        <h3 className="text-xl font-bold text-gray-900">Login & Security</h3>
                                        <p className="text-sm text-gray-500 mt-1">Manage your password and security settings.</p>
                                    </div>

                                    <form onSubmit={handlePasswordChange} className="space-y-6 max-w-md">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">New Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={passwordData.newPassword}
                                                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                                    className="w-full p-3 rounded-xl text-sm font-medium bg-white border border-gray-200 focus:border-black outline-none focus:ring-2 focus:ring-black/5 transition-all"
                                                    placeholder="••••••••"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                                                >
                                                    {showPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Confirm Password</label>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwordData.confirmPassword}
                                                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                                className="w-full p-3 rounded-xl text-sm font-medium bg-white border border-gray-200 focus:border-black outline-none focus:ring-2 focus:ring-black/5 transition-all"
                                                placeholder="••••••••"
                                            />
                                        </div>

                                        <div className="pt-4">
                                            <button
                                                type="submit"
                                                disabled={saving || !passwordData.newPassword}
                                                className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {saving ? <LuLoader className="animate-spin" /> : <LuShield />}
                                                Update Password
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
