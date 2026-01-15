'use client';

import { useState } from 'react';

interface ProductFormProps {
    onSubmit: (productUrl: string) => Promise<void>;
    isLoading?: boolean;
}

export default function ProductForm({ onSubmit, isLoading = false }: ProductFormProps) {
    const [productUrl, setProductUrl] = useState('');
    const [error, setError] = useState('');

    const validateUrl = (url: string): boolean => {
        if (!url.trim()) {
            setError('URL cannot be empty');
            return false;
        }

        if (!url.includes('tokopedia.com')) {
            setError('Please enter a valid Tokopedia product URL');
            return false;
        }

        setError('');
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateUrl(productUrl)) return;

        try {
            await onSubmit(productUrl);
            setProductUrl('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate QRIS');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="flex flex-col gap-4">
                <div className="relative">
                    <label htmlFor="productUrl" className="block text-sm font-medium text-gray-300 mb-2">
                        Tokopedia Product URL
                    </label>
                    <div className="relative">
                        <input
                            id="productUrl"
                            type="url"
                            value={productUrl}
                            onChange={(e) => {
                                setProductUrl(e.target.value);
                                if (error) setError('');
                            }}
                            placeholder="https://www.tokopedia.com/shop/product-name"
                            className={`w-full px-4 py-3 bg-gray-800/50 border ${error ? 'border-red-500/50' : 'border-gray-700/50'} rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all`}
                            disabled={isLoading}
                        />
                        {productUrl && !isLoading && (
                            <button
                                type="button"
                                onClick={() => setProductUrl('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {error && (
                        <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isLoading || !productUrl.trim()}
                    className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all ${isLoading || !productUrl.trim()
                            ? 'bg-gray-700 cursor-not-allowed'
                            : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                        }`}
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Generating QRIS...
                        </span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Generate QRIS
                        </span>
                    )}
                </button>
            </div>

            {/* Usage hints */}
            <div className="mt-4 p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    How to use
                </h4>
                <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
                    <li>Copy product URL from Tokopedia</li>
                    <li>Paste URL in the field above</li>
                    <li>Click &quot;Generate QRIS&quot;</li>
                    <li>Wait for QRIS to be generated</li>
                </ol>
            </div>
        </form>
    );
}
