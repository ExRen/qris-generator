'use client';

import { Qris } from '@/types';
import QrisCard from './QrisCard';

interface QrisListProps {
    qrisList: Qris[];
    showActions?: boolean;
    onDelete?: (id: string) => void;
    onRegenerate?: (id: string) => void;
    onMarkAsPaid?: (id: string) => void;
    isLoading?: boolean;
}

export default function QrisList({
    qrisList,
    showActions = false,
    onDelete,
    onRegenerate,
    onMarkAsPaid,
    isLoading = false
}: QrisListProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse">
                        <div className="bg-gray-800/50 rounded-2xl h-[400px]">
                            <div className="p-4 border-b border-gray-700/50">
                                <div className="h-6 bg-gray-700/50 rounded w-3/4 mb-2" />
                                <div className="h-8 bg-gray-700/50 rounded w-1/2" />
                            </div>
                            <div className="p-4 bg-gray-200">
                                <div className="aspect-square bg-gray-300 rounded" />
                            </div>
                            <div className="p-4">
                                <div className="h-4 bg-gray-700/50 rounded w-1/3 mx-auto" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (qrisList.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-800/50 mb-4">
                    <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-300 mb-2">
                    No QRIS Available
                </h3>
                <p className="text-gray-500">
                    Upload QRIS dari halaman admin
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {qrisList.map((qris) => (
                <QrisCard
                    key={qris.id}
                    qris={qris}
                    showActions={showActions}
                    onDelete={onDelete}
                    onRegenerate={onRegenerate}
                    onMarkAsPaid={onMarkAsPaid}
                />
            ))}
        </div>
    );
}

