'use client';

import { useState, useRef } from 'react';
import { showSuccess, showError, showInfo } from './Notification';

interface QrisUploadFormProps {
    onSuccess: () => void;
}

export default function QrisUploadForm({ onSuccess }: QrisUploadFormProps) {
    const [orderId, setOrderId] = useState('');
    const [expiryMinutes, setExpiryMinutes] = useState('auto');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('Image size must be less than 5MB');
            return;
        }

        // Read file as base64
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setImagePreview(base64);
            setImageBase64(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const input = fileInputRef.current;
            if (input) {
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                handleImageChange({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!imageBase64) {
            showError('Please upload a QRIS image');
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch('/api/qris/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64,
                    orderId: orderId.trim() || undefined,
                    expiryMinutes: expiryMinutes === 'auto' ? 0 : (parseInt(expiryMinutes) || 15),
                    useAutoExpiry: expiryMinutes === 'auto',
                }),
            });

            const data = await res.json();

            if (data.success) {
                // Show amount if detected
                if (data.message?.includes('Detected')) {
                    showInfo(data.message);
                } else {
                    showSuccess('QRIS uploaded successfully!');
                }

                // Reset form
                setOrderId('');
                setImagePreview(null);
                setImageBase64(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
                onSuccess();
            } else {
                showError(data.error || 'Failed to upload QRIS');
            }
        } catch (error) {
            showError('Network error. Please try again.');
            console.error('Upload error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Image Upload */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    QRIS Image <span className="text-red-400">*</span>
                </label>
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${imagePreview
                        ? 'border-purple-500/50 bg-purple-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                        }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                    />

                    {imagePreview ? (
                        <div className="space-y-2">
                            <img
                                src={imagePreview}
                                alt="QRIS Preview"
                                className="max-h-48 mx-auto rounded-lg"
                            />
                            <p className="text-sm text-gray-400">Click or drag to replace</p>
                        </div>
                    ) : (
                        <div className="py-4">
                            <svg className="w-10 h-10 mx-auto text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-gray-400">Click or drag QRIS image here</p>
                            <p className="text-sm text-gray-500 mt-1">Amount auto-detected</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Order ID - Required for auto payment check */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Order ID <span className="text-yellow-400">(untuk auto-check)</span>
                </label>
                <input
                    type="text"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="INV/20240114/MPL/..."
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">Salin dari halaman checkout Tokopedia</p>
            </div>

            {/* Expiry Time */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Expires In
                </label>
                <select
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                >
                    <option value="auto">🔄 Auto (Tokopedia Deadline)</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="1440">24 hours</option>
                </select>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isLoading || !imageBase64}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2"
            >
                {isLoading ? (
                    <>
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                    </>
                ) : (
                    <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload QRIS
                    </>
                )}
            </button>
        </form>
    );
}
