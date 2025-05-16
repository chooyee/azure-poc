const forge = require('node-forge');
const pki = forge.pki;
const fs = require('fs');
// Noble's post-quantum cryptography libraries
const { dilithium } = require('@noble/post-quantum');

class CertificateGenerator {
    constructor(options = {}) {
        // Default options
        this.options = {
            id: options.id,
            bits: options.bits || 2048,
            keyType: options.keyType || 'RSA', // 'RSA' or 'PQC'
            pqcAlgorithm: options.pqcAlgorithm || 'dilithium5', // Options: 'dilithium2', 'dilithium3', 'dilithium5'
            commonName: options.commonName || 'example.org',
            countryName: options.countryName || 'MY',
            state: options.state || 'Kuala Lumpur',
            locality: options.locality || 'Kuala Lumpur',
            organization: options.organization || 'Example Inc',
            orgUnit: options.orgUnit || 'IT Department',
            validityYears: options.validityYears || 1,
            altNames: options.altNames || ['example.org', 'www.example.org']
        };
        
        this.keys = null;
        this.certificate = null;
        this.pqcKeys = null; // For storing PQC keys
    }

    // Generate key pair and certificate
    async generate() {
        try {
            // Generate appropriate key pair based on keyType
            if (this.options.keyType === 'PQC') {
                await this._generatePQCKeys();
                // Create hybrid certificate
                this.certificate = this._createHybridCertificate();
            } else {
                // Default to RSA
                this.keys = pki.rsa.generateKeyPair(this.options.bits);
                // Create certificate
                this.certificate = pki.createCertificate();
                this._configureCertificate();
                this._signCertificate();
            }
            
            return this.getPemOutput();
        } catch (err) {
            throw new Error(`Certificate generation failed: ${err.message}`);
        }
    }

    // Generate PQC keys using Noble's libraries
    async _generatePQCKeys() {
        try {
            let algorithm;
            
            // Select the appropriate Dilithium mode based on the specified algorithm
            switch (this.options.pqcAlgorithm) {
                case 'dilithium2':
                    algorithm = dilithium.dilithium2;
                    break;
                case 'dilithium3':
                    algorithm = dilithium.dilithium3;
                    break;
                case 'dilithium5':
                    algorithm = dilithium.dilithium5;
                    break;
                default:
                    throw new Error(`PQC algorithm ${this.options.pqcAlgorithm} is not supported`);
            }
            
            // Generate PQC keypair
            const privateKey = algorithm.utils.randomPrivateKey();
            const publicKey = algorithm.getPublicKey(privateKey);
            
            this.pqcKeys = {
                publicKey,
                privateKey,
                algorithm: this.options.pqcAlgorithm
            };
            
            // We still need RSA keys for compatibility
            this.keys = pki.rsa.generateKeyPair(this.options.bits);
            
            return this.pqcKeys;
        } catch (err) {
            throw new Error(`PQC key generation failed: ${err.message}`);
        }
    }

    // Create a hybrid certificate with both RSA and PQC keys
    _createHybridCertificate() {
        // Start with standard RSA certificate
        const cert = pki.createCertificate();
        cert.publicKey = this.keys.publicKey;
        cert.serialNumber = this._generateSerialNumber();
        
        // Set validity dates
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(
            cert.validity.notBefore.getFullYear() + this.options.validityYears
        );

        // Set attributes
        const attrs = this._getAttributes();
        cert.setSubject(attrs);
        cert.setIssuer(attrs); // Self-signed
        
        // Set extensions with custom extension for PQC public key
        const extensions = this._getExtensions();
        
        // Add PQC public key as a custom extension
        extensions.push({
            name: 'subjectKeyIdentifier',
            value: forge.util.hexToBytes(forge.md.sha1.create().update(
                forge.util.createBuffer(Buffer.from(this.pqcKeys.publicKey))
            ).digest().toHex())
        });
        
        // Add PQC algorithm identifier as a custom extension
        extensions.push({
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true
        });
        
        // Custom extension for PQC
        extensions.push({
            id: '1.3.6.1.4.1.54392.5.1816', // Custom OID for Dilithium PQC
            critical: false,
            value: forge.util.createBuffer(
                JSON.stringify({
                    algorithm: this.pqcKeys.algorithm,
                    publicKey: Buffer.from(this.pqcKeys.publicKey).toString('hex')
                })
            ).getBytes()
        });
        
        cert.setExtensions(extensions);
        
        // Sign with RSA key
        cert.sign(this.keys.privateKey);
        
        return cert;
    }

    // Configure certificate properties
    _configureCertificate() {
        this.certificate.publicKey = this.keys.publicKey;
        this.certificate.serialNumber = this._generateSerialNumber();
        
        // Set validity dates
        this.certificate.validity.notBefore = new Date();
        this.certificate.validity.notAfter = new Date();
        this.certificate.validity.notAfter.setFullYear(
            this.certificate.validity.notBefore.getFullYear() + this.options.validityYears
        );

        // Set attributes
        const attrs = this._getAttributes();
        this.certificate.setSubject(attrs);
        this.certificate.setIssuer(attrs); // Self-signed
        
        // Set extensions
        this.certificate.setExtensions(this._getExtensions());
    }

    // Generate attributes
    _getAttributes() {
        return [{
            name: 'commonName',
            value: this.options.commonName
        }, {
            name: 'countryName',
            value: this.options.countryName
        }, {
            shortName: 'ST',
            value: this.options.state
        }, {
            name: 'localityName',
            value: this.options.locality
        }, {
            name: 'organizationName',
            value: this.options.organization
        }, {
            shortName: 'OU',
            value: this.options.orgUnit
        }];
    }

    // Generate extensions
    _getExtensions() {
        return [{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }, {
            name: 'subjectAltName',
            altNames: this.options.altNames.map(name => ({
                type: 2, // DNS
                value: name
            }))
        }];
    }

    // Sign the certificate
    _signCertificate() {
        this.certificate.sign(this.keys.privateKey);
    }

    // Generate a simple serial number
    _generateSerialNumber() {
        return Date.now().toString(16); // Hex timestamp as serial
    }

    // Get certificate and keys in PEM format
    getPemOutput() {
        if (!this.keys || !this.certificate) {
            throw new Error('Certificate not generated yet');
        }

        const output = {
            privateKey: pki.privateKeyToPem(this.keys.privateKey),
            publicKey: pki.publicKeyToPem(this.keys.publicKey),
            certificate: pki.certificateToPem(this.certificate)
        };

        // Add PQC keys if available
        if (this.pqcKeys) {
            output.pqcPublicKey = Buffer.from(this.pqcKeys.publicKey).toString('hex');
            output.pqcPrivateKey = Buffer.from(this.pqcKeys.privateKey).toString('hex');
            output.pqcAlgorithm = this.pqcKeys.algorithm;
        }

        return output;
    }

    // Save to files
    saveToFiles(basePath = './') {
        const output = this.getPemOutput();
        basePath = basePath.replace(/\/?$/, '/'); // Ensure trailing slash
        basePath += this.options.id + '/';
        
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath, { recursive: true });
        }
        
        try {
            fs.writeFileSync(`${basePath}private.key`, output.privateKey);
            fs.writeFileSync(`${basePath}public.key`, output.publicKey);
            fs.writeFileSync(`${basePath}certificate.pem`, output.certificate);
            
            // Save PQC keys if available
            if (this.pqcKeys) {
                fs.writeFileSync(`${basePath}pqc_public.key`, output.pqcPublicKey);
                fs.writeFileSync(`${basePath}pqc_private.key`, output.pqcPrivateKey);
                fs.writeFileSync(`${basePath}pqc_info.json`, JSON.stringify({
                    algorithm: output.pqcAlgorithm,
                    publicKeyLength: this.pqcKeys.publicKey.length,
                    privateKeyLength: this.pqcKeys.privateKey.length
                }, null, 2));
                
                // Create a signature test file to verify PQC functionality
                this._createSignatureTestFile(basePath);
            }
            
            return true;
        } catch (err) {
            throw new Error(`Failed to save certificate files: ${err.message}`);
        }
    }
    
    // Create a test file to verify PQC signature functionality
    _createSignatureTestFile(basePath) {
        let algorithm;
        
        // Select the appropriate Dilithium mode based on the specified algorithm
        switch (this.options.pqcAlgorithm) {
            case 'dilithium2':
                algorithm = dilithium.dilithium2;
                break;
            case 'dilithium3':
                algorithm = dilithium.dilithium3;
                break;
            case 'dilithium5':
                algorithm = dilithium.dilithium5;
                break;
            default:
                return; // Skip if algorithm not recognized
        }
        
        try {
            const testScript = `
// PQC Signature Test Script
const { dilithium } = require('@noble/post-quantum');

// Select algorithm mode
const algorithm = dilithium.${this.options.pqcAlgorithm};

// Load keys from files
const fs = require('fs');
const privateKeyHex = fs.readFileSync('${basePath}pqc_private.key', 'utf-8');
const publicKeyHex = fs.readFileSync('${basePath}pqc_public.key', 'utf-8');
const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
const publicKey = Uint8Array.from(Buffer.from(publicKeyHex, 'hex'));

// Test message
const message = Buffer.from('This is a test message to verify the PQC signature functionality');

// Create signature
console.log('Creating signature...');
const signature = algorithm.sign(message, privateKey);
console.log('Signature created:', Buffer.from(signature).toString('hex').slice(0, 32) + '...');

// Verify signature
console.log('Verifying signature...');
const isValid = algorithm.verify(signature, message, publicKey);
console.log('Signature valid:', isValid);

if (isValid) {
    console.log('PQC key verification successful!');
} else {
    console.error('PQC key verification failed!');
}
`;
            fs.writeFileSync(`${basePath}verify_signature.js`, testScript);
        } catch (err) {
            console.error(`Failed to create test file: ${err.message}`);
        }
    }
}

// Usage example
/*
async function generateCertificate() {
    try {
        // Create instance with custom options and PQC support
        const certGen = new CertificateGenerator({
            id: 'dilithium-cert',
            commonName: 'myapp.com',
            validityYears: 2,
            altNames: ['myapp.com', 'www.myapp.com'],
            keyType: 'PQC',
            pqcAlgorithm: 'dilithium5' // Options: 'dilithium2', 'dilithium3', 'dilithium5'
        });

        // Generate certificate
        const certData = await certGen.generate();

        // Output results
        console.log('RSA Private Key:');
        console.log(certData.privateKey.slice(0, 64) + '...');
        console.log('RSA Public Key:');
        console.log(certData.publicKey.slice(0, 64) + '...');
        console.log('Certificate:');
        console.log(certData.certificate.slice(0, 64) + '...');
        console.log('PQC Public Key (Hex):');
        console.log(certData.pqcPublicKey.slice(0, 64) + '...');
        console.log('PQC Algorithm:');
        console.log(certData.pqcAlgorithm);

        // Save to files
        certGen.saveToFiles('./certs/');
        console.log('Certificates saved successfully');
    } catch (err) {
        console.error(err.message);
    }
}

generateCertificate();
*/

modules.export = CertificateGenerator;