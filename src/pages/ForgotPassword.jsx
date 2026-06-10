import { useState } from 'react';
import { auth } from '../services/supabaseClient';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            setMessage({ type: '', text: '' });

            const { error } = await auth.resetPassword(email);
            if (error) throw error;

            setMessage({
                type: 'success',
                text: 'Check your email for a password reset link'
            });
            setEmail('');
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.message || 'Failed to send reset password email'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="text-center mb-8">
                    <h2 className="text-xl font-semibold text-gray-900">Reset your password</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Enter your email address and we'll send you a link to reset your password
                    </p>
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        Email address
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="you@example.com"
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
                                <span>Sending...</span>
                            </span>
                        ) : (
                            'Send reset link'
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

                <div className="text-center">
                    <Link
                        to="/signin"
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                        Back to sign in
                    </Link>
                </div>
            </form>
        </div>
    );
}
