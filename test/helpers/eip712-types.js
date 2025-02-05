const { ethers } = require('hardhat');

async function domain(contractAddress) {
  return {
    name: 'EVEDEX',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: contractAddress,
  };
}

const orderWithdrawalTypes = {
  OrderWithdrawal: [
    { name: 'collateral', type: 'address' },
    { name: 'account', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'session', type: 'address' },
    { name: 'expiration', type: 'uint256' },
  ],
};

const orderTypes = {
  Order: [
    { name: 'orderId', type: 'uint256' },
    { name: 'senderAddress', type: 'address' },
    { name: 'matcherAddress', type: 'address' },
    { name: 'instrumentIndex', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'leverage', type: 'uint16' },
    { name: 'matcherFee', type: 'uint256' },
    { name: 'creationTime', type: 'uint256' },
    { name: 'side', type: 'uint8' },
  ],
};

const multiOrderTypes = {
  MultiOrder: [{ name: 'merkleRoot', type: 'bytes32' }],
};

const multiOrderLiquidationTypes = {
  MultiOrderLiquidation: [
    { name: 'accountToLiquidate', type: 'address' },
    { name: 'liquidator', type: 'address' },
    { name: 'liquidationPrices', type: 'PriceData[]' },
    { name: 'prices', type: 'PriceData[]' },
    { name: 'leverage', type: 'uint16' },
    { name: 'liquidationTimestamp', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
  ],
  PriceData: [
    { name: 'index', type: 'uint256' },
    { name: 'price', type: 'uint256' },
  ],
};

const orderLiquidationTypes = {
  OrderLiquidation: [
    { name: 'accountToLiquidate', type: 'address' },
    { name: 'liquidator', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'prices', type: 'PriceData[]' },
    { name: 'leverage', type: 'uint16' },
    { name: 'liquidationTimestamp', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
  ],
  PriceData: [
    { name: 'index', type: 'uint256' },
    { name: 'price', type: 'uint256' },
  ],
};

module.exports = {
  domain,
  orderWithdrawalTypes,
  orderTypes,
  multiOrderTypes,
  multiOrderLiquidationTypes,
  orderLiquidationTypes,
};
