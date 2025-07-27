function PGP() {
  this.openpgp = null; // Will be set after loading OpenPGP.js
}

// Load OpenPGP.js dynamically
PGP.prototype.loadOpenPGP = async function() {
  return new Promise((resolve, reject) => {
    if (typeof window.openpgp !== 'undefined') {
      this.openpgp = window.openpgp;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/openpgp@5.11.0/dist/openpgp.min.js';
    script.onload = () => {
      if (typeof window.openpgp !== 'undefined') {
        this.openpgp = window.openpgp;
        resolve();
      } else {
        reject(new Error('Failed to load OpenPGP.js'));
      }
    };
    script.onerror = () => reject(new Error('Error loading OpenPGP.js script'));
    document.head.appendChild(script);
  });
};

// Ensure OpenPGP.js is loaded before executing a function
PGP.prototype.ensureOpenPGPLoaded = async function() {
  if (!this.openpgp) {
    await this.loadOpenPGP();
  }
  if (!this.openpgp) {
    throw new Error('OpenPGP.js is not available');
  }
};

// Generate a new key pair
PGP.prototype.generateKeyPair = async function(userId, passphrase) {
  try {
    await this.ensureOpenPGPLoaded();
    const { privateKey, publicKey } = await this.openpgp.generateKey({
      type: 'rsa',
      rsaBits: 2048,
      userIDs: [{ name: userId.name, email: userId.email }],
      passphrase: passphrase
    });
    return { privateKey, publicKey };
  } catch (error) {
    throw new Error(`Key generation failed: ${error.message}`);
  }
};

// Encrypt a message
PGP.prototype.encryptMessage = async function(message, publicKey) {
  try {
    await this.ensureOpenPGPLoaded();
    const publicKeyObj = await this.openpgp.readKey({ armoredKey: publicKey });
    const encrypted = await this.openpgp.encrypt({
      message: await this.openpgp.createMessage({ text: message }),
      encryptionKeys: publicKeyObj
    });
    return encrypted;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

// Decrypt a message
PGP.prototype.decryptMessage = async function(encryptedMessage, privateKey, passphrase) {
  try {
    await this.ensureOpenPGPLoaded();
    const privateKeyObj = await this.openpgp.decryptKey({
      privateKey: await this.openpgp.readKey({ armoredKey: privateKey }),
      passphrase
    });
    const { data: decrypted } = await this.openpgp.decrypt({
      message: await this.openpgp.readMessage({ armoredMessage: encryptedMessage }),
      decryptionKeys: privateKeyObj
    });
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
};

// Example usage
(async () => {
  try {
    const pgp = new PGP();
    
    // Load OpenPGP.js
    await pgp.loadOpenPGP();
    
    // Generate keys
    const userId = { name: 'John Doe', email: 'john@example.com' };
    const passphrase = 'supersecret';
    const { privateKey, publicKey } = await pgp.generateKeyPair(userId, passphrase);
    console.log('Public Key:', publicKey);
    console.log('Private Key:', privateKey);

    // Encrypt a message
    const message = 'Hello, this is a secret message!';
    const encrypted = await pgp.encryptMessage(message, publicKey);
    console.log('Encrypted:', encrypted);

    // Decrypt the message
    const decrypted = await pgp.decryptMessage(encrypted, privateKey, passphrase);
    console.log('Decrypted:', decrypted);
  } catch (error) {
    console.error('Error:', error.message);
  }
})();