/**
 * Self-signed TLS for the stack. HTTPS is what gives the browser a secure context,
 * which mic/voice (getUserMedia) requires off localhost. The cert covers localhost,
 * nero.local, and this machine's LAN IPs so https://<lan-ip>:<port> validates once
 * the cert is trusted on the device.
 */
import forge from 'node-forge';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { networkInterfaces } from 'os';
import { HOME } from './home';

export const CERT_DIR = join(HOME, 'certs');
export const CERT = join(CERT_DIR, 'cert.pem');
export const KEY = join(CERT_DIR, 'key.pem');
export const TLS_CONF = join(HOME, 'tls.conf');

export function certExists(): boolean {
    return existsSync(CERT) && existsSync(KEY);
}

// Docker/VM/virtual interfaces are not reachable from other devices on the LAN, so
// a phone that resolves nero.local to one of them just hangs. Skip them.
const VIRTUAL_IFACE = /^(bridge|docker|br-|veth|vmenet|utun|awdl|llw|tun|tap|gif|stf|ap)\d*/i;

/** This machine's real (physical) LAN IPv4 addresses, for cert SANs + mDNS. */
export function lanIps(): string[] {
    const out: string[] = [];
    for (const [name, addrs] of Object.entries(networkInterfaces())) {
        if (VIRTUAL_IFACE.test(name)) continue;
        for (const a of addrs ?? []) {
            if (a.family === 'IPv4' && !a.internal) out.push(a.address);
        }
    }
    return out;
}

const isIp = (h: string) => /^\d+\.\d+\.\d+\.\d+$/.test(h);

/** Generate + persist a 5-year self-signed cert covering localhost + the given hosts. */
export function ensureCert(): boolean {
    if (certExists()) return false;
    if (!existsSync(CERT_DIR)) mkdirSync(CERT_DIR, { recursive: true });

    const hosts = ['localhost', '127.0.0.1', 'nero.local', ...lanIps()];
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);
    const attrs = [
        { name: 'commonName', value: 'nero.local' },
        { name: 'organizationName', value: 'Nero' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        {
            name: 'subjectAltName',
            altNames: hosts.map((h) => (isIp(h) ? { type: 7, ip: h } : { type: 2, value: h })),
        },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    writeFileSync(CERT, forge.pki.certificateToPem(cert));
    writeFileSync(KEY, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
    // The nginx :443 server that the web container includes when TLS is on.
    writeFileSync(
        TLS_CONF,
        `server {
    listen 443 ssl;
    http2 on;
    server_name _;
    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    root /usr/share/nginx/html;
    index index.html;
    include /etc/nginx/nero-locations.conf;
}
`,
    );
    return true;
}
