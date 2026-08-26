from http.server import HTTPServer, BaseHTTPRequestHandler
import requests

class ProxyHTTPRequestHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        print("=== REQUEST ===")
        print("Path:", self.path)
        for k, v in self.headers.items():
            print(f"{k}: {v}")
        print("Body:", post_data)
        self.send_response(200)
        self.send_header('Content-Length', '0')
        self.end_headers()

server_address = ('127.0.0.1', 9999)
httpd = HTTPServer(server_address, ProxyHTTPRequestHandler)
httpd.serve_forever()
