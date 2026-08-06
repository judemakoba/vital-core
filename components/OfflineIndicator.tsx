"use client";

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import styles from './OfflineIndicator.module.css';

export default function OfflineIndicator() {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        setIsOffline(!navigator.onLine);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className={styles.banner}>
            <WifiOff size={16} />
            <span>Working Offline - Changes may not sync hearth</span>
        </div>
    );
}
