package com.example.webideabackend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 管理单用户会话的服务，确保同一时间只有一个用户在使用应用。
 */
@Service
@Slf4j
public class UserSessionService {

    // 使用 AtomicBoolean 保证 'isLocked' 状态的线程安全
    private final AtomicBoolean isLocked = new AtomicBoolean(false);
    // 存储当前活动用户的 WebSocket session ID
    private final AtomicReference<String> activeSessionId = new AtomicReference<>(null);

    /**
     * 尝试为给定的会话 ID 锁定应用。
     * 这是一个原子操作，只有在应用未锁定时才能成功。
     *
     * @param sessionId 尝试获取锁的会话 ID。
     * @return 如果成功获取锁，返回 true；否则返回 false。
     */
    public boolean lock(String sessionId) {
        // 使用 compareAndSet 确保原子性：如果当前是 false，则设置为 true 并返回 true
        if (isLocked.compareAndSet(false, true)) {
            activeSessionId.set(sessionId);
            log.info("应用程序已由会话 {} 锁定。", sessionId);
            return true;
        }
        log.warn("会话 {} 尝试获取锁失败，应用已被会话 {} 锁定。", sessionId, activeSessionId.get());
        return false;
    }

    /**
     * 为给定的会话 ID 解锁应用。
     * 只有当前持有锁的会话才能成功解锁。
     *
     * @param sessionId 尝试释放锁的会话 ID。
     */
    public void unlock(String sessionId) {
        String currentLocker = activeSessionId.get();
        // 只有当前持有锁的会话才能解锁
        if (currentLocker != null && currentLocker.equals(sessionId)) {
            isLocked.set(false);
            activeSessionId.set(null);
            log.info("应用程序已由会话 {} 解锁。", sessionId);
        }
    }

    /**
     * 检查应用当前是否被锁定。
     *
     * @return 如果应用被锁定，返回 true。
     */
    public boolean isLocked() {
        return isLocked.get();
    }
}