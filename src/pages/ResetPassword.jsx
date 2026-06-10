import { useState, useEffect } from 'react';
import { auth } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const navigate = useNavigate();

    const validatePassword = () => {
        if (password.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
            return false;
        }
        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validatePassword()) return;

        try {
            setLoading(true);
            setMessage({ type: '', text: '' });

            const { error } = await auth.updatePassword(password);
            if (error) throw error;

            setMessage({
                type: 'success',
                text: 'Password updated successfully!'
            });

            // Sign out the user and redirect to sign in page
            setTimeout(async () => {
                await auth.signOut();
                navigate('/signin');
            }, 2000);
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.message || 'Failed to reset password'
            });
        } finally {
            setLoading(false);
        }
    };

    // Check if we're in a valid password reset state
    useEffect(() => {
        const checkResetSession = async () => {
            const { session } = await auth.getSession();
            if (session?.user?.aud !== 'authenticated') {
                navigate('/signin');
            }
        };
        checkResetSession();
    }, [navigate]);

    return (
        <div>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="text-center mb-8">
                    <h2 className="text-xl font-semibold text-gray-900">Set new password</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Please enter your new password
                    </p>
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        New Password
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="••••••••"
                        disabled={loading}
                    />
                </div>

                <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                        Confirm New Password
                    </label>
                    <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="••••••••"
                        disabled={loading}
                    />
                </div>

                <div>
                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="flex items-center space-x-2">
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Updating password...</span>
                            </span>
                        ) : (
                            'Update password'
                        )}
                    </button>
                </div>

                {message.text && (
                    <div className={`rounded-md p-4 ${message.type === 'error' ? 'bg-red-50' : 'bg-green-50'
                        }`}>
                        <p className={`text-sm ${message.type === 'error' ? 'text-red-800' : 'text-green-800'
                            }`}>
                            {message.text}
                        </p>
                    </div>
                )}
            </form>
        </div>
    );
}
