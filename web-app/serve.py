"""Real67 Studio yerel sunucusu.

WebHID yalnızca güvenli adreslerde (localhost) çalışır. Dosyalar önbelleğe alınmadan
gönderilir; uygulama güncellendiğinde tarayıcı eski JavaScript modüllerini kullanmaz.
"""
import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8667
    root = Path(__file__).resolve().parent
    handler = functools.partial(NoCacheHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as srv:
        print(f"Real67 Studio: http://localhost:{port}/  (kapatmak için Ctrl+C)")
        srv.serve_forever()


if __name__ == "__main__":
    main()
