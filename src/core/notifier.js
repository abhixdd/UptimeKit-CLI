import notifier from 'node-notifier';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function sendWebhook(webhookUrl, event, monitor) {
    if (!webhookUrl) return;

    try {
        const payload = {
            event: event,
            monitor: {
                name: monitor.name,
                url: monitor.url,
                status: event === 'monitor_down' ? 'down' : 'up',
                time: new Date().toISOString()
            }
        };

        await axios.post(webhookUrl, payload);
    } catch (error) {
        console.error(`Failed to send webhook to ${webhookUrl}:`, error.message);
    }
}

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

export function notifyMonitorDown(monitor) {
    const displayName = monitor.name || monitor.url;
    sendNotification(
        '❌ Monitor Down',
        `${displayName} is not responding`,
        { sound: true }
    );

    if (monitor.webhook_url) {
        sendWebhook(monitor.webhook_url, 'monitor_down', monitor);
    }
}

export function notifyMonitorUp(monitor) {
    const displayName = monitor.name || monitor.url;
    sendNotification(
        '✅ Monitor Back Up',
        `${displayName} is now responding`,
        { sound: true }
    );

    if (monitor.webhook_url) {
        sendWebhook(monitor.webhook_url, 'monitor_up', monitor);
    }
}
