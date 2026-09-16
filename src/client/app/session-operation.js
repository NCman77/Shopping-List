function normalizeUserId(userId) {
  return String(userId || '');
}

function normalizeChannel(channel) {
  return String(channel || '');
}

export function createSessionOperationTracker() {
  let generation = 0;
  let activeUserId = '';
  const latestRequests = new Map();

  function capture(userId) {
    return Object.freeze({
      userId: normalizeUserId(userId),
      generation
    });
  }

  function isSessionCurrent(operation, userId) {
    const expectedUserId = normalizeUserId(userId);
    return Boolean(
      operation
      && operation.userId === expectedUserId
      && activeUserId === expectedUserId
      && operation.generation === generation
    );
  }

  return Object.freeze({
    advance(userId) {
      generation += 1;
      activeUserId = normalizeUserId(userId);
      latestRequests.clear();
    },
    capture,
    nextRequest(channel, userId) {
      const normalizedChannel = normalizeChannel(channel);
      const requestId = (latestRequests.get(normalizedChannel) || 0) + 1;
      latestRequests.set(normalizedChannel, requestId);
      return Object.freeze({
        ...capture(userId),
        channel: normalizedChannel,
        requestId
      });
    },
    isSessionCurrent,
    isLatestRequest(operation, userId) {
      return Boolean(
        isSessionCurrent(operation, userId)
        && operation.channel
        && latestRequests.get(operation.channel) === operation.requestId
      );
    }
  });
}
