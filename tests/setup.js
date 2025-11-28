import { jest } from '@jest/globals';

jest.setTimeout(10000);

const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

afterAll(async () => {

  await new Promise(resolve => setTimeout(resolve, 100));
});
