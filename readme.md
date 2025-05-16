# Anota POC - Secure File Upload Proof-of-Concept

## Overview
This project is a proof-of-concept (POC) that allows users to securely upload files. The process involves:
- Encrypting the uploaded file using PLI Azure Key Vault.
- Randomly chunking the encrypted file.
- Uploading each chunk to Azure Blob Storage.
- Sending file metadata (filename, encrypted key, IV, and chunk details) to Azure Service Bus.

## How It Works
1. **File Upload:** User selects a file to upload.
2. **Encryption:** The file is encrypted using keys from PLI Azure Key Vault.
3. **Chunking:** The encrypted file is split into random chunks.
4. **Storage:** Each chunk is uploaded to Azure Blob Storage.
5. **Messaging:** Metadata including the filename, encrypted key, initialization vector (IV), and file chunk information is transmitted to Azure Service Bus.

## Technologies Used
- **Azure Key Vault:** For secure encryption key management.
- **Azure Blob Storage:** For storing encrypted file chunks.
- **Azure Service Bus:** For reliable messaging and integration.

```javascript
//File location: routes/index.js
router.post("/upload", upload.single("file"), async (req, res) => {
   console.log(req.file);
   /*
   {
      fieldname: 'file',
      originalname: 'New Text Document.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      buffer: <Buffer 74 65 73 74>,
      size: 4
   }
   */
   try {
      //services/filestore.service.js - Instantiate the file storage service with the file name and buffer
      const fsService = new FileStorageService(req.file.originalname, req.file.buffer);

      // Securely store the file and capture the result
      const metadata = await fsService.StoreSecretFile();
      console.log(JSON.stringify(metadata));
      
      //services/azuresvcbus.service.js  - Create an instance of the Azure Service Bus service using environment variables
      const svcbus = new AzureSvcBusService(process.env.AZURE_SVCBUS_NAMESPACE, process.env.AZURE_SVCBUS_QUEUE);

      // Send the resulting file info as a JSON message to the service bus
      await svcbus.SendJson(JSON.stringify(metadata));
      
      // Return a successful response with the result
      res.status(200).json(metadata);
   } catch (error) {
      // Return an error response if an exception occurs
      res.status(500).json({ "Error": error });
   }
});
```
## Setup & Usage
1. **Prerequisites:**
   - Azure Subscription with access to Key Vault, Blob Storage, and Service Bus.
   - Node.js (or your preferred environment) for running the application.
2. **Configuration:**
## Creating an Environment File

This guide explains how to create an environment file that contains all the required Azure configurations.

### Steps:
1. **Create a New File:**  
   Create a new file called `.env` in the root directory of your project.

2. **Add the Following Content:**  
   Copy the content below and paste it into your `.env` file.
   AZURE_CLIENT_ID=
   AZURE_TENANT_ID=
   AZURE_CLIENT_SECRET=
   AZURE_KEY_VAULT_URL=https://anota.vault.azure.net/
   AZURE_BLOB_CONTAINERNAME=anotablobcontainer
   AZURE_BLOB_ACCOUNTNAME=anotastore
   AZURE_SVCBUS_NAMESPACE=anotasvcbus.servicebus.windows.net
   AZURE_SVCBUS_QUEUE=anotateams

3. **Running the Application:**
   - Follow the provided setup guide.
   - Start the application.
   - Upload a file and verify the secure upload process.

## Future Enhancements
- Enhance error handling and resiliency.
- Optimize file chunking and cleanup processes.
- Improve the user interface for a better file upload experience.

## License
Distributed under the MIT License. See [LICENSE](LICENSE) for more details.