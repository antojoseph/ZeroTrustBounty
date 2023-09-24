import * as LitJsSdk from '@lit-protocol/lit-node-client';

const client = new LitJsSdk.LitNodeClient();
const chain = "mumbai";

// Checks if the arbitrum multisig has at least 7584 ETH
const accessControlConditions = [
  {
    contractAddress: "",
    standardContractType: "",
    chain: 'mumbai',
    method: "eth_getBalance",
    parameters: [":userAddress", "latest"],
    returnValueTest: {
      comparator: ">=",
      value: "150000000000000000",  // 0.15 ETH
    },
  },
];
/*
// Must hold at least one Pudgy Penguine NFT 
const accessControlConditionsNFT = [
    {
      contractAddress: '0xBd3531dA5CF5857e7CfAA92426877b022e612cf8',
      standardContractType: 'ERC721',
      chain,
      method: 'balanceOf',
      parameters: [
        ':userAddress'
      ],
      returnValueTest: {
        comparator: '>',
        value: '0'
      }
    }
  ]
*/
class Lit {
  litNodeClient;

  async connect() {
    await client.connect();
    this.litNodeClient = client;
  }

  async encryptFile(file) {
    if (!this.litNodeClient) {
      await this.connect();
    }
    const authSig = await LitJsSdk.checkAndSignAuthMessage({ chain });
    const { encryptedFile, symmetricKey } = await LitJsSdk.encryptFile({ file });

    const encryptedSymmetricKey = await this.litNodeClient.saveEncryptionKey({
      accessControlConditions: accessControlConditions,
      symmetricKey,
      authSig,
      chain,
    });

    return {
      encryptedFile: encryptedFile,
      encryptedSymmetricKey: LitJsSdk.uint8arrayToString(encryptedSymmetricKey, "base16")
    };
  }

  async decryptFile(encryptedFile, encryptedSymmetricKey) {
    if (!this.litNodeClient) {
      await this.connect();
    }

    const authSig = await LitJsSdk.checkAndSignAuthMessage({ chain });
    const symmetricKey = await this.litNodeClient.getEncryptionKey({
        accessControlConditions: accessControlConditions,
        toDecrypt: encryptedSymmetricKey,
        chain,
        authSig
    });

    const decryptedFile = await LitJsSdk.decryptFile({
        file: encryptedFile,
        symmetricKey
    });
    return decryptedFile;
  }
}

export default new Lit();
