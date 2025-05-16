const forge = require('node-forge');
const pki = forge.pki;
const fs = require('fs');

class CertificateGenerator {
    constructor(options = {}) {
        // Default options
        this.options = {
            id: options.id,
            bits: options.bits || 2048,
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
    }

    // Generate key pair and certificate
    generate() {
        try {
            // Generate key pair
            this.keys = pki.rsa.generateKeyPair(this.options.bits);
            
            // Create certificate
            this.certificate = pki.createCertificate();
            this._configureCertificate();
            this._signCertificate();
            
            return this.getPemOutput();
        } catch (err) {
            throw new Error(`Certificate generation failed: ${err.message}`);
        }
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

        return {
            privateKey: pki.privateKeyToPem(this.keys.privateKey),
            publicKey: pki.publicKeyToPem(this.keys.publicKey),
            certificate: pki.certificateToPem(this.certificate)
        };
    }

    // Save to files
    saveToFiles(basePath = './') {
        const output = this.getPemOutput();
        basePath = basePath.replace(/\/?$/, '/'); // Ensure trailing slash
        basePath+=this.options.id+'/';
        if (!fs.existsSync(basePath)){
            fs.mkdirSync(basePath);
        }
        console.log(basePath);
        try {
            fs.writeFileSync(`${basePath}private.key`, output.privateKey);
            fs.writeFileSync(`${basePath}public.key`, output.publicKey);
            fs.writeFileSync(`${basePath}certificate.pem`, output.certificate);
            return true;
        } catch (err) {
            throw new Error(`Failed to save certificate files: ${err.message}`);
        }
    }
}

// Usage example
// try {
//     // Create instance with custom options
//     const certGen = new CertificateGenerator({
//         commonName: 'myapp.com',
//         validityYears: 2,
//         altNames: ['myapp.com', 'www.myapp.com']
//     });

//     // Generate certificate
//     const certData = certGen.generate();

//     // Output results
//     console.log('Private Key:');
//     console.log(certData.privateKey);
//     console.log('Public Key:');
//     console.log(certData.publicKey);
//     console.log('Certificate:');
//     console.log(certData.certificate);

//     // Save to files (optional)
//     certGen.saveToFiles('./certs/');
//     console.log('Certificates saved successfully');
// } catch (err) {
//     console.error(err.message);
// }
module.exports = CertificateGenerator;