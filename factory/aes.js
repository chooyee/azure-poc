const AESEncryption = {
	async generateKey() {
		// Check for browser compatibility
		if (window.crypto === undefined) {
		  throw new Error("Crypto API not available in this browser.");
		}
	  
		const key = await crypto.subtle.generateKey(
			{
				name: "AES-GCM",
				length: 256 // Can be 128, 192, or 256 bits
			},
			true, // whether the key is extractable
			["encrypt", "decrypt"] // key usages
		);
		//const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits for GCM
		const rawKey =  await crypto.subtle.exportKey("raw", key);
		const rawKeyBase64= btoa(
            String.fromCharCode(...new Uint8Array(rawKey))
        )
		return { key:key, rawKey:rawKeyBase64 };
	}, 

	async importKey(keyBase64) {
		const keyArray = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
		return await crypto.subtle.importKey(
            "raw",
            keyArray,
            { name: "AES-GCM" },
            false,
            ["encrypt","decrypt"]
        );
	},

	async encryptData(plainText, keyBase64) {
		try {

			// Convert string to ArrayBuffer
			const encoder = new TextEncoder();
			const data = encoder.encode(plainText);

			// Ensure key is 32 bytes for AES-256
			const key = await this.importKey(keyBase64);
			
			// Generate a random IV (12 bytes recommended for GCM)
			const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
			
			// Encrypt
			const encrypted = await crypto.subtle.encrypt(
				{
					name: "AES-GCM",
					iv: iv
				},
				key,
				data
			);
			
			const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
			const ivBase64 = btoa(String.fromCharCode(...new Uint8Array(iv)));

			return {
				encryptedData: encryptedBase64,
				iv: ivBase64
			};
		} catch (error) {
			console.error('Encryption error:', error.message);
			throw error;
		}
	},
	async decryptData(encryptedBase64, ivBase64, keyBase64) {
		try {
			// Convert base64 back to ArrayBuffers
			const encryptedArray = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
			const ivArray = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
		
			// Import the key
			const key = await this.importKey(keyBase64);

			// Decrypt
			const decrypted = await crypto.subtle.decrypt(
				{
					name: "AES-GCM",
					iv: ivArray
				},
				key,
				encryptedArray
			);
	
			// Convert back to string
			const decoder = new TextDecoder();
			return decoder.decode(decrypted);
		} catch (error) {
			console.error("Decryption error:", error);
			throw error;
		}
	},

	async encryptFile(file, keyBase64) {
		try {
			// Read the file as array buffer
			const fileData = await file.arrayBuffer();
			
			// Generate encryption key
			const key = await this.importKey(keyBase64);
			
			// Generate random initialization vector (IV)
			const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits for GCM
			
			// Encrypt the file data
			const encryptedData = await crypto.subtle.encrypt(
				{
					name: "AES-GCM",
					iv: iv
				},
				key,
				fileData
			);
			
		
			return {
				encrypted: encryptedData,      // Encrypted file data (ArrayBuffer)
				iv: iv, 
				fileName: file.name                      
			};
		} catch (error) {
			console.error("Encryption error:", error);
			throw error;
		}
	},

	// Function to decrypt file
	async decryptFile(encryptedData, iv, keyBase64) {
		try {
			// Import the key
			const key = await this.importKey(keyBase64);
			
			// Decrypt the data
			const decryptedData = await crypto.subtle.decrypt(
				{
					name: "AES-GCM",
					iv: iv
				},
				key,
				encryptedData
			);
			//await fs.writeFile(filePath + fileName, Buffer.from(decryptedData));
			return decryptedData;
		} catch (error) {
			console.error("Decryption error:", error);
			throw error;
		}
	}
}

module.exports = AESEncryption;