import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthSessionController } from './auth-session.js';

test('signing in starts data synchronization for the authenticated Firebase user', () => {
    const startedUsers = [];
    let resetCount = 0;
    const controller = createAuthSessionController({
        startSession: (user) => startedUsers.push(user.uid),
        stopSession: () => {},
        resetSession: () => { resetCount += 1; },
        rejectAnonymous: () => {}
    });

    controller.handleAuthState({
        uid: 'google-user-123',
        displayName: '小新',
        email: 'shinchan@example.com',
        photoURL: 'https://example.com/avatar.png'
    });

    assert.equal(controller.getActiveUserId(), 'google-user-123');
    assert.deepEqual(startedUsers, ['google-user-123']);
    assert.equal(resetCount, 1);
});

test('signing out stops synchronization and resets private session state', () => {
    const events = [];
    const controller = createAuthSessionController({
        startSession: (user) => events.push(`start:${user.uid}`),
        stopSession: (userId) => events.push(`stop:${userId}`),
        resetSession: () => events.push('reset'),
        rejectAnonymous: () => {}
    });

    controller.handleAuthState({ uid: 'google-user-123' });
    controller.handleAuthState(null);

    assert.equal(controller.getActiveUserId(), null);
    assert.deepEqual(events, [
        'reset',
        'start:google-user-123',
        'stop:google-user-123',
        'reset'
    ]);
});

test('switching accounts stops the previous user before starting the next user', () => {
    const events = [];
    const controller = createAuthSessionController({
        startSession: (user) => events.push(`start:${user.uid}`),
        stopSession: (userId) => events.push(`stop:${userId}`),
        resetSession: () => events.push('reset'),
        rejectAnonymous: () => {}
    });

    controller.handleAuthState({ uid: 'first-user' });
    controller.handleAuthState({ uid: 'second-user' });

    assert.equal(controller.getActiveUserId(), 'second-user');
    assert.deepEqual(events, [
        'reset',
        'start:first-user',
        'stop:first-user',
        'reset',
        'start:second-user'
    ]);
});

test('an anonymous Firebase session is rejected instead of starting synchronization', () => {
    const events = [];
    const anonymousUser = { uid: 'legacy-anonymous-user', isAnonymous: true };
    const controller = createAuthSessionController({
        startSession: (user) => events.push(`start:${user.uid}`),
        stopSession: (userId) => events.push(`stop:${userId}`),
        resetSession: () => events.push('reset'),
        rejectAnonymous: (user) => events.push(`reject:${user.uid}`)
    });

    controller.handleAuthState(anonymousUser);

    assert.equal(controller.getActiveUserId(), null);
    assert.deepEqual(events, ['reset', 'reject:legacy-anonymous-user']);
});
