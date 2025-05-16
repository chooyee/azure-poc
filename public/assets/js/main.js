/**
 * ======================================
 *           DOM Elements & Configs
 * ======================================
 */
const DOM = {
	fileInput: document.getElementById('file'),
	btnSubmit: document.getElementById('btnSubmit'),
	btnHandshake: document.getElementById('btnHandshake'),
	txtuserid: document.getElementById('txtuserid'),
	btnSendMsg: document.getElementById('btnSendMsg'),
	txtMsg: document.getElementById('txtMsg'),
	txtsysmsg: document.getElementById('txtsysmsg'),
	// If you have a chat area for scrolling:
	chatAreaDiv: document.getElementById('chatAreaDiv'),
};

const CONFIG = {
	// Add any configuration constants here
};

/**
 * ======================================
 *           App State
 * ======================================
 */
const state = {
	publicKey: null,
	bobShared: {}
};

/**
 * ======================================
 *           Utility Functions
 * ======================================
 */
const utils = {
	logSysMsg(msg) {
		DOM.txtsysmsg.value += msg + '\n';
		DOM.txtsysmsg.scrollTop = DOM.txtsysmsg.scrollHeight;
	},
	createElement(elementType, attrs = {}) {
		const el = document.createElement(elementType);
		return this.appendAttr(el, attrs);
	},
	appendAttr(el, attrs = {}) {
		for (const [k, v] of Object.entries(attrs)) {
			el.setAttribute(k, v);
		}
		return el;
	},
	createSVGElement(type, attributes = {}) {
		const elem = document.createElementNS("http://www.w3.org/2000/svg", type);
		for (const [key, value] of Object.entries(attributes)) {
			elem.setAttribute(key, value);
		}
		return elem;
	},
	formatFileSize(bytes) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	},
	scrollToBottom() {
		DOM.chatAreaDiv.scrollTo({
			top: DOM.chatAreaDiv.scrollHeight,
			behavior: 'smooth'
		});
	},
	disableElement(ele) {
		ele.setAttribute('disabled', true);
	},
	enableElement(ele) {
		ele.removeAttribute('disabled');
	},
	getFileExtension(filename) {
		const extensionIndex = filename.lastIndexOf('.');
		return extensionIndex !== -1 ? filename.substring(extensionIndex + 1) : '';
	}
};

/**
 * ======================================
 *           API Service
 * ======================================
 */
const ApiService = {
	async uploadFile(file) {
		const formData = new FormData();
		formData.append('file', file);
		try {
			const response = await fetch('upload', {
				method: 'POST',
				body: formData,
			});
			if (!response.ok) {
				const errorMsg = await response.json();
				throw new Error(`HTTP error! status: ${response.status} : ${JSON.stringify(errorMsg)}`);
			}
			return await response.json();
		} catch (error) {
			console.error("Error uploading file:", error);
			throw error;
		}
	},
	async getPublicKey(keyid) {
		try {
			const response = await fetch(`/api/v1/cert/get/${keyid}`, {
				method: 'GET'
			});
			if (!response.ok) {
				const errorMsg = await response.json();
				throw new Error(`HTTP error! status: ${response.status} : ${JSON.stringify(errorMsg)}`);
			}
			return await response.text();
		} catch (error) {
			console.error("Error fetching public key:", error);
			throw error;
		}
	},
};

/**
 * ======================================
 *           Crypto Utilities
 * ======================================
 */
const cryptoUtil = {
	async pemToArrayBuffer(pem) {
		const pemHeader = "-----BEGIN PUBLIC KEY-----";
		const pemFooter = "-----END PUBLIC KEY-----";
		const pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\n/g, '');
		const binaryDerString = atob(pemContents);
		const binaryDer = new Uint8Array(binaryDerString.length);
		for (let i = 0; i < binaryDerString.length; i++) {
			binaryDer[i] = binaryDerString.charCodeAt(i);
		}
		return binaryDer.buffer;
	},
	async importPublicKey(pemKey) {
		const keyBuffer = await this.pemToArrayBuffer(pemKey);
		return await crypto.subtle.importKey(
			"spki",
			keyBuffer,
			{
				name: "RSA-OAEP",
				hash: "SHA-256"
			},
			true,
			["encrypt"]
		);
	},
	async encryptText(text, publicKey) {
		const encoder = new TextEncoder();
		const data = encoder.encode(text);
		const encrypted = await crypto.subtle.encrypt(
			{
				name: "RSA-OAEP"
			},
			publicKey,
			data
		);
		const encryptedArray = new Uint8Array(encrypted);
		return btoa(String.fromCharCode(...encryptedArray));
	},
};

/**
 * ======================================
 *           AES Encryption
 * ======================================
 */
const AESEncryption = {
	async generateKey() {
		if (window.crypto === undefined) {
			throw new Error("Crypto API not available in this browser.");
		}
		const key = await crypto.subtle.generateKey(
			{
				name: "AES-GCM",
				length: 256
			},
			true,
			["encrypt", "decrypt"]
		);
		const rawKey = await crypto.subtle.exportKey("raw", key);
		const rawKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
		return { key: key, rawKey: rawKeyBase64 };
	},
	async importKey(keyBase64) {
		const keyArray = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
		return await crypto.subtle.importKey(
			"raw",
			keyArray,
			{ name: "AES-GCM" },
			false,
			["encrypt", "decrypt"]
		);
	},
	async encryptData(plainText, keyBase64) {
		try {
			const encoder = new TextEncoder();
			const data = encoder.encode(plainText);
			const key = await this.importKey(keyBase64);
			const iv = crypto.getRandomValues(new Uint8Array(12));
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
			const encryptedArray = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
			const ivArray = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
			const key = await this.importKey(keyBase64);
			const decrypted = await crypto.subtle.decrypt(
				{
					name: "AES-GCM",
					iv: ivArray
				},
				key,
				encryptedArray
			);
			const decoder = new TextDecoder();
			return decoder.decode(decrypted);
		} catch (error) {
			console.error("Decryption error:", error);
			throw error;
		}
	},
	async encryptFile(file, keyBase64) {
		try {
			const fileData = await file.arrayBuffer();
			const key = await this.importKey(keyBase64);
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const encryptedData = await crypto.subtle.encrypt(
				{
					name: "AES-GCM",
					iv: iv
				},
				key,
				fileData
			);
			return {
				encryptedData: encryptedData,
				iv: iv,
				fileName: file.name
			};
		} catch (error) {
			console.error("File encryption error:", error);
			throw error;
		}
	},
	async decryptFile(encryptedData, iv, keyBase64) {
		try {
			const key = await this.importKey(keyBase64);
			const decryptedData = await crypto.subtle.decrypt(
				{
					name: "AES-GCM",
					iv: iv
				},
				key,
				encryptedData
			);
			// Handle the decrypted file (e.g., create a Blob or save to disk)
			return true;
		} catch (error) {
			console.error("Decryption error:", error);
			throw error;
		}
	}
};

/**
 * ======================================
 *           MLKEM Encryption
 * ======================================
 */
const MLKemEncryption = {
	async encrypt(publicKey) {
		const publicKeyBytes = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0));
		const { cipherText, sharedSecret: bobShared } = noblePostQuantum.ml_kem768.encapsulate(publicKeyBytes);
		const cipherTextBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(cipherText)));
		const bobSharedBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(bobShared)));
		return { cipherText: cipherTextBase64, sharedSecret: bobSharedBase64 };
	},
};

/**
 * ======================================
 *           Socket.IO Events
 * ======================================
 */
const socket = io();

socket.on('connect', () => {
	console.log('Connected to server');
	utils.logSysMsg('Connected to server');
});

socket.on('handshake_ack', async (data) => {
	console.log('Handshake acknowledged:', data);
	state.publicKey = data.publicKey;
	utils.logSysMsg('Server->Handshake acknowledged: ' + data);
	// Uncomment below if you want to perform encapsulation on handshake acknowledgment
	// const { cipherText, sharedSecret } = await MLKemEncryption.encrypt(data.publicKey);
	// state.bobShared = sharedSecret;
	// socket.emit('bobshared', { cipherText: cipherText });
});

socket.on('error', (data) => {
	console.error('Server error:', data.message);
});

socket.on('disconnect', () => {
	console.log('Disconnected from server');
	utils.logSysMsg('Disconnected from server');
});

/**
 * ======================================
 *           Event Handlers
 * ======================================
 */
const EventHandler = {
	async encapsulateHandler() {
		const { cipherText, sharedSecret } = await MLKemEncryption.encrypt(state.publicKey);
		state.bobShared = sharedSecret;
		console.log('Shared secret:', sharedSecret);
		utils.logSysMsg('Client->bobshared: ' + cipherText);
		const response = await socket.emitWithAck('bobshared', { cipherText: cipherText });
		if (response.status === 'success') {
			utils.logSysMsg('Server->bobshared: Success');
			return true;
		} else {
			utils.logSysMsg(`Server->bobshared: Failed. ${response.message}`);
			return false;
		}
	},

	async uploadFileHandler(file) {
		if (await this.encapsulateHandler()) {
			console.log('Uploading file:', file.name);
			utils.logSysMsg('Client->Uploading file: ' + file.name);
			const secretFile = await AESEncryption.encryptFile(file, state.bobShared);
			console.log(secretFile);
			const response = await socket.emitWithAck('secretfile', { senderName: DOM.txtuserid.value, secretFile: secretFile });
			utils.logSysMsg('Client->secretfile: sent: ' + secretFile.encryptedData);
			if (response.status === 'success') {
				utils.logSysMsg(`Server->File received acknowledged: ${secretFile.fileName}`);
			} else {
				utils.logSysMsg(`Server->Uploading file failed. ${response.message}`);
			}
		}
	},

	async handshakeHandler() {
		socket.emit('handshake', { senderName: DOM.txtuserid.value });
		utils.logSysMsg('Client->handshake: ' + DOM.txtuserid.value);
	},

	async sendMsgHandler(msg) {
		if (await this.encapsulateHandler()) {
			const encrypted = await AESEncryption.encryptData(msg, state.bobShared);
			const secretMsg = { encryptedData: encrypted.encryptedData, iv: encrypted.iv };
			console.log('secretMsg:', secretMsg);
			const response = await socket.emitWithAck('secretmsg', { senderName: DOM.txtuserid.value, secretMsg: secretMsg });
			utils.logSysMsg('Client->Send secret message: ' + secretMsg.encryptedData);
			if (response.status === 'success') {
				utils.logSysMsg('Server->Secret message received acknowledged');
			} else {
				utils.logSysMsg(`Server->Send secret message failed. ${response.message}`);
			}
		}
	}
};

/**
 * ======================================
 *           App Initialization
 * ======================================
 */
function initializeApp() {
	DOM.btnSubmit.addEventListener('click', (e) => {
		e.preventDefault();
		//EventHandler.uploadFileHandler(DOM.fileInput.files[0]);
		ApiService.uploadFile(DOM.fileInput.files[0])
			.then((response) => {
				console.log('File uploaded successfully:', response);
				utils.logSysMsg('File uploaded successfully: ' + DOM.fileInput.files[0].name);
			})
			.catch((error) => {
				console.error('Error uploading file:', error);
				utils.logSysMsg('Error uploading file: ' + error.message);
			});
		utils.logSysMsg('Client->Upload file: ' + DOM.fileInput.files[0].name);
	});

	DOM.btnHandshake.addEventListener('click', (e) => {
		e.preventDefault();
		EventHandler.handshakeHandler();
	});

	DOM.btnSendMsg.addEventListener('click', (e) => {
		e.preventDefault();
		EventHandler.sendMsgHandler(DOM.txtMsg.value);
	});
}

window.addEventListener('load', initializeApp);
