// Plain UDP for hqpweb's phone app: asking addresses directly, to find HQPlayer and Roon Cores
// without multicast (which iOS allows only with an entitlement Apple grants to paid accounts).
// The page's side is apps/mobile src/udp.ts; the sweep itself is @app/protocol sweep.ts.
//
// udpAsk({ hosts, port, data, waitMs }) -> { replies: [{ host, data }], sent, error }: one
// datagram to each host from one socket, then whatever comes back within the wait, with the
// address each reply came from. interfaces() -> { interfaces: [{ name, address, netmask }] }:
// this device's IPv4 addresses, up and not loopback. Bytes cross as base64.
import Capacitor
import Darwin
import Foundation

extension TcpPlugin {
    @objc func udpAsk(_ call: CAPPluginCall) {
        guard let hosts = call.getArray("hosts", String.self), let port = call.getInt("port"), (1...65_535).contains(port),
              let b64 = call.getString("data"), let payload = Data(base64Encoded: b64) else {
            call.reject("hosts, port and base64 data are required")
            return
        }
        let waitMs = max(100, min(call.getInt("waitMs") ?? 1500, 10_000))
        DispatchQueue.global(qos: .userInitiated).async {
            let fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
            guard fd >= 0 else {
                call.reject("can't open a UDP socket: \(String(cString: strerror(errno)))")
                return
            }
            defer { Darwin.close(fd) }
            var tv = timeval(tv_sec: 0, tv_usec: 50_000) // wake to check the deadline
            setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

            var sent = 0
            var lastError = ""
            for host in hosts {
                var addr = sockaddr_in()
                addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
                addr.sin_family = sa_family_t(AF_INET)
                addr.sin_port = in_port_t(UInt16(port)).bigEndian
                guard inet_pton(AF_INET, host, &addr.sin_addr) == 1 else { continue }
                let n = payload.withUnsafeBytes { bytes in
                    withUnsafePointer(to: &addr) {
                        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                            sendto(fd, bytes.baseAddress, payload.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                        }
                    }
                }
                if n >= 0 { sent += 1 } else { lastError = String(cString: strerror(errno)) }
            }

            var replies: [[String: String]] = []
            var buf = [UInt8](repeating: 0, count: 65_536)
            let deadline = Date().addingTimeInterval(Double(waitMs) / 1000)
            while Date() < deadline && replies.count < 1024 {
                var from = sockaddr_in()
                var len = socklen_t(MemoryLayout<sockaddr_in>.size)
                let n = withUnsafeMutablePointer(to: &from) {
                    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(fd, &buf, buf.count, 0, $0, &len) }
                }
                guard n > 0 else { continue }
                var ip = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                inet_ntop(AF_INET, &from.sin_addr, &ip, socklen_t(INET_ADDRSTRLEN))
                replies.append(["host": String(cString: ip), "data": Data(buf[0..<n]).base64EncodedString()])
            }
            call.resolve(["replies": replies, "sent": sent, "error": lastError])
        }
    }

    @objc func interfaces(_ call: CAPPluginCall) {
        var list: [[String: String]] = []
        var ifap: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifap) == 0, let first = ifap else {
            call.resolve(["interfaces": list])
            return
        }
        defer { freeifaddrs(ifap) }
        func numeric(_ sa: UnsafeMutablePointer<sockaddr>) -> String {
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
            return String(cString: host)
        }
        for p in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let i = p.pointee
            guard let addr = i.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET), let mask = i.ifa_netmask,
                  i.ifa_flags & UInt32(IFF_UP) != 0, i.ifa_flags & UInt32(IFF_LOOPBACK) == 0 else { continue }
            list.append(["name": String(cString: i.ifa_name), "address": numeric(addr), "netmask": numeric(mask)])
        }
        call.resolve(["interfaces": list])
    }
}
