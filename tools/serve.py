"""本地预览服务器。

和 python -m http.server 的唯一区别：每个响应都带上禁用缓存的头。
默认那个只发 Last-Modified、不发 Cache-Control，浏览器就会启发式地
直接用旧副本，改了文件刷新也看不到变化 —— 调试时这个坑很费时间。
"""
import functools
import http.server
import pathlib
import socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
PORT = 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        # 顺手把条件请求也废掉，否则仍可能收到 304
        self.headers.replace_header("If-Modified-Since", "") \
            if "If-Modified-Since" in self.headers else None
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        return super().send_head()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"serving {ROOT} at http://localhost:{PORT}/ (no-cache)")
        httpd.serve_forever()
