/**
 * GitCredentialsRequest.java
 *
 * 一个新的数据传输对象 (DTO)，用于封装从前端传递到后端的Git凭证信息。
 * 这样可以避免将敏感信息作为查询参数传递，并提供一个清晰、结构化的数据模型。
 */
package club.ppmc.idea.model;

/**
 * 封装了执行需要认证的Git操作所需的所有凭证。
 *
 * @param token           个人访问令牌 (Personal Access Token)，用于HTTPS操作和API调用。
 * @param platform        Git托管平台，例如 "gitee" 或 "github"。
 * @param sshKeyPath      SSH私钥在服务器上的绝对路径。
 * @param sshPassphrase   SSH私钥的密码（如果已加密）。
 */
public record GitCredentialsRequest(
        String token,
        String platform,
        String sshKeyPath,
        String sshPassphrase
) {}