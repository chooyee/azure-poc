const { DefaultAzureCredential } = require("@azure/identity");
const { EmailClient } = require("@azure/communication-email");

class MailService {
    constructor() {
        // this.endpoint = "https://pqc-comm-svc.asiapacific.communication.azure.com";
        // this.emailDomain = 'dd4c808d-9274-45da-8d45-209a4340c88c.azurecomm.net';
        this.endpoint = process.env.AZURE_COMSVC_ENDPOINT;
        this.emailDomain = process.env.AZURE_COMSVC_EMAILDOMAIN;
        this.credential = new DefaultAzureCredential();
        this.emailClient = new EmailClient(this.endpoint, this.credential);
    }

    async sendEmail(options) {
        try{
            const { recipients, subject, messageHtml, messagePlainText } = options;
            const recipientsObject = this.convertEmails(recipients);
            console.debug(recipientsObject);
            const emailMessage = {
                senderAddress: `DoNotReply@${this.emailDomain}`,
                content: {
                    subject: subject,
                    plainText: messagePlainText,
                    html: messageHtml,
                },
                recipients: {
                    to: recipientsObject,
                },
            };

            const poller = await this.emailClient.beginSend(emailMessage);
            const result = await poller.pollUntilDone();
            console.debug(result);
            return result;
        }
        catch(Error)
        {
            console.error(`Error: FunctionName: ${funcName}, fileName:${this.fileName}, ErrorMsg: ${error}`)
            throw error;
        }
    }

    convertEmails(emailArray) {
        return emailArray.map(emailAddress => ({ address: emailAddress }));
    }
}

module.exports = MailService;
