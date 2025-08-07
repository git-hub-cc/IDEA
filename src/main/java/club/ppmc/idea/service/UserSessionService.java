/**
 * UserSessionService.java
 *
 * 该服务用于管理单用户会话，以确保在任何给定时间只有一个用户（WebSocket连接）能够与应用的核心功能交互。
 * 它使用原子操作来安全地处理会话的锁定和解锁，防止竞态条件。
 * 它与 WebSocketSessionListener 紧密协作，在连接和断开事件时自动调用。
 */
package club.ppmc.idea.service;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class UserSessionService {

    private final AtomicBoolean isLocked = new AtomicBoolean(false);
    private final AtomicReference<String> activeSessionId = new AtomicReference<>(null);

    /**
     * 尝试为给定的会话 ID 锁定应用。
     * 这是一个原子操作，只有在应用未锁定时才能成功。
     *
     * @param sessionId 尝试获取锁的 WebSocket 会话 ID。
     * @return 如果成功获取锁，返回 true；否则返回 false。
     */
    public boolean lock(String sessionId) {
        // 使用 compareAndSet 确保原子性：仅当当前值为 false 时，才设置为 true 并返回 true。
        if (isLocked.compareAndSet(false, true)) {
            activeSessionId.set(sessionId);
            log.info("应用已被会话 {} 锁定。", sessionId);
            return true;
        }
        log.warn("会话 {} 尝试获取锁失败，应用已被会话 {} 锁定。", sessionId, activeSessionId.get());
        return false;
    }

    /**
     * 为给定的会话 ID 解锁应用。
     * 只有当前持有锁的会话才能成功解锁，这可以防止其他会话错误地释放锁。
     *
     * @param sessionId 尝试释放锁的 WebSocket 会话 ID。
     */
    public void unlock(String sessionId) {
        // 使用 compareAndSet 来原子地检查并清除持有者
        if (activeSessionId.compareAndSet(sessionId, null)) {
            isLocked.set(false);
            log.info("应用已由会话 {} 解锁。", sessionId);
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