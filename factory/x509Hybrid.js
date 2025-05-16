import crypto from 'crypto';
import forge from 'node-forge';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { utf8ToBytes, randomBytes } from '@noble/post-quantum/utils';
import fs from 'fs';

const x509Hybrid = {
	/**
	 * Generates a hybrid X.509 certificate with RSA and post-quantum ML-DSA-65 keys
	 * 
	 * @param {Object} options - Configuration options for the certificate
	 * @param {String} options.commonName - Common Name (CN) for the certificate
	 * @param {String} options.organization - Organization (O) name
	 * @param {Number} options.validityDays - Certificate validity in days
	 * @param {Number} options.rsaKeySize - Size of RSA key (2048, 4096, etc.)
	 * @returns {Object} - Object containing certificate, keys, and PQ material
	 */
	async generateHybridX509Certificate(options = {}) {
		// Set defaults for options
		const {
			commonName = 'localhost',
			organization = 'Test Organization',
			organizationalUnit = 'IT Department',
			country = 'MY',
			state = 'WP	Kuala Lumpur',
			locality = 'WP Kuala Lumpur',
			validityDays = 365,
			rsaKeySize = 2048
		} = options;

		// Generate traditional RSA keypair
		const rsaKeys = forge.pki.rsa.generateKeyPair(rsaKeySize);

		// Generate post-quantum ML-DSA-65 keys
		const seed = randomBytes(32);
		const mlDsaKeyPair = ml_dsa65.keygen(seed);
		const mlDsaPublicKey = mlDsaKeyPair.publicKey;
		const mlDsaSecretKey = mlDsaKeyPair.secretKey;

		// Create a new certificate
		const cert = forge.pki.createCertificate();

		// Set certificate fields
		cert.publicKey = rsaKeys.publicKey;
		cert.serialNumber = '01' + crypto.randomBytes(19).toString('hex'); // Random serial number

		// Set validity period
		const now = new Date();
		cert.validity.notBefore = now;
		const later = new Date();
		later.setDate(later.getDate() + validityDays);
		cert.validity.notAfter = later;

		// Set subject attributes
		const attrs = [
			{ name: 'commonName', value: commonName },
			{ name: 'organizationName', value: organization },
			{ name: 'organizationalUnitName', value: organizationalUnit },
			{ name: 'countryName', value: country },
			{ name: 'stateOrProvinceName', value: state },
			{ name: 'localityName', value: locality }
		];

		cert.setSubject(attrs);
		cert.setIssuer(attrs); // Self-signed, so issuer = subject

		// Encode the ML-DSA-65 public key for inclusion in the certificate extensions
		const mlDsaPubKeyBase64 = Buffer.from(mlDsaPublicKey).toString('base64');

		// Set extensions including the post-quantum key
		cert.setExtensions([
			{
				name: 'basicConstraints',
				cA: true
			},
			{
				name: 'keyUsage',
				keyCertSign: true,
				digitalSignature: true,
				nonRepudiation: true,
				keyEncipherment: true,
				dataEncipherment: true
			},
			{
				name: 'subjectAltName',
				altNames: [
					{
						type: 2, // DNS
						value: commonName
					}
				]
			},
			{
				name: 'ML-DSA-65',
				id: '2.16.840.1.101.3.4.3.18',
				critical: false,
				value: `ml-dsa-65:${mlDsaPubKeyBase64}`, // Ensuring a proper value				
			}
		]);

		// Self-sign the certificate with the RSA private key
		cert.sign(rsaKeys.privateKey, forge.md.sha256.create());

		// Convert to PEM format
		const certPem = forge.pki.certificateToPem(cert);
		const rsaPrivateKeyPem = forge.pki.privateKeyToPem(rsaKeys.privateKey);
		const rsaPublicKeyPem = forge.pki.publicKeyToPem(rsaKeys.publicKey);

		return {
			certificate: certPem,
			rsaPrivateKey: rsaPrivateKeyPem,
			rsaPublicKey: rsaPublicKeyPem,
			mlDsaPublicKey: mlDsaPubKeyBase64,
			mlDsaSecretKey: Buffer.from(mlDsaSecretKey).toString('base64')
		};
	},
	// Save to files
	async saveToFiles(basePath = './', certificate, rsaPrivateKey, rsaPublicKey) {

		basePath = basePath.replace(/\/?$/, '/'); // Ensure trailing slash
		//basePath+=this.options.id+'/';
		if (!fs.existsSync(basePath)) {
			fs.mkdirSync(basePath);
		}
		console.log(basePath);
		try {
			fs.writeFileSync(`${basePath}private.key`, rsaPrivateKey);
			fs.writeFileSync(`${basePath}public.key`, rsaPublicKey);
			fs.writeFileSync(`${basePath}certificate.pem`, certificate);
			return true;
		} catch (err) {
			throw new Error(`Failed to save certificate files: ${err.message}`);
		}
	},
	/**
 * Extracts the ML-DSA-65 public key from a hybrid certificate
 * 
 * @param {String} certificatePem - Certificate in PEM format
 * @returns {Uint8Array|null} - ML-DSA-65 public key or null if not found
 */
	extractMlDsaPublicKey(certificatePem) {
		try {
			const cert = forge.pki.certificateFromPem(certificatePem);


			const mlDsaExtension = cert.getExtension({ id: '2.16.840.1.101.3.4.3.18' });
			const mlDsaUriValue = mlDsaExtension.value;
			const mlDsaBase64 = mlDsaUriValue.substring(10); // Remove "ml-dsa-65:" prefix
			return Buffer.from(mlDsaBase64, 'base64');

		} catch (error) {
			console.error('Error extracting ML-DSA-65 key:', error);
			return null;
		}
	},

	/**
	 * Hybrid sign function using both RSA and ML-DSA-65 signatures
	 * 
	 * @param {String} data - Data to sign
	 * @param {String} rsaPrivateKeyPem - RSA private key in PEM format
	 * @param {String} mlDsaSecretKeyBase64 - ML-DSA-65 secret key in Base64
	 * @returns {Object} - Object containing both RSA and PQ signatures
	 */
	async hybridSign(data, rsaPrivateKeyPem, mlDsaSecretKeyBase64) {
		// Traditional RSA signature
		const privateKey = forge.pki.privateKeyFromPem(rsaPrivateKeyPem);
		console.log(data)
		const md = forge.md.sha256.create();
		md.update(data, 'utf8');
		const rsaSignature = privateKey.sign(md);

		// ML-DSA-65 signature - proper post-quantum signature
		const mlDsaSecretKey = Buffer.from(mlDsaSecretKeyBase64, 'base64');
		const secretDataBytes = Buffer.from(data, 'base64');

		// Sign with ML-DSA-65
		const mlDsaSignature = await ml_dsa65.sign(mlDsaSecretKey, secretDataBytes);
		return {
			rsaSignature: forge.util.encode64(rsaSignature),
			pqSignature: Buffer.from(mlDsaSignature).toString('base64'),
			combined: Buffer.concat([
				Buffer.from(rsaSignature),
				Buffer.from(mlDsaSignature)
			]).toString('base64')
		};
	},

	/**
	 * Hybrid sign function using both RSA and ML-DSA-65 signatures
	 * 
	 * @param {String} filePath - File to sign
	 * @param {String} rsaPrivateKeyPem - RSA private key in PEM format
	 * @param {String} mlDsaSecretKeyBase64 - ML-DSA-65 secret key in Base64
	 * @returns {Object} - Object containing both RSA and PQ signatures
	 */
	async hybridSignFile(filePath, rsaPrivateKeyPem, mlDsaSecretKeyBase64) {
		const fileData = fs.readFileSync(filePath);
		// Traditional RSA signature
		const privateKey = forge.pki.privateKeyFromPem(rsaPrivateKeyPem);
		const md = forge.md.sha256.create();
		md.update(fileData.toString('binary'));
		const rsaSignature = privateKey.sign(md);

		// ML-DSA-65 signature - proper post-quantum signature
		const mlDsaSecretKey = Buffer.from(mlDsaSecretKeyBase64, 'base64');

		// Sign with ML-DSA-65
		const mlDsaSignature = await ml_dsa65.sign(mlDsaSecretKey, fileData);
		return {
			rsaSignature: forge.util.encode64(rsaSignature),
			pqSignature: Buffer.from(mlDsaSignature).toString('base64'),
			combined: Buffer.concat([
				Buffer.from(rsaSignature),
				Buffer.from(mlDsaSignature)
			]).toString('base64')
		};
	},

	/**
	 * Hybrid verify function for both RSA and ML-DSA-65 signatures
	 * 
	 * @param {String} data - Original data
	 * @param {Object} signatures - Object containing signatures from hybridSign
	 * @param {String} certificatePem - Certificate in PEM format
	 * @returns {Object} - Verification results
	 */
	async hybridVerify(data, signatures, certificatePem) {
		try {
			// Extract keys
			const cert = forge.pki.certificateFromPem(certificatePem);
			const rsaPublicKey = cert.publicKey;
			const mlDsaPublicKey = this.extractMlDsaPublicKey(certificatePem);

			if (!mlDsaPublicKey) {
				throw new Error('No ML-DSA-65 public key found in certificate');
			}


			// Verify RSA signature
			const md = forge.md.sha256.create();
			md.update(data, 'utf8');
			const rsaSignature = forge.util.decode64(signatures.rsaSignature);//Buffer.from(signatures.rsaSignature, 'base64');
			const isRsaValid = rsaPublicKey.verify(md.digest().bytes(), rsaSignature);

			// Verify ML-DSA-65 signature		
			const secretKeyBytes = Buffer.from(data, "base64");
			const pqSignature = Buffer.from(signatures.pqSignature, 'base64');
			const isPqValid = await ml_dsa65.verify(mlDsaPublicKey, secretKeyBytes, pqSignature);

			return {
				rsaValid: isRsaValid,
				pqValid: isPqValid,
				hybridValid: isRsaValid && isPqValid
			};
		} catch (error) {
			console.error('Hybrid verification failed:', error);
			return {
				rsaValid: false,
				pqValid: false,
				hybridValid: false,
				error: error.message
			};
		}
	},
	
	/**
	 * Hybrid verify function for both RSA and ML-DSA-65 signatures
	 * 
	 * @param {String} file - Original file
	 * @param {Object} signatures - Object containing signatures from hybridSign
	 * @param {String} certificatePem - Certificate in PEM format
	 * @returns {Object} - Verification results
	 */
	async hybridVerifyFile(filePath, signatures, certificatePem) {
		try {
			const fileData = fs.readFileSync(filePath);
			// Extract keys
			const cert = forge.pki.certificateFromPem(certificatePem);
			const rsaPublicKey = cert.publicKey;
			const mlDsaPublicKey = this.extractMlDsaPublicKey(certificatePem);

			if (!mlDsaPublicKey) {
				throw new Error('No ML-DSA-65 public key found in certificate');
			}


			// Verify RSA signature
			const md = forge.md.sha256.create();
			md.update(fileData.toString('binary'));
			const rsaSignature = forge.util.decode64(signatures.rsaSignature);//Buffer.from(signatures.rsaSignature, 'base64');
			const isRsaValid = rsaPublicKey.verify(md.digest().bytes(), rsaSignature);

			// Verify ML-DSA-65 signature	
			const pqSignature = Buffer.from(signatures.pqSignature, 'base64');
			const isPqValid = await ml_dsa65.verify(mlDsaPublicKey, fileData, pqSignature);

			return {
				rsaValid: isRsaValid,
				pqValid: isPqValid,
				hybridValid: isRsaValid && isPqValid
			};
		} catch (error) {
			console.error('Hybrid verification failed:', error);
			return {
				rsaValid: false,
				pqValid: false,
				hybridValid: false,
				error: error.message
			};
		}
	},

};


// Example of how to use the hybrid certificate system
export async function example() {
	try {
		console.log('Generating hybrid X.509 certificate with RSA and ML-DSA-65...');

		// Step 1: Generate a hybrid certificate
		const certResult = await x509Hybrid.generateHybridX509Certificate({
			commonName: 'chooyee.co',
			organization: 'Lee Corp',
			validityDays: 365,
			rsaKeySize: 3072 // Stronger RSA key
		});
		x509Hybrid.saveToFiles('./cert/', certResult.certificate, certResult.rsaPrivateKey, certResult.rsaPublicKey);
		console.log('Certificate generated successfully');
		console.log(`Certificate length: ${certResult.certificate.length} characters`);

		// Step 2: Sign data using both keys
		const dataToSign = 'Important message that needs post-quantum protection';
		const fileToSign = './uploads/test.txt';
		console.log('\nSigning data with hybrid approach...');
		const signatures = await x509Hybrid.hybridSignFile(
			fileToSign,
			certResult.rsaPrivateKey,
			certResult.mlDsaSecretKey
		);

		console.log('Data signed successfully');
		console.log(`RSA signature length: ${signatures.rsaSignature.length} characters`);
		console.log(`ML-DSA-65 signature length: ${signatures.pqSignature.length} characters`);

		// Step 3: Verify the signatures
		console.log('\nVerifying signatures...');
		const verificationResult = await x509Hybrid.hybridVerifyFile(
			fileToSign,
			signatures,
			certResult.certificate
		);

		console.log('Verification results:');
		console.log(`  RSA signature valid: ${verificationResult.rsaValid}`);
		console.log(`  ML-DSA-65 signature valid: ${verificationResult.pqValid}`);
		console.log(`  Hybrid verification: ${verificationResult.hybridValid ? 'SUCCESS' : 'FAILED'}`);


		return {
			certificate: certResult.certificate,
			verificationResult
		};
	} catch (error) {
		console.error('Error in example:', error);
		return { error: error.message };
	}
}

// Usage:
// First, install the required dependencies:
// npm install node-forge @noble/post-quantum @noble/hashes

// Then run the example:
// example()
// 	.then(result => {
// 		if (!result.error) {
// 			console.log('\nHybrid certificate system works correctly!');
// 		}
// 	})
// 	.catch(err => {
// 		console.error('Fatal error:', err);
// 	});

