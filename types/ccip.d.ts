declare module "@chainlink/local/scripts/CCIPLocalSimulatorFork" {
    interface Evm2EvmMessage {
      messageId: string;
      sourceChainSelector: string;
      sender: string;
      receiver: string;
      data: string;
      destTokenAmounts: any[];
      feeToken: string;
      gasLimit: string;
      strict: boolean;
      nonce: number;
      fee: string;
      sequenceNumber: number;
    }
  
    export function getEvm2EvmMessage(receipt: any): Evm2EvmMessage;
    export function routeMessage(routerAddress: string, message: Evm2EvmMessage): Promise<void>;
    export function requestLinkFromTheFaucet(tokenAddress: string, recipient: string, amount: string): Promise<void>;
  }