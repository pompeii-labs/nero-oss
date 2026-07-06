/**
 * mDNS responder so `nero.local` resolves to this host on the LAN - no IP to type,
 * no /etc/hosts edit. Runs on the HOST (multicast doesn't cross Docker's NAT on a
 * Mac), folded into the host-runner daemon that `nero start` launches.
 */
import makeMdns from 'multicast-dns';
import { lanIps } from './tls';

export function startMdns(hostnames = ['nero.local']): () => void {
    const ips = lanIps();
    if (!ips.length) return () => {};
    const m = makeMdns();
    m.on('query', (query) => {
        for (const q of query.questions) {
            if (!hostnames.includes(q.name)) continue;
            if (q.type === 'A' || q.type === 'ANY') {
                m.respond({
                    answers: ips.map((ip) => ({ name: q.name, type: 'A', ttl: 120, data: ip })),
                });
            }
        }
    });
    console.log(`nero mdns: ${hostnames.join(', ')} -> ${ips.join(', ')}`);
    return () => m.destroy();
}

if (import.meta.main) {
    startMdns();
    // keep the process alive
    setInterval(() => {}, 1 << 30);
}
