
export type AddressMap = { [blockchain: string]: string };
export type TokenAmounts = { token: string, amount: string }

export enum PayFeesIn {
    Native,
    LINK
}

export const supportedNetworks = [
    `ethereumSepolia`,
    `rootstock`
];

export const LINK_ADDRESSES: AddressMap = {
    [`ethereumSepolia`]: `0x779877A7B0D9E8603169DdbD7836e478b4624789`,
    [`rootstock`]: `0x39dD98CcCC3a51b2c0007e23517488e363581264`,
};

export const CCIP_BnM_ADDRESSES: AddressMap = {
    [`ethereumSepolia`]: `0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05`,
    [`rootstock`]: `0xEc9c9E6A862BA7aee87731110a01A2f087EC7ECc`
}

export const CCIP_LnM_ADDRESSES: AddressMap = {
    [`ethereumSepolia`]: `0x466D489b6d36E7E3b824ef491C225F5830E81cC1`,
    [`rootstock`]: `0x3d357fb52253e86c8Ee0f80F5FfE438fD9503FF2`
}

export const USDC_ADDRESSES: AddressMap = {
    [`polygonAmoy`]: `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`,
    [`optimismSepolia`]: `0x5fd84259d66Cd46123540766Be93DFE6D43130D7`,
    [`avalancheFuji`]: `0x5425890298aed601595a70AB815c96711a31Bc65`,
    [`baseSepolia`]: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`,
}

export const routerConfig = {
    ethereumSepolia: {
        address: `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59`,
        chainSelector: `16015286601757825753`,
        feeTokens: [LINK_ADDRESSES[`ethereumSepolia`], `0x097D90c9d3E0B50Ca60e1ae45F6A81010f9FB534`]
    },
    rootstock: {
        address: `0xfEE82327fC68cE497283159Eb724Ba7427b097e3`,
        chainSelector: `8953668971247136127`,
        feeTokens: [LINK_ADDRESSES[`rootstock`], `0x39dD98CcCC3a51b2c0007e23517488e363581264`]
    }
}
