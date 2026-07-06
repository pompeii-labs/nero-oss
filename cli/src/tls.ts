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
export const CERT = join(CERT_DIR, 'cert.pem'); // fullchain (leaf + CA) the server presents
export const KEY = join(CERT_DIR, 'key.pem'); // leaf private key
export const CA_CERT = join(CERT_DIR, 'ca.pem'); // the CA you install + trust on devices
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

/**
 * Generate a local CA (install + trust this on your devices) plus a short-lived leaf
 * the server presents. The split is required for iOS: only a CA can be enabled in
 * Certificate Trust Settings, and a TLS leaf must be <=825 days.
 */
export function ensureCert(): boolean {
    if (certExists()) return false;
    if (!existsSync(CERT_DIR)) mkdirSync(CERT_DIR, { recursive: true });

    const hosts = ['localhost', '127.0.0.1', 'nero.local', ...lanIps()];
    const serial = () => '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));

    // --- Local CA (long-lived, self-signed). This is what you install + trust. ---
    const caKeys = forge.pki.rsa.generateKeyPair(2048);
    const ca = forge.pki.createCertificate();
    ca.publicKey = caKeys.publicKey;
    ca.serialNumber = serial();
    ca.validity.notBefore = new Date();
    ca.validity.notAfter = new Date();
    ca.validity.notAfter.setFullYear(ca.validity.notBefore.getFullYear() + 10);
    const caAttrs = [
        { name: 'commonName', value: 'Nero Local CA' },
        { name: 'organizationName', value: 'Nero' },
    ];
    ca.setSubject(caAttrs);
    ca.setIssuer(caAttrs);
    ca.setExtensions([
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true },
        { name: 'subjectKeyIdentifier' },
    ]);
    ca.sign(caKeys.privateKey, forge.md.sha256.create());

    // --- Leaf (short-lived, signed by the CA, carries the SANs). Served by nginx. ---
    const leafKeys = forge.pki.rsa.generateKeyPair(2048);
    const leaf = forge.pki.createCertificate();
    leaf.publicKey = leafKeys.publicKey;
    leaf.serialNumber = serial();
    leaf.validity.notBefore = new Date();
    leaf.validity.notAfter = new Date();
    leaf.validity.notAfter.setDate(leaf.validity.notBefore.getDate() + 800); // < iOS 825-day cap
    leaf.setSubject([{ name: 'commonName', value: 'nero.local' }]);
    leaf.setIssuer(caAttrs);
    leaf.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        {
            name: 'subjectAltName',
            altNames: hosts.map((h) => (isIp(h) ? { type: 7, ip: h } : { type: 2, value: h })),
        },
    ]);
    leaf.sign(caKeys.privateKey, forge.md.sha256.create());

    // cert.pem = leaf + CA (the fullchain nginx presents); ca.pem = install this.
    writeFileSync(CERT, forge.pki.certificateToPem(leaf) + forge.pki.certificateToPem(ca));
    writeFileSync(KEY, forge.pki.privateKeyToPem(leafKeys.privateKey), { mode: 0o600 });
    writeFileSync(CA_CERT, forge.pki.certificateToPem(ca));
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
