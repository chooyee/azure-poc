const forge = require('node-forge');

const TestSign = {
    generateKeyPair() {
        return forge.pki.rsa.generateKeyPair({ bits: 2048 });
    },

    signData(privateKey, data) {
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');
        const signature = privateKey.sign(md);
        return forge.util.encode64(signature);
    },

    verifySignature(publicKey, signature, data) {
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');
        const decodedSignature = forge.util.decode64(signature);
        return publicKey.verify(md.digest().bytes(), decodedSignature);
    },

    async example() {
        try {
          // Generate a key pair
          const keyPair = this.generateKeyPair();
          console.log('Key pair:', keyPair);
          // Data to sign
          const data = 'Hello, world!';
          
          // Sign the data
          const signature = this.signData(keyPair.privateKey, data);
          console.log('Signature:', signature);
          
          // Verify the signature
          const isValid = this.verifySignature(keyPair.publicKey, signature, data);
          console.log('Signature valid:', isValid);
        } catch (err) {
          console.error('Error:', err);
        }
      }
}
module.exports = TestSign;