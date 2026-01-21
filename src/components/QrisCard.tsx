'use client';

import { Qris } from '@/types';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface QrisCardProps {
    qris: Qris;
    showActions?: boolean;
    onDelete?: (id: string) => void;
    onRegenerate?: (id: string) => void;
    onMarkAsPaid?: (id: string) => void;
}

export default function QrisCard({ qris, showActions = false, onDelete, onRegenerate, onMarkAsPaid }: QrisCardProps) {
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [isExpired, setIsExpired] = useState(false);
    const [isEnlarged, setIsEnlarged] = useState(false);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            const expiry = new Date(qris.expiresAt);
            const diff = expiry.getTime() - now.getTime();

            if (diff <= 0) {
                setIsExpired(true);
                setTimeLeft('Expired');
                return;
            }

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };

        calculateTimeLeft();
        const interval = setInterval(calculateTimeLeft, 1000);

        return () => clearInterval(interval);
    }, [qris.expiresAt]);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(price);
    };

    const getStatusBadge = () => {
        const statusColors: Record<string, string> = {
            pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            paid: 'bg-green-500/20 text-green-400 border-green-500/30',
            expired: 'bg-red-500/20 text-red-400 border-red-500/30',
            error: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        };

        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${statusColors[qris.status] || statusColors.error}`}>
                {qris.status.toUpperCase()}
            </span>
        );
    };

    return (
        <>
            <div className={`relative bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 ${isExpired ? 'opacity-60' : ''}`}>
                {/* Header */}
                <div className="p-4 border-b border-gray-700/50">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                {formatPrice(qris.amount)}
                            </p>
                        </div>
                        {getStatusBadge()}
                    </div>
                </div>

                {/* QRIS Image */}
                <div
                    className="p-4 bg-white cursor-pointer transition-transform hover:scale-[1.02]"
                    onClick={() => !isExpired && setIsEnlarged(true)}
                >
                    <div className="relative w-full aspect-square max-w-[200px] mx-auto">
                        <Image
                            src={qris.qrisImage}
                            alt="QRIS Payment"
                            fill
                            className="object-contain"
                            unoptimized
                        />
                    </div>
                    {!isExpired && (
                        <p className="text-center text-sm text-gray-600 mt-2">
                            Tap untuk scan
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700/50">
                    {/* Timer */}
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <svg className={`w-4 h-4 ${isExpired ? 'text-red-400' : 'text-yellow-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`text-sm font-mono ${isExpired ? 'text-red-400' : 'text-yellow-400'}`}>
                            {timeLeft}
                        </span>
                    </div>

                    {/* Actions */}
                    {showActions && (
                        <div className="flex flex-col gap-2">
                            {/* Mark as Paid button - only for pending */}
                            {qris.status === 'pending' && onMarkAsPaid && (
                                <button
                                    onClick={() => onMarkAsPaid(qris.id)}
                                    className="w-full px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Mark as Paid
                                </button>
                            )}
                            <div className="flex gap-2">
                                {isExpired && onRegenerate && (
                                    <button
                                        onClick={() => onRegenerate(qris.id)}
                                        className="flex-1 px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                    >
                                        Regenerate
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        onClick={() => onDelete(qris.id)}
                                        className="flex-1 px-3 py-2 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors"
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Enlarged Modal */}
            {isEnlarged && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => setIsEnlarged(false)}
                >
                    <div className="relative bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setIsEnlarged(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <p className="text-3xl font-bold text-purple-600 mb-4">
                            {formatPrice(qris.amount)}
                        </p>

                        <div className="relative w-full aspect-square">
                            <Image
                                src={qris.qrisImage}
                                alt="QRIS Payment"
                                fill
                                className="object-contain"
                                unoptimized
                            />
                        </div>

                        <p className="text-center text-gray-600 mt-4">
                            Scan menggunakan aplikasi e-wallet atau mobile banking
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
