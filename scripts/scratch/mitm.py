import socket, threading

def handle(client):
    req = client.recv(4096)
    print("=== REQUEST ===")
    print(req.decode('utf-8', 'replace'))
    client.close()

s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', 9999))
s.listen(5)
print("Listening on 9999...")
while True:
    c, a = s.accept()
    threading.Thread(target=handle, args=(c,)).start()
