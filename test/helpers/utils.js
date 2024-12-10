const { domain, orderWithdrawalTypes, orderTypes } = require('./eip712-types');
const { signTypedData, readContract } = require('viem/actions');
const { maxUint32, maxUint128, maxUint64, zeroHash } = require('viem');
const { writeContract } = require('viem/actions');
const { INT_PRECISION } = require('./constants');

const signWithdrawOrder = async ({ wallet, order, contractAddress }) => {
  const signature = await signTypedData(wallet, {
    message: order,
    types: orderWithdrawalTypes,
    domain: await domain(contractAddress),
    primaryType: 'OrderWithdrawal',
  });
  return signature;
};

const createWithdrawOrder = ({ accountAddress, collateralAddress, amount, session, expiration }) => {
  return {
    collateral: collateralAddress,
    account: accountAddress,
    amount,
    session,
    expiration,
    signature: '0x',
  };
};

/**
 * Creates an OrderExtended object based on the provided parameters.
 *
 * @param {Object} params - The parameters for creating the order.
 * @param {number} params.collateralIndex - The index of the collateral.
 * @param {string} params.senderAddress - The address of the sender creating the order.
 * @param {string} params.matcherAddress - The address of the matcher handling the order.
 * @param {string} params.collateral - The address of the collateral token.
 * @param {number} params.instrumentIndex - The index of the instrument being traded.
 * @param {bigint} params.amount - The amount of the instrument being ordered.
 * @param {bigint} params.price - The price of the instrument with precision.
 * @param {number} params.side - The side of the order (e.g., 0 for sell, 1 for buy).
 * @param {string} params.userSession - The session address associated with the user.
 * @param {bigint} [params.leverage=1n] - The leverage used in the order (default: 1).
 * @param {bigint} [params.matcherFee=0n] - The fee paid to the matcher (default: 0).
 * @param {number} [params.expiration=Math.floor(Date.now() / 1000) + 3600] - The expiration time of the order in seconds since the epoch (default: maximum value).
 * @param {string} [params.merkleRoot=zeroHash] - The root of the Merkle tree for multi-order verification (default: zero hash).
 * @param {Array<string>} [params.merkleProof=[]] - The Merkle proof for verifying the order (default: empty array).
 */
const createOrderExtended = ({
  collateralIndex,
  senderAddress,
  matcherAddress,
  collateral,
  instrumentIndex,
  amount,
  price,
  side,
  userSession,
  leverage = 1n,
  matcherFee = 0n,
  expiration = Math.floor(Date.now() / 1000) + 3600,
  merkleRoot = zeroHash,
  merkleProof = [],
}) => {
  return {
    collateralIndex,
    order: {
      senderAddress,
      matcherAddress,
      collateral,
      instrumentIndex,
      amount,
      price,
      leverage,
      matcherFee,
      expiration,
      side,
      userSession,
      merkleRoot,
      merkleProof,
      signature: '0x',
    },
  };
};

const signOrder = async ({ wallet, order, contractAddress }) => {
  const signature = await signTypedData(wallet, {
    message: order,
    types: orderTypes,
    domain: await domain(contractAddress),
    primaryType: 'Order',
  });
  return signature;
};

const createSession = async ({
  userWallet,
  sessionManagerContract,
  sessionWallet,
  expirationTs = maxUint64,
  limitMaxOrders = false,
  ordersAllowed = maxUint32,
  limitAllowance = true,
  allowanceAllowed = maxUint128,
  limitWithdrawals = false,
  withdrawConfig = [],
}) => {
  const session = {
    user: userWallet.account.address,
    expiration: expirationTs,
    limitMaxOrders,
    ordersAllowed,
    limitAllowance,
    allowanceAllowed,
    limitWithdrawals,
  };
  await writeContract(userWallet, {
    functionName: 'setSession',
    address: sessionManagerContract.address,
    abi: sessionManagerContract.abi,
    args: [sessionWallet.account.address, session, withdrawConfig],
  });
};

const removeSession = async ({ userWallet, sessionManagerContract, sessionAccount }) => {
  await writeContract(userWallet, {
    functionName: 'removeSession',
    address: sessionManagerContract.address,
    abi: sessionManagerContract.abi,
    args: [sessionAccount.address],
  });
};

const parsePrice = (priceFloat, precision = 100_000_000) => {
  return BigInt(Math.round(priceFloat * precision));
};

/**
 * Calculates maximum FIRST order amount. This action should be done by matcher.
 */
const calculateBoundaryOrderAmount = async ({
  eveDexContract,
  userWallet,
  instrumentPrices,
  collateralPrices,
  instrumentIndex,
  leverage,
}) => {
  const [, equity, margin] = await readContract(userWallet, {
    functionName: 'calculateMarginLevel',
    address: eveDexContract.address,
    abi: eveDexContract.abi,
    args: [
      userWallet.account.address, // Bob's address
      instrumentPrices, // Current instrument prices
      collateralPrices, // Current collateral prices
      true, // Check prices flag
      Math.floor(Date.now() / 1000), // Historical timestamp
      0n, // History search hint (optimization for gas)
    ],
  });
  const soLevel = await readContract(userWallet, {
    functionName: 'soLevel',
    address: eveDexContract.address,
    abi: eveDexContract.abi,
    args: [],
  });
  const instrumentPrice = instrumentPrices[instrumentIndex].price;

  // Calculate the maximum position size that maintains margin above the stop-out level
  const positionSize =
    (leverage * (equity * 100n - margin * soLevel - 1n) * INT_PRECISION) / (soLevel * instrumentPrice);
  return positionSize;
};

module.exports = {
  createWithdrawOrder,
  signWithdrawOrder,
  createSession,
  removeSession,
  createOrderExtended,
  signOrder,
  parsePrice,
  calculateBoundaryOrderAmount,
};
