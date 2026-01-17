'use client';

import { useState, useEffect, useCallback } from 'react';
import { Qris, AdminLog, ApiResponse } from '@/types';
import QrisList from '@/components/QrisList';
import QrisUploadForm from '@/components/QrisUploadForm';
import AdminLogPanel from '@/components/AdminLogPanel';
import Notification, { showSuccess, showError, showWarning } from '@/components/Notification';
import Link from 'next/link';

export default function AdminPage() {
    const [qrisList, setQrisList] = useState<Qris[]>([]);
    const [logs, setLogs] = useState<AdminLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'paid' | 'expired'>('all');

    // Auth state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth/login');
                const data = await res.json();
                setIsAuthenticated(data.authenticated);
            } catch {
                setIsAuthenticated(false);
            } finally {
                setIsAuthLoading(false);
            }
        };
        checkAuth();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();

            if (data.success) {
                setIsAuthenticated(true);
                setPassword('');
            } else {
                setLoginError(data.error || 'Login failed');
            }
        } catch {
            setLoginError('Login failed');
        }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            setIsAuthenticated(false);
        } catch {
            console.error('Logout failed');
        }
    };

    const fetchQris = useCallback(async () => {
        try {
            const statusQuery = activeTab === 'all' ? '' : `status=${activeTab}&`;
            const res = await fetch(`/api/qris?${statusQuery}includeProduct=true`);
            const data: ApiResponse<Qris[]> = await res.json();

            if (data.success && data.data) {
                setQrisList(data.data);
            }
        } catch (error) {
            console.error('Error fetching QRIS:', error);
            showError('Failed to fetch QRIS list');
        } finally {
            setIsLoading(false);
        }
    }, [activeTab]);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/logs');
            const data: ApiResponse<AdminLog[]> = await res.json();

            if (data.success && data.data) {
                setLogs(data.data);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        }
    }, []);

    useEffect(() => {
        fetchQris();
        fetchLogs();

        // Refresh logs every 10 seconds
        const interval = setInterval(fetchLogs, 10000);
        return () => clearInterval(interval);
    }, [fetchQris, fetchLogs]);

    const handleUploadSuccess = () => {
        fetchQris();
        fetchLogs();
    };

    const handleDeleteQris = async (id: string) => {
        if (!confirm('Are you sure you want to delete this QRIS?')) return;

        try {
            const res = await fetch(`/api/qris?id=${id}`, { method: 'DELETE' });
            const data: ApiResponse<null> = await res.json();

            if (data.success) {
                showSuccess('QRIS deleted successfully');
                fetchQris();
                fetchLogs();
            } else {
                throw new Error(data.error);
            }
        } catch {
            showError('Failed to delete QRIS');
        }
    };

    const handleMarkAsPaid = async (id: string) => {
        if (!confirm('Mark this QRIS as paid?')) return;

        try {
            const res = await fetch('/api/qris/mark-paid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qrisId: id }),
            });
            const data: ApiResponse<Qris> = await res.json();

            if (data.success) {
                showSuccess('QRIS marked as paid');
                fetchQris();
                fetchLogs();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to mark as paid';
            showError(message);
        }
    };

    const handleRegenerateQris = async () => {
        showWarning('Regenerate feature coming soon');
    };

    const [isChecking, setIsChecking] = useState(false);
    const [autoCheck, setAutoCheck] = useState(false);

    // Load autoCheck state from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('qris-auto-check');
        if (saved === 'true') {
            setAutoCheck(true);
        }
    }, []);

    // Save autoCheck state to localStorage
    const handleAutoCheckChange = (checked: boolean) => {
        setAutoCheck(checked);
        localStorage.setItem('qris-auto-check', checked.toString());
    };

    const handleCheckPayments = async () => {
        setIsChecking(true);
        try {
            const res = await fetch('/api/payment/check', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                if (data.data.updated > 0) {
                    showSuccess(`${data.data.updated} payment(s) detected!`);
                    fetchQris();
                    fetchLogs();
                } else {
                    showWarning(`Checked ${data.data.checked} orders, no changes`);
                }
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Check failed';
            showError(message);
        } finally {
            setIsChecking(false);
        }
    };

    // Auto-check payments every 60 seconds when enabled
    useEffect(() => {
        if (!autoCheck) return;

        // Run immediately when enabled
        handleCheckPayments();

        const interval = setInterval(() => {
            handleCheckPayments();
        }, 60000); // Check every 60 seconds

        return () => clearInterval(interval);
    }, [autoCheck]);

    const getTabCount = (status: string) => {
        if (status === 'all') return qrisList.length;
        return qrisList.filter(q => q.status === status).length;
    };

    const filteredQris = activeTab === 'all'
        ? qrisList
        : qrisList.filter(q => q.status === activeTab);

    // Show loading while checking auth
    if (isAuthLoading) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
                <div className="text-white text-lg">Loading...</div>
            </main>
        );
    }

    // Show login form if not authenticated
    if (!isAuthenticated) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center">
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-8 w-full max-w-md">
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/20 mb-4">
                            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white">Admin Login</h1>
                        <p className="text-gray-400 mt-2">Enter password to continue</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                autoFocus
                            />
                        </div>

                        {loginError && (
                            <p className="text-red-400 text-sm text-center">{loginError}</p>
                        )}

                        <button
                            type="submit"
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-semibold hover:from-purple-700 hover:to-pink-700 transition-all"
                        >
                            Login
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link href="/" className="text-gray-400 hover:text-white text-sm">
                            ← Back to QRIS List
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
            <Notification />

            {/* Header */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-gray-900/80 border-b border-gray-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">Admin Panel</h1>
                                <p className="text-sm text-gray-400">QRIS Management</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Auto-check toggle */}
                            <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-sm text-gray-400">Auto</span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={autoCheck}
                                        onChange={(e) => handleAutoCheckChange(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-10 h-5 rounded-full transition-colors ${autoCheck ? 'bg-green-600' : 'bg-gray-700'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform transform mt-0.5 ${autoCheck ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                </div>
                            </label>

                            {/* Check Payments button */}
                            <button
                                onClick={handleCheckPayments}
                                disabled={isChecking}
                                className="px-3 py-2 text-sm font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 disabled:opacity-50 rounded-lg border border-green-500/30 transition-all flex items-center gap-2"
                            >
                                {isChecking ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                                {isChecking ? 'Checking...' : 'Check Payments'}
                            </button>

                            <Link
                                href="/"
                                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-lg border border-gray-700/50 transition-all flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Public View
                            </Link>

                            <button
                                onClick={handleLogout}
                                className="px-4 py-2 text-sm font-medium text-red-300 hover:text-red-200 bg-red-900/30 hover:bg-red-900/50 rounded-lg border border-red-700/50 transition-all flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Column - Form & Logs */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Upload QRIS Form */}
                        <div className="p-6 bg-gray-800/50 rounded-2xl border border-gray-700/50">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Upload QRIS
                            </h2>
                            <QrisUploadForm onSuccess={handleUploadSuccess} />
                        </div>

                        {/* Activity Logs */}
                        <AdminLogPanel logs={logs} isLoading={isLoading} />
                    </div>

                    {/* Right Column - QRIS List */}
                    <div className="lg:col-span-2">
                        {/* Tabs */}
                        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
                            {(['all', 'pending', 'paid', 'expired'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === tab
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                        }`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-gray-700/50'
                                        }`}>
                                        {getTabCount(tab)}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* QRIS Grid */}
                        <QrisList
                            qrisList={filteredQris}
                            isLoading={isLoading}
                            showActions={true}
                            onDelete={handleDeleteQris}
                            onRegenerate={handleRegenerateQris}
                            onMarkAsPaid={handleMarkAsPaid}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}
