/**
 * Unit tests for the notifier module
 * Tests notification functions with mocked dependencies
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule('node-notifier', () => ({
  default: {
    notify: jest.fn()
  }
}));

jest.unstable_mockModule('axios', () => ({
  default: {
    post: jest.fn().mockResolvedValue({ status: 200 })
  }
}));

// Import mocked modules
const notifier = (await import('node-notifier')).default;
const axios = (await import('axios')).default;

const {
  sendNotification,
  sendWebhook,
  notifyMonitorDown,
  notifyMonitorUp,
  notifySSLExpiring,
  notifySSLExpired,
  notifySSLValid
} = await import('../../src/core/notifier.js');

describe('Notifier Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should call notifier.notify with correct parameters', () => {
      sendNotification('Test Title', 'Test Message');
      
      expect(notifier.notify).toHaveBeenCalledTimes(1);
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Title',
          message: 'Test Message',
          appID: 'Uptime Kit'
        })
      );
    });

    it('should include custom options', () => {
      sendNotification('Title', 'Message', { sound: false });
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          sound: false
        })
      );
    });
  });

  describe('sendWebhook', () => {
    const mockMonitor = {
      name: 'Test Site',
      url: 'https://test.com',
      webhook_url: 'https://webhook.example.com/hook'
    };

    it('should send webhook for monitor_down event', async () => {
      await sendWebhook(mockMonitor.webhook_url, 'monitor_down', mockMonitor);
      
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        'https://webhook.example.com/hook',
        expect.objectContaining({
          event: 'monitor_down',
          monitor: expect.objectContaining({
            name: 'Test Site',
            url: 'https://test.com',
            status: 'down'
          })
        })
      );
    });

    it('should send webhook for monitor_up event', async () => {
      await sendWebhook(mockMonitor.webhook_url, 'monitor_up', mockMonitor);
      
      expect(axios.post).toHaveBeenCalledWith(
        'https://webhook.example.com/hook',
        expect.objectContaining({
          event: 'monitor_up',
          monitor: expect.objectContaining({
            status: 'up'
          })
        })
      );
    });

    it('should not send webhook when webhookUrl is null', async () => {
      await sendWebhook(null, 'monitor_down', mockMonitor);
      
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should not send webhook when webhookUrl is undefined', async () => {
      await sendWebhook(undefined, 'monitor_down', mockMonitor);
      
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should handle webhook errors gracefully', async () => {
      axios.post.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(sendWebhook(mockMonitor.webhook_url, 'monitor_down', mockMonitor))
        .resolves.not.toThrow();
    });
  });

  describe('notifyMonitorDown', () => {
    it('should send notification with monitor name', () => {
      const monitor = { name: 'My Site', url: 'https://mysite.com', webhook_url: null };
      
      notifyMonitorDown(monitor);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '❌ Monitor Down',
          message: 'My Site is not responding'
        })
      );
    });

    it('should fallback to URL when name is not set', () => {
      const monitor = { name: null, url: 'https://mysite.com', webhook_url: null };
      
      notifyMonitorDown(monitor);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'https://mysite.com is not responding'
        })
      );
    });

    it('should send webhook when webhook_url is set', () => {
      const monitor = {
        name: 'My Site',
        url: 'https://mysite.com',
        webhook_url: 'https://webhook.example.com'
      };
      
      notifyMonitorDown(monitor);
      
      expect(axios.post).toHaveBeenCalled();
    });
  });

  describe('notifyMonitorUp', () => {
    it('should send notification with monitor name', () => {
      const monitor = { name: 'My Site', url: 'https://mysite.com', webhook_url: null };
      
      notifyMonitorUp(monitor);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '✅ Monitor Back Up',
          message: 'My Site is now responding'
        })
      );
    });

    it('should send webhook when webhook_url is set', () => {
      const monitor = {
        name: 'My Site',
        url: 'https://mysite.com',
        webhook_url: 'https://webhook.example.com'
      };
      
      notifyMonitorUp(monitor);
      
      expect(axios.post).toHaveBeenCalled();
    });
  });

  describe('notifySSLExpiring', () => {
    const monitor = { name: 'SSL Site', url: 'https://secure.com', webhook_url: null };

    it('should send critical notification when days <= 7', () => {
      notifySSLExpiring(monitor, 5);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '🚨 SSL Certificate Critical',
          message: 'SSL Site certificate expires in 5 days!'
        })
      );
    });

    it('should send warning notification when days <= 14', () => {
      notifySSLExpiring(monitor, 10);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '⚠️ SSL Certificate Warning',
          message: 'SSL Site certificate expires in 10 days'
        })
      );
    });

    it('should not send notification when days > 14', () => {
      notifySSLExpiring(monitor, 30);
      
      expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('should send webhook for ssl_expiring event', () => {
      const monitorWithWebhook = {
        ...monitor,
        webhook_url: 'https://webhook.example.com'
      };
      
      notifySSLExpiring(monitorWithWebhook, 5);
      
      expect(axios.post).toHaveBeenCalledWith(
        'https://webhook.example.com',
        expect.objectContaining({
          event: 'ssl_expiring'
        })
      );
    });
  });

  describe('notifySSLExpired', () => {
    it('should send expired notification', () => {
      const monitor = { name: 'SSL Site', url: 'https://secure.com', webhook_url: null };
      
      notifySSLExpired(monitor);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '❌ SSL Certificate Expired',
          message: 'SSL Site certificate has expired!'
        })
      );
    });
  });

  describe('notifySSLValid', () => {
    it('should send valid notification', () => {
      const monitor = { name: 'SSL Site', url: 'https://secure.com', webhook_url: null };
      
      notifySSLValid(monitor);
      
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '✅ SSL Certificate Valid',
          message: 'SSL Site certificate is now valid'
        })
      );
    });
  });
});
