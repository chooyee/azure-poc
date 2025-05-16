const AzureServiceBus = require("../factory/azure.svcbus");

class AzureSvcBusService{
    constructor(fullyQualifiedNamespace, queueName) {
        this.AzureServiceBus = new AzureServiceBus(fullyQualifiedNamespace, queueName)
       
    }

    async SendJson(jsonStr)
    {
        const funcName = 'AzureSvcBusService:SendJson';
        try{
            return await this.AzureServiceBus.sendJson(jsonStr);
        }
        catch(error)
        {
            console.error(`Error: FunctionName: ${funcName}, jsonStr:${jsonStr}, ErrorMsg: ${error}`)
            throw error;
        }
    }

}

module.exports = AzureSvcBusService;