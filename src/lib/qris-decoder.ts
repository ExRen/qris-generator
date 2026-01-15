import jsQR from 'jsqr';

interface QrisData {
    amount: number | null;
    merchantName: string | null;
    merchantCity: string | null;
    transactionId: string | null;
    rawData: string;
}

/**
 * Decode QRIS image and extract payment data
 * QRIS follows EMVCo QR Code Specification
 */
export async function decodeQrisFromBase64(base64Image: string): Promise<QrisData | null> {
    try {
        // Remove data URL prefix if present
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Create image data from buffer
        // We need to use a canvas-like approach for Node.js
        const { createCanvas, loadImage } = await import('canvas');

        // Load image
        const img = await loadImage(buffer);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Decode QR code
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

        if (!qrCode) {
            console.log('No QR code found in image');
            return null;
        }

        // Parse QRIS data (EMVCo format)
        return parseQrisData(qrCode.data);
    } catch (error) {
        console.error('Error decoding QRIS:', error);
        return null;
    }
}

/**
 * Parse QRIS EMVCo data format
 * Format: [ID][Length][Value]...
 */
function parseQrisData(data: string): QrisData {
    const result: QrisData = {
        amount: null,
        merchantName: null,
        merchantCity: null,
        transactionId: null,
        rawData: data,
    };

    try {
        let index = 0;

        while (index < data.length) {
            const id = data.substring(index, index + 2);
            const length = parseInt(data.substring(index + 2, index + 4), 10);

            if (isNaN(length)) break;

            const value = data.substring(index + 4, index + 4 + length);
            index += 4 + length;

            switch (id) {
                case '54': // Transaction Amount
                    result.amount = parseFloat(value) || null;
                    break;
                case '59': // Merchant Name
                    result.merchantName = value;
                    break;
                case '60': // Merchant City
                    result.merchantCity = value;
                    break;
                case '62': // Additional Data Field Template
                    // Parse sub-fields for transaction reference
                    result.transactionId = parseAdditionalData(value);
                    break;
            }
        }

        // If no amount found in tag 54, try to find it in the string
        if (!result.amount) {
            const amountMatch = data.match(/54(\d{2})(\d+)/);
            if (amountMatch) {
                const len = parseInt(amountMatch[1], 10);
                const amountStr = amountMatch[2].substring(0, len);
                result.amount = parseFloat(amountStr) || null;
            }
        }

    } catch (error) {
        console.error('Error parsing QRIS data:', error);
    }

    return result;
}

function parseAdditionalData(data: string): string | null {
    try {
        let index = 0;
        while (index < data.length) {
            const id = data.substring(index, index + 2);
            const length = parseInt(data.substring(index + 2, index + 4), 10);

            if (isNaN(length)) break;

            const value = data.substring(index + 4, index + 4 + length);
            index += 4 + length;

            if (id === '05' || id === '01') { // Reference Label or Bill Number
                return value;
            }
        }
    } catch {
        // Ignore parse errors
    }
    return null;
}
