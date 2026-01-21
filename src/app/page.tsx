'use client';

import { useState, useEffect, useCallback } from 'react';
import { Qris, ApiResponse } from '@/types';
import QrisList from '@/components/QrisList';
import Notification, { showInfo, showWarning } from '@/components/Notification';

export default function PublicPage() {
  const [qrisList, setQrisList] = useState<Qris[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'expired'>('active');

  const fetchQris = useCallback(async () => {
    try {
      // Fetch all pending + paid + expired
      const res = await fetch('/api/qris?includeProduct=true');
      const data: ApiResponse<Qris[]> = await res.json();

      if (data.success && data.data) {
        setQrisList(data.data);
      }
    } catch (error) {
      console.error('Error fetching QRIS:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // SSE for real-time updates only (no polling)
  useEffect(() => {
    fetchQris();

    // Use SSE for real-time updates
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Refresh data on any QRIS-related event
            if (data.type === 'qris_created') {
              showInfo(`QRIS baru: Rp ${data.data.amount?.toLocaleString() || 0}`);
              fetchQris();
            } else if (data.type === 'qris_paid') {
              showInfo(`Pembayaran diterima: Rp ${data.data.amount?.toLocaleString() || 0}`);
              fetchQris();
            } else if (data.type === 'qris_expired') {
              showWarning(`QRIS expired`);
              fetchQris();
            } else if (data.type === 'qris_deleted') {
              fetchQris();
            }
          } catch {
            // Ignore parse errors
          }
        };

        eventSource.onerror = () => {
          eventSource?.close();
          // Reconnect after 5 seconds on error
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch {
        // SSE not supported, fallback to polling
        reconnectTimeout = setTimeout(connectSSE, 10000);
      }
    };

    connectSSE();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchQris]);

  // Filter logic
  const filteredQris = qrisList.filter(q => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active') return q.status === 'pending';
    if (activeFilter === 'expired') return q.status === 'expired';
    return true;
  });

  const getFilterCount = (filter: string) => {
    if (filter === 'all') return qrisList.length;
    if (filter === 'active') return qrisList.filter(q => q.status === 'pending').length;
    if (filter === 'expired') return qrisList.filter(q => q.status === 'expired').length;
    return 0;
  };

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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">QRIS Payment</h1>
                <p className="text-sm text-gray-400">Scan & Pay</p>
              </div>
            </div>

            <button
              onClick={() => fetchQris()}
              className="px-4 py-2 text-sm font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg border border-purple-500/30 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats & Filter */}
        <div className="mb-8 p-4 bg-gray-800/30 rounded-2xl border border-gray-700/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400">Showing</p>
                <p className="text-2xl font-bold text-white">{filteredQris.length} QRIS</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 bg-gray-800/50 p-1 rounded-xl">
              {(['active', 'expired', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeFilter === filter
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                >
                  {filter === 'active' ? 'Active' : filter === 'expired' ? 'Expired' : 'All'}
                  <span className="ml-2 text-xs opacity-75">({getFilterCount(filter)})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* QRIS Grid */}
        <QrisList qrisList={filteredQris} isLoading={isLoading} />

        {/* Instructions */}
        <div className="mt-12 p-6 bg-gray-800/30 rounded-2xl border border-gray-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Cara Pembayaran
          </h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-800/50 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">1</span>
              </div>
              <p className="text-sm text-gray-300">Pilih QRIS yang ingin dibayar</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">2</span>
              </div>
              <p className="text-sm text-gray-300">Tap untuk memperbesar QR code</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">3</span>
              </div>
              <p className="text-sm text-gray-300">Scan dengan aplikasi e-wallet / m-banking</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 py-6 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            QRIS Payment Generator © 2026
          </p>
        </div>
      </footer>
    </main>
  );
}

