import forge from 'node-forge';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config.js';
import { Logger } from '../util/logger.js';

export interface TlsCerts {
    key: string;
    cert: string;
    ca: string;
}

const logger = new Logger('TLS');
const CERTS_DIR_NAME = 'certs';
const CA_KEY_FILE = 'ca-key.pem';
const CA_CERT_FILE = 'ca.pem';
const LEAF_KEY_FILE = 'leaf-key.pem';
const LEAF_CERT_FILE = 'leaf.pem';
const CA_VALIDITY_YEARS = 10;
const LEAF_VALIDITY_YEARS = 2;
const LEAF_RENEW_DAYS = 30;

function getCertsDir(): string {
    return join(getConfigDir(), CERTS_DIR_NAME);
}

export function getCaCertPath(): string {
    return join(getCertsDir(), CA_CERT_FILE);
}

function generateKeyPair(): forge.pki.rsa.KeyPair {
    return forge.pki.rsa.generateKeyPair(2048);
}

function createCaCert(keys: forge.pki.rsa.KeyPair): forge.pki.Certificate {
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + CA_VALIDITY_YEARS);

    const attrs = [
        { name: 'commonName', value: 'Nero Local CA' },
        { name: 'organizationName', value: 'Nero' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
        { name: 'basicConstraints', cA: true },
        {
            name: 'keyUsage',
            keyCertSign: true,
            cRLSign: true,
        },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());
    return cert;
}

function createLeafCert(
    leafKeys: forge.pki.rsa.KeyPair,
    caCert: forge.pki.Certificate,
    caKey: forge.pki.rsa.PrivateKey,
): forge.pki.Certificate {
    const cert = forge.pki.createCertificate();
    cert.publicKey = leafKeys.publicKey;
    cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + LEAF_VALIDITY_YEARS);

    cert.setSubject([
        { name: 'commonName', value: 'nero.local' },
        { name: 'organizationName', value: 'Nero' },
    ]);
    cert.setIssuer(caCert.subject.attributes);

    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        {
            name: 'keyUsage',
            digitalSignature: true,
            keyEncipherment: true,
        },
        {
            name: 'extKeyUsage',
            serverAuth: true,
        },
        {
            name: 'subjectAltName',
            altNames: [
                { type: 2, value: 'nero.local' },
                { type: 2, value: 'localhost' },
                { type: 7, ip: '127.0.0.1' },
                { type: 7, ip: '::1' },
            ],
        },
    ]);

    cert.sign(caKey, forge.md.sha256.create());
    return cert;
}

function isExpiringSoon(pem: string, days: number): boolean {
    const cert = forge.pki.certificateFromPem(pem);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);
    return cert.validity.notAfter < threshold;
}

async function generateAll(certsDir: string): Promise<TlsCerts> {
    logger.info('Generating TLS certificates...');

    const caKeys = generateKeyPair();
    const caCert = createCaCert(caKeys);

    const leafKeys = generateKeyPair();
    const leafCert = createLeafCert(leafKeys, caCert, caKeys.privateKey);

    const caKeyPem = forge.pki.privateKeyToPem(caKeys.privateKey);
    const caCertPem = forge.pki.certificateToPem(caCert);
    const leafKeyPem = forge.pki.privateKeyToPem(leafKeys.privateKey);
    const leafCertPem = forge.pki.certificateToPem(leafCert);

    await writeFile(join(certsDir, CA_KEY_FILE), caKeyPem);
    await writeFile(join(certsDir, CA_CERT_FILE), caCertPem);
    await writeFile(join(certsDir, LEAF_KEY_FILE), leafKeyPem);
    await writeFile(join(certsDir, LEAF_CERT_FILE), leafCertPem);

    logger.success('TLS certificates generated');
    return { key: leafKeyPem, cert: leafCertPem, ca: caCertPem };
}

async function regenerateLeaf(certsDir: string): Promise<TlsCerts> {
    logger.info('Leaf certificate expiring soon, regenerating...');

    const caKeyPem = await readFile(join(certsDir, CA_KEY_FILE), 'utf-8');
    const caCertPem = await readFile(join(certsDir, CA_CERT_FILE), 'utf-8');
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);
    const caCert = forge.pki.certificateFromPem(caCertPem);

    const leafKeys = generateKeyPair();
    const leafCert = createLeafCert(leafKeys, caCert, caKey);
    const leafKeyPem = forge.pki.privateKeyToPem(leafKeys.privateKey);
    const leafCertPem = forge.pki.certificateToPem(leafCert);

    await writeFile(join(certsDir, LEAF_KEY_FILE), leafKeyPem);
    await writeFile(join(certsDir, LEAF_CERT_FILE), leafCertPem);

    logger.success('Leaf certificate regenerated');
    return { key: leafKeyPem, cert: leafCertPem, ca: caCertPem };
}

export async function ensureCerts(): Promise<TlsCerts | null> {
    try {
        const certsDir = getCertsDir();

        if (!existsSync(certsDir)) {
            await mkdir(certsDir, { recursive: true });
            return await generateAll(certsDir);
        }

        const hasAll = [CA_KEY_FILE, CA_CERT_FILE, LEAF_KEY_FILE, LEAF_CERT_FILE].every((f) =>
            existsSync(join(certsDir, f)),
        );

        if (!hasAll) {
            return await generateAll(certsDir);
        }

        const caCertPem = await readFile(join(certsDir, CA_CERT_FILE), 'utf-8');
        const leafCertPem = await readFile(join(certsDir, LEAF_CERT_FILE), 'utf-8');
        const leafKeyPem = await readFile(join(certsDir, LEAF_KEY_FILE), 'utf-8');

        if (isExpiringSoon(caCertPem, 0)) {
            logger.warn('CA certificate expired, regenerating all certificates...');
            return await generateAll(certsDir);
        }

        if (isExpiringSoon(leafCertPem, LEAF_RENEW_DAYS)) {
            return await regenerateLeaf(certsDir);
        }

        return { key: leafKeyPem, cert: leafCertPem, ca: caCertPem };
    } catch (error) {
        const err = error as Error;
        logger.error(`Failed to generate TLS certificates: ${err.message}`);
        logger.warn('Falling back to HTTP');
        return null;
    }
}
