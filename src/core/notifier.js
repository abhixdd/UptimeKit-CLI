import notifier from 'node-notifier';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function sendNotification(title, message, options = {}) {
    try {
        const iconPath = path.join(__dirname, '../assets/icon.png');

        notifier.notify({
            title: title,
            message: message,
            icon: iconPath,
            contentImage: iconPath,
            appID: 'Uptime Kit',
            sound: options.sound !== false,
            wait: false,
            ...options
        });
    } catch (error) {
        console.error('Failed to send notification:', error.message);
    }
}

export function notifyMonitorDown(monitorName, monitorUrl) {
    const displayName = monitorName || monitorUrl;
    sendNotification(
        '❌ Monitor Down',
        `${displayName} is not responding`,
        { sound: true }
    );
}

export function notifyMonitorUp(monitorName, monitorUrl) {
    const displayName = monitorName || monitorUrl;
    sendNotification(
        '✅ Monitor Back Up',
        `${displayName} is now responding`,
        { sound: true }
    );
}
