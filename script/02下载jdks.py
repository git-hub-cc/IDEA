import requests
import sys
from pathlib import Path
from tqdm import tqdm
from urllib.parse import unquote

# --- 配置 ---
# 要下载的 JDK 主版本范围 (包含8和21)
JDK_VERSIONS = range(8, 22)

# Adoptium API 的固定参数
OS_TYPE = "linux"
ARCH_TYPE = "x64"
IMAGE_TYPE = "jdk"
JVM_IMPL = "hotspot"
HEAP_SIZE = "normal"
VENDOR = "eclipse"
RELEASE_TYPE = "ga"  # General Availability (稳定版)

def download_jdk(version):
    """
    为指定版本创建一个目录，并下载最新的 JDK 到该目录中。
    """
    # 1. 为当前版本创建目标目录，例如 "jdk8", "jdk11"
    version_dir = Path(f"jdk{version}")
    version_dir.mkdir(parents=True, exist_ok=True)

    # 构建直接下载的 API URL
    api_url = (
        f"https://api.adoptium.net/v3/binary/latest/{version}/{RELEASE_TYPE}/"
        f"{OS_TYPE}/{ARCH_TYPE}/{IMAGE_TYPE}/{JVM_IMPL}/{HEAP_SIZE}/{VENDOR}"
    )

    print(f"\n--- 正在处理 JDK {version} (目标目录: {version_dir}/) ---")
    print(f"🔍 请求 API: {api_url}")

    try:
        # 使用 stream=True 和 allow_redirects=True 来处理重定向并获取文件流
        with requests.get(api_url, stream=True, allow_redirects=True, timeout=20) as r:
            # 如果 API 返回 404 或其他错误，则抛出异常
            r.raise_for_status()

            # 从重定向后的最终 URL 中提取文件名
            filename = Path(unquote(r.url)).name

            # 2. 定义文件在版本目录中的最终路径
            destination_path = version_dir / filename

            # 3. 检查文件是否已在版本目录中存在
            if destination_path.exists():
                print(f"✅ 文件已存在，跳过下载: {destination_path}")
                return

            # 从响应头获取文件总大小，用于进度条
            total_size = int(r.headers.get('content-length', 0))

            print(f"🚀 准备下载: {filename} ({total_size / (1024*1024):.2f} MB)")
            print(f"   保存到: {destination_path}")

            # 使用 tqdm 显示下载进度条
            with open(destination_path, 'wb') as f, tqdm(
                total=total_size,
                unit='iB',
                unit_scale=True,
                unit_divisor=1024,
                desc=filename,
                miniters=1
            ) as bar:
                for chunk in r.iter_content(chunk_size=8192):
                    bytes_written = f.write(chunk)
                    bar.update(bytes_written)

            print(f"👍 下载完成: {destination_path}")

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f"❌ 未找到 JDK {version} 的可用稳定版，跳过。")
        else:
            print(f"❌ HTTP 错误 (版本 {version}): {e}")
    except requests.exceptions.RequestException as e:
        print(f"❌ 网络请求失败 (版本 {version}): {e}")
    except Exception as e:
        print(f"❌ 发生未知错误 (版本 {version}): {e}")


def main():
    """主执行函数"""
    print("-" * 60)
    print("开始下载 JDK (版本 8-21) for Linux x64")
    print("每个版本的 JDK 将被保存到其专属的目录中 (例如 jdk8/, jdk11/)")
    print("-" * 60)

    for version in JDK_VERSIONS:
        download_jdk(version)

    print("\n🎉 所有下载任务已完成！")


if __name__ == "__main__":
    main()