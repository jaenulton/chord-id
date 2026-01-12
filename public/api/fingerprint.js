/**
 * Chord-ID Browser Fingerprinting Script
 *
 * Generates a consistent visitor ID based on browser/device characteristics.
 * Uses multiple signals to create a stable fingerprint that persists across sessions.
 *
 * Usage:
 *   import { getVisitorId, getSessionId, initTracker, track } from './fingerprint.js';
 *
 *   // Initialize on page load
 *   await initTracker();
 *
 *   // Get IDs for manual use
 *   const visitorId = getVisitorId();
 *   const sessionId = getSessionId();
 *
 *   // Track events
 *   track('page_view', { page_name: 'home' });
 */

const VISITOR_ID_KEY = 'chord_id_visitor';
const SESSION_ID_KEY = 'chord_id_session';
const COOKIE_EXPIRY_DAYS = 365;

/**
 * Generate a simple hash from a string
 * Uses djb2 algorithm for speed
 */
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Generate a more secure hash using Web Crypto API (SHA-256)
 */
async function secureHash(str) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        // Fallback to simple hash if crypto API not available
        return simpleHash(str);
    }
}

/**
 * Get canvas fingerprint
 * Renders text and shapes to detect GPU/driver differences
 */
function getCanvasFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');

        if (!ctx) return 'no-canvas';

        // Draw various elements
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(10, 1, 62, 20);

        ctx.fillStyle = '#069';
        ctx.fillText('Chord-ID', 2, 15);

        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Fingerprint', 4, 17);

        // Add some shapes
        ctx.beginPath();
        ctx.arc(50, 35, 10, 0, Math.PI * 2);
        ctx.fill();

        return canvas.toDataURL();
    } catch (e) {
        return 'canvas-error';
    }
}

/**
 * Get WebGL fingerprint (renderer info)
 */
function getWebGLFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!gl) return 'no-webgl';

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return 'no-debug-info';

        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

        return `${vendor}~${renderer}`;
    } catch (e) {
        return 'webgl-error';
    }
}

/**
 * Get audio fingerprint
 */
function getAudioFingerprint() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return 'no-audio-context';

        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const analyser = context.createAnalyser();
        const gain = context.createGain();
        const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

        // Get basic audio context properties
        const result = [
            context.sampleRate,
            context.destination.maxChannelCount,
            analyser.frequencyBinCount
        ].join('~');

        context.close();
        return result;
    } catch (e) {
        return 'audio-error';
    }
}

/**
 * Get installed fonts fingerprint (limited set for performance)
 */
function getFontsFingerprint() {
    const testFonts = [
        'Arial', 'Verdana', 'Times New Roman', 'Courier New',
        'Georgia', 'Palatino', 'Garamond', 'Comic Sans MS',
        'Impact', 'Monaco', 'Consolas', 'Segoe UI'
    ];

    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';

    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.fontSize = testSize;
    span.innerHTML = testString;
    document.body.appendChild(span);

    const baseWidths = {};
    for (const baseFont of baseFonts) {
        span.style.fontFamily = baseFont;
        baseWidths[baseFont] = span.offsetWidth;
    }

    const detectedFonts = [];
    for (const font of testFonts) {
        let detected = false;
        for (const baseFont of baseFonts) {
            span.style.fontFamily = `'${font}', ${baseFont}`;
            if (span.offsetWidth !== baseWidths[baseFont]) {
                detected = true;
                break;
            }
        }
        if (detected) {
            detectedFonts.push(font);
        }
    }

    document.body.removeChild(span);
    return detectedFonts.join(',');
}

/**
 * Collect all fingerprint components
 */
function collectFingerprint() {
    const components = {
        // Screen properties
        screenResolution: `${screen.width}x${screen.height}`,
        screenColorDepth: screen.colorDepth,
        screenPixelRatio: window.devicePixelRatio || 1,
        availableScreenSize: `${screen.availWidth}x${screen.availHeight}`,

        // Timezone
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),

        // Language
        language: navigator.language,
        languages: (navigator.languages || [navigator.language]).join(','),

        // Platform & browser
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        vendor: navigator.vendor || '',

        // Hardware
        hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
        deviceMemory: navigator.deviceMemory || 'unknown',
        maxTouchPoints: navigator.maxTouchPoints || 0,

        // Canvas fingerprint
        canvas: simpleHash(getCanvasFingerprint()),

        // WebGL fingerprint
        webgl: simpleHash(getWebGLFingerprint()),

        // Audio fingerprint
        audio: simpleHash(getAudioFingerprint()),

        // Do Not Track
        doNotTrack: navigator.doNotTrack || 'unknown',

        // Plugins (modern browsers restrict this)
        pluginsLength: navigator.plugins ? navigator.plugins.length : 0,

        // Cookie/storage support
        cookieEnabled: navigator.cookieEnabled,
        localStorage: !!window.localStorage,
        sessionStorage: !!window.sessionStorage,
        indexedDB: !!window.indexedDB,

        // Connection type (if available)
        connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown'
    };

    return components;
}

/**
 * Generate a stable visitor ID from fingerprint components
 */
async function generateVisitorId() {
    const components = collectFingerprint();

    // Create a stable string from key components
    const stableComponents = [
        components.screenResolution,
        components.screenColorDepth,
        components.timezone,
        components.language,
        components.platform,
        components.canvas,
        components.webgl,
        components.audio,
        components.hardwareConcurrency
    ].join('|');

    // Generate hash
    const hash = await secureHash(stableComponents);

    // Return first 32 characters
    return 'vid_' + hash.substring(0, 28);
}

/**
 * Generate a random session ID
 */
function generateSessionId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    return 'sid_' + hex;
}

/**
 * Set a cookie
 */
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * Get a cookie value
 */
function getCookie(name) {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(nameEQ) === 0) {
            return cookie.substring(nameEQ.length);
        }
    }
    return null;
}

/**
 * Get or create visitor ID
 * Checks localStorage, cookie, and generates new if needed
 */
let cachedVisitorId = null;

export async function getVisitorId() {
    if (cachedVisitorId) {
        return cachedVisitorId;
    }

    // Try localStorage first
    let visitorId = localStorage.getItem(VISITOR_ID_KEY);

    // Try cookie if not in localStorage
    if (!visitorId) {
        visitorId = getCookie(VISITOR_ID_KEY);
    }

    // Generate new if not found
    if (!visitorId) {
        visitorId = await generateVisitorId();
    }

    // Store in both localStorage and cookie for redundancy
    try {
        localStorage.setItem(VISITOR_ID_KEY, visitorId);
    } catch (e) {
        // localStorage might be disabled
    }
    setCookie(VISITOR_ID_KEY, visitorId, COOKIE_EXPIRY_DAYS);

    cachedVisitorId = visitorId;
    return visitorId;
}

/**
 * Get or create session ID
 * Session persists for the browser session (sessionStorage)
 */
let cachedSessionId = null;

export function getSessionId() {
    if (cachedSessionId) {
        return cachedSessionId;
    }

    // Try sessionStorage
    let sessionId = sessionStorage.getItem(SESSION_ID_KEY);

    // Generate new if not found
    if (!sessionId) {
        sessionId = generateSessionId();
        try {
            sessionStorage.setItem(SESSION_ID_KEY, sessionId);
        } catch (e) {
            // sessionStorage might be disabled
        }
    }

    cachedSessionId = sessionId;
    return sessionId;
}

/**
 * Get fingerprint metadata for tracking
 */
export function getMetadata() {
    const components = collectFingerprint();
    return {
        screen: components.screenResolution,
        timezone: components.timezone,
        language: components.language,
        platform: components.platform,
        userAgent: components.userAgent.substring(0, 200),  // Truncate for storage
        referrer: document.referrer || null,
        url: window.location.href
    };
}

/**
 * Initialize tracker and send init event
 */
let initialized = false;
let pollStatuses = {};

export async function initTracker(apiUrl = '/api/tracker.php') {
    if (initialized) {
        return { visitorId: cachedVisitorId, sessionId: cachedSessionId, pollStatuses };
    }

    const visitorId = await getVisitorId();
    const sessionId = getSessionId();
    const metadata = getMetadata();

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                visitor_id: visitorId,
                session_id: sessionId,
                action: 'init',
                metadata: metadata
            })
        });

        if (response.ok) {
            const data = await response.json();
            pollStatuses = data.poll_statuses || {};
            initialized = true;
        }
    } catch (e) {
        console.warn('Tracker init failed:', e);
    }

    return { visitorId, sessionId, pollStatuses };
}

/**
 * Track an event or page view
 */
export async function track(action, data = {}, apiUrl = '/api/tracker.php') {
    const visitorId = await getVisitorId();
    const sessionId = getSessionId();

    const payload = {
        visitor_id: visitorId,
        session_id: sessionId,
        action: action,
        ...data
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn('Track failed:', e);
    }

    return null;
}

/**
 * Track a page view
 */
export async function trackPageView(pageName, metadata = {}, apiUrl = '/api/tracker.php') {
    return track('page_view', {
        page_name: pageName,
        page_metadata: {
            ...metadata,
            url: window.location.href,
            title: document.title
        }
    }, apiUrl);
}

/**
 * Track a custom event
 */
export async function trackEvent(eventType, eventData = {}, apiUrl = '/api/tracker.php') {
    return track('event', {
        event_type: eventType,
        event_data: eventData
    }, apiUrl);
}

/**
 * Record a poll vote
 */
export async function trackPollVote(pollId, optionIndex, apiUrl = '/api/tracker.php') {
    const result = await track('poll_vote', {
        poll_id: pollId,
        option_index: optionIndex
    }, apiUrl);

    if (result && result.poll_status) {
        pollStatuses[pollId] = result.poll_status;
    }

    return result;
}

/**
 * Record a poll dismissal
 */
export async function trackPollDismiss(pollId, apiUrl = '/api/tracker.php') {
    const result = await track('poll_dismiss', {
        poll_id: pollId
    }, apiUrl);

    if (result && result.poll_status) {
        pollStatuses[pollId] = result.poll_status;
    }

    return result;
}

/**
 * Get poll status from cache or server
 */
export async function getPollStatus(pollId, apiUrl = '/api/tracker.php') {
    // Check cache first
    if (pollStatuses[pollId]) {
        return pollStatuses[pollId];
    }

    // Fetch from server
    const result = await track('get_poll_status', {
        poll_id: pollId
    }, apiUrl);

    if (result && result.poll_status) {
        pollStatuses[pollId] = result.poll_status;
        return result.poll_status;
    }

    return null;
}

/**
 * Send heartbeat to keep session alive
 */
export async function sendHeartbeat(apiUrl = '/api/tracker.php') {
    return track('heartbeat', {}, apiUrl);
}

/**
 * Get all cached poll statuses
 */
export function getCachedPollStatuses() {
    return { ...pollStatuses };
}

// Export for non-module usage
if (typeof window !== 'undefined') {
    window.ChordIdTracker = {
        getVisitorId,
        getSessionId,
        getMetadata,
        initTracker,
        track,
        trackPageView,
        trackEvent,
        trackPollVote,
        trackPollDismiss,
        getPollStatus,
        sendHeartbeat,
        getCachedPollStatuses
    };
}
