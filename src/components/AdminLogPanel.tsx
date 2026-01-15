'use client';

import { AdminLog } from '@/types';
import { useState } from 'react';

interface AdminLogPanelProps {
    logs: AdminLog[];
    isLoading?: boolean;
}

export default function AdminLogPanel({ logs, isLoading = false }: AdminLogPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'error':
                return (
                    <span className="text-red-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </span>
                );
            case 'warning':
                return (
                    <span className="text-yellow-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </span>
                );
            default:
                return (
                    <span className="text-blue-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </span>
                );
        }
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const displayedLogs = isExpanded ? logs : logs.slice(0, 5);

    if (isLoading) {
        return (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                <div className="animate-pulse space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-start gap-3">
                            <div className="w-4 h-4 bg-gray-700 rounded-full" />
                            <div className="flex-1">
                                <div className="h-4 bg-gray-700 rounded w-3/4 mb-1" />
                                <div className="h-3 bg-gray-700/50 rounded w-1/4" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
            <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Activity Log
                </h3>
                <span className="text-sm text-gray-500">{logs.length} entries</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
                {logs.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No activity logs yet
                    </div>
                ) : (
                    <div className="divide-y divide-gray-700/30">
                        {displayedLogs.map((log) => (
                            <div key={log.id} className="p-4 hover:bg-gray-700/20 transition-colors">
                                <div className="flex items-start gap-3">
                                    {getLevelIcon(log.level)}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-gray-200">
                                                {log.action.replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                            <span className={`px-1.5 py-0.5 text-xs rounded ${log.level === 'error' ? 'bg-red-500/20 text-red-400' :
                                                    log.level === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {log.level}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400 break-words">
                                            {log.message}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {formatDate(log.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {logs.length > 5 && (
                <div className="p-3 border-t border-gray-700/50 text-center">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        {isExpanded ? 'Show less' : `Show ${logs.length - 5} more`}
                    </button>
                </div>
            )}
        </div>
    );
}
