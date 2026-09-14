// A missing validation guard must fail a test, never consume a real model.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
  if (url.hostname !== '127.0.0.1' || url.port === '11434' || !url.port) {
    return Promise.reject(
      new Error('Tests may contact only temporary loopback fixture servers.'),
    );
  }
  return originalFetch(input, init);
};
