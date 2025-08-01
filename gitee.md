
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKiZt/dIVv+gXrV09kDgA/L0CMZHJe2EKERtdEZSHHz/ cc@qq.com

git clone git@gitee.com:wyswydx/demo-project.git

git@gitee.com:wyswydx/demo-project.git



    <!-- 关键：强制使用一个现代的、兼容的 JSch 库来覆盖旧版本 -->
    <dependency>
        <groupId>com.github.mwiede</groupId>
        <artifactId>jsch</artifactId>
        <version>0.2.16</version> <!-- 这是一个稳定且兼容的版本 -->
    </dependency>


# -m PEM 是关键，它强制 ssh-keygen 生成旧的 PEM 格式
# -t rsa 指定密钥类型
# -b 4096 指定密钥长度
# -f gitee_demo_pem 指定输出文件名
# -N "" 指定一个空密码
ssh-keygen -m PEM -t rsa -b 4096 -f gitee_demo_pem -N ""