const fs = require('fs');
const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const path = require('path');

// onedrive.js
class OneDriveFactory {
    constructor(options = {}) {
        console.log(options)
        // Default options
        this.options = {
            clientId: options.clientId,
            tenantId: options.tenantId,
            authority: options.authority || `https://login.microsoftonline.com/${options.tenantId}`,
            clientSecret: options.clientSecret          
        };
        
        const msalConfig = {
            auth: {
                clientId:this.options.clientId,
                authority:this.options.authority,
                clientSecret: this.options.clientSecret,
            }
        };
        console.log(msalConfig)
        this.cca = new ConfidentialClientApplication(msalConfig);
        this.graphScopes = ["https://graph.microsoft.com/.default"];
    }

    /**
     * Acquire an access token using client credentials flow.
     */
    async getAccessToken() {
        try {
            const result = await this.cca.acquireTokenByClientCredential({
                scopes: this.graphScopes
            });
            return result.accessToken;
        } catch (error) {
            console.error('Error acquiring token:', error);
            throw error;
        }
    }

    /**
     * List items in a OneDrive folder.
     *
     * @param {string} folderPath - Destination OneDrive folder path (use empty string for root).
     * @returns {Promise<Object>} - Returns the folder structure and files.
     */
    async listOneDriveFolder(folderPath = '') {
        try {
            const accessToken = await this.getAccessToken();
            let endpoint = 'https://graph.microsoft.com/v1.0/test01/drive/root';
            if (folderPath) {
                endpoint += `:/${folderPath}`;
            }
            endpoint += ':/children';

            const response = await axios.get(endpoint, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            console.log('Folder contents:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error listing folder contents:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    
    /**
     * Download a file from OneDrive.
     * 
     * @param {string} oneDrivePath - Path of the file in OneDrive (e.g., "Folder/File.txt").
     * @param {string} downloadPath - Local destination path to save the downloaded file.
     */
    async downloadFromOneDrive(oneDrivePath, downloadPath) {
        try {
            const accessToken = await this.getAccessToken();
            const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${oneDrivePath}:/content`;
            
            const response = await axios.get(downloadUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                responseType: 'arraybuffer'
            });
            
            fs.writeFileSync(downloadPath, response.data);
            console.log(`File downloaded successfully to ${downloadPath}`);
            return downloadPath;
        } catch (error) {
            console.error('Error downloading file:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Upload a file to OneDrive.
     * 
     * @param {string} fileContent - binary of file  const fileContent = fs.readFileSync(filePath);.
     * @param {string} oneDrivePath - Destination path in OneDrive (e.g., "Folder/File.txt").
     */
    async  uploadToOneDrive(fileContent, oneDrivePath) {
        try {
            const accessToken = await this.getAccessToken();
           

            // OneDrive upload endpoint. It will create or replace the file at the specified path.
            const driveItemUrl = `https://graph.microsoft.com/v1.0/chooyee@gmail.com/drive/root:/${oneDrivePath}:/content`;

            const response = await axios.put(driveItemUrl, fileContent, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/octet-stream'
                }
            });

            console.log('File uploaded successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error uploading file:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async processOneDriveFile(uploadFile) {
       
        const filename = uploadFile.originalname;
        console.log('File name extracted:', filename);

        const oneDriveFilePath = `TestFolder/${filename}`;
        //const localRoot = __dirname;
    
        const downloadPath = `./download/${filename}`;

        try {
            // Upload the file to OneDrive
            // const accessToken = await this.getAccessToken();
            // const driveItemUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${oneDriveFilePath}:/content`;
            // const uploadResponse = await axios.put(driveItemUrl, uploadFile.buffer, {
            //     headers: {
            //         'Authorization': `Bearer ${accessToken}`,
            //         'Content-Type': uploadFile.mimetype || 'application/octet-stream'
            //     }
            // });
            const uploadResponse = await this.uploadToOneDrive(uploadFile.buffer, oneDriveFilePath);
            console.log('Upload response:', uploadResponse);

            // // List files in the target folder
            // const folderContents = await this.listOneDriveFolder('TestFolder');
            // console.log('Folder contents:', folderContents);

            // // Download the file from OneDrive       
            // await this.downloadFromOneDrive(oneDriveFilePath, downloadPath);
            // console.log(`File downloaded successfully to ${downloadPath}`);
        } catch (error) {
            console.error('Error during OneDrive file processing:', error);
        }
    }
}


module.exports =OneDriveFactory;

