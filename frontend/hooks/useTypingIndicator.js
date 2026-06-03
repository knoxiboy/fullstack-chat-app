import { useRef, useCallback, useEffect } from "react";
import { getSocket } from "../lib/socket";

/**
 * Custom hook for optimizing real-time chat typing indicator event transmissions.
 * Throttles outgoing "typing" events to mitigate network congestion and debounces
 * "stopTyping" occurrences to ensure accurate remote client state synchronization.
 *
 * @param {string} receiverId - The unique database ID of the message recipient.
 * @returns {Object} Control method wrapper containing the throttled handler.
 */
export default function useTypingIndicator(receiverId) {
    // Tracks the active debounce timeout handles to capture input termination
    const timeoutRef = useRef(null);
    
    // Reference lock flag to throttle repetitive outward socket streams
    const isTypingEmitRef = useRef(false);

    /**
     * Evaluates active user keystrokes and coordinates throttled state transmissions.
     * Prevents flood overflows by blocking outgoing keystroke events during active intervals.
     */
    const emitTyping = useCallback(() => {
    // GSSoC Issue #51 Fix
    const lastEmitRef = useRef(0);
    const emitTyping = () => {
        const socket = getSocket();
        
        // Prevent event execution if socket links or receiver targets are unmapped
        if (!socket || !receiverId) return;

        // NETWORK OPTIMIZATION: If we haven't announced typing status within this buffer window, send it!
        if (!isTypingEmitRef.current) {
            socket.emit("typing", { receiverId });
            isTypingEmitRef.current = true; // Lock the throttle gates
        }

        // Clear active stop-typing timeouts to recalculate inactivity windows dynamically
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Establish debounce timers to safely detect when user input halts completely
        const now = Date.now();
        if (now - lastEmitRef.current > 1000) {
            socket.emit("typing", { receiverId });
            lastEmitRef.current = now;
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            socket.emit("stopTyping", { receiverId });
            isTypingEmitRef.current = false; // Open the throttle gates for subsequent loops
        }, 2500); // 2.5-second inactivity window
    }, [receiverId]);

    /**
     * UNMOUNT CLEANUP
     * Safely clears memory hooks and guarantees clean state tear downs if the 
     * user closes the conversation channel mid-keystroke.
     */
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return { emitTyping };
}