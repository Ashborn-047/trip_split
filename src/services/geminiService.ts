/**
 * TripSplit - Gemini AI Service (Hardened)
 * 
 * AI TRUST BOUNDARY:
 * - Gemini output is a DRAFT only
 * - User confirmation is REQUIRED before persistence
 * - Unknown categories fall back to 'other'
 * - Malformed responses are rejected gracefully
 */

import type { AIReceiptDraft, ValidatedReceiptData, ExpenseCategory } from '../types';

// Valid categories that map directly to our enum
const VALID_CATEGORIES: ExpenseCategory[] = ['travel', 'food', 'stay', 'fun', 'other'];

/**
 * Maps AI-extracted category string to our internal enum.
 * Unknown or invalid values fall back to 'other'.
 */
function mapCategory(raw: string | null | undefined): ExpenseCategory {
    if (!raw) return 'other';

    const normalized = raw.toLowerCase().trim();

    // Direct match
    if (VALID_CATEGORIES.includes(normalized as ExpenseCategory)) {
        return normalized as ExpenseCategory;
    }

    // Common aliases
    const aliasMap: Record<string, ExpenseCategory> = {
        'transport': 'travel',
        'transportation': 'travel',
        'flight': 'travel',
        'taxi': 'travel',
        'uber': 'travel',
        'cab': 'travel',
        'restaurant': 'food',
        'meal': 'food',
        'dining': 'food',
        'cafe': 'food',
        'coffee': 'food',
        'hotel': 'stay',
        'lodging': 'stay',
        'accommodation': 'stay',
        'airbnb': 'stay',
        'entertainment': 'fun',
        'activity': 'fun',
        'ticket': 'fun',
        'miscellaneous': 'other',
        'misc': 'other',
    };

    return aliasMap[normalized] || 'other';
}

/**
 * Validates and sanitizes the AI response.
 * Returns null if response is unusable.
 */
function validateAIResponse(draft: AIReceiptDraft): ValidatedReceiptData | null {
    // Amount validation
    const amount = draft.amount;
    if (amount === null || amount === undefined || isNaN(amount) || amount <= 0) {
        console.warn('[AI] Invalid amount:', draft.amount);
        return null;
    }

    // Description validation
    const description = draft.description?.trim();
    if (!description || description.length === 0) {
        console.warn('[AI] Empty description');
        return null;
    }

    // Category mapping (never fails, defaults to 'other')
    const category = mapCategory(draft.rawCategory);

    return {
        amount: Math.round(amount * 100) / 100, // Ensure 2 decimal places
        description: description.slice(0, 100), // Cap at 100 chars
        category,
    };
}

/**
 * Parses Gemini response text to extract JSON.
 * Handles markdown code blocks and raw JSON.
 */
function parseGeminiResponse(text: string): AIReceiptDraft | null {
    try {
        // Remove markdown code block if present
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }

        const parsed = JSON.parse(cleaned);

        return {
            amount: typeof parsed.amount === 'number' ? parsed.amount : null,
            description: typeof parsed.desc === 'string' ? parsed.desc :
                typeof parsed.description === 'string' ? parsed.description : null,
            rawCategory: typeof parsed.category === 'string' ? parsed.category : null,
        };
    } catch (err) {
        console.error('[AI] Failed to parse response:', err);
        return null;
    }
}

/**
 * Scans a receipt image using Gemini AI.
 * 
 * IMPORTANT: Returns a DRAFT that must be confirmed by user.
 * The UI should show these values as editable defaults,
 * and only persist after explicit user confirmation.
 * 
 * @param base64Image - Base64-encoded image data (without data URL prefix)
 * @param mimeType - Image MIME type (e.g., 'image/jpeg')
 * @returns ValidatedReceiptData if successful, null if extraction failed
 */
export async function scanReceipt(
    base64Image: string,
    mimeType: string
): Promise<ValidatedReceiptData | null> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        console.error('[AI] Gemini API key not configured');
        return null;
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `Analyze this receipt image. Extract the total amount, a brief description (max 4 words), and category.
                
Return ONLY valid JSON in this exact format:
{"amount": <number>, "desc": "<string>", "category": "<travel|food|stay|fun|other>"}

If you cannot extract the information, return: {"amount": null, "desc": null, "category": null}`
                            },
                            {
                                inlineData: {
                                    mimeType,
                                    data: base64Image,
                                },
                            },
                        ],
                    }],
                }),
            }
        );

        if (!response.ok) {
            console.error('[AI] API request failed:', response.status);
            return null;
        }

        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.warn('[AI] Empty response from Gemini');
            return null;
        }

        const draft = parseGeminiResponse(text);
        if (!draft) {
            return null;
        }

        // Validate and sanitize before returning
        return validateAIResponse(draft);

    } catch (err) {
        console.error('[AI] Receipt scan failed:', err);
        return null;
    }
}

/**
 * Utility to read a File as base64.
 * Strips the data URL prefix for API compatibility.
 */
export function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = reader.result as string;
            // Strip "data:image/jpeg;base64," prefix
            const base64 = result.split(',')[1];
            resolve({ data: base64, mimeType: file.type });
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
