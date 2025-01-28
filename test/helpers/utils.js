const {
  domain,
  orderWithdrawalTypes,
  orderTypes,
  multiOrderLiquidationTypes,
  multiOrderTypes,
} = require('./eip712-types');
const { signTypedData, readContract, writeContract } = require('viem/actions');
const { maxUint32, maxUint128, maxUint64, zeroHash, encodeAbiParameters, keccak256 } = require('viem');
const { INT_PRECISION_EVEDEX, ORDER_TYPEHASH, EVEDEX_MARGIN_PRECISION } = require('./constants');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');

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
 * @param {number} params.instrumentIndex - The index of the instrument being traded.
 * @param {bigint} params.amount - The amount of the instrument being ordered.
 * @param {bigint} params.price - The price of the instrument with precision.
 * @param {number} params.side - The side of the order (e.g., 0 for sell, 1 for buy).
 * @param {string} params.userSession - The session address associated with the user.
 * @param {bigint} [params.leverage=1n] - The leverage used in the order (default: 1).
 * @param {bigint} [params.matcherFee=0n] - The fee paid to the matcher (default: 0).
 * @param {string} [params.merkleRoot=zeroHash] - The root of the Merkle tree for multi-order verification (default: zero hash).
 * @param {Array<string>} [params.merkleProof=[]] - The Merkle proof for verifying the order (default: empty array).
 */
const createOrderExtended = ({
  orderId = 42n,
  collateralIndex,
  senderAddress,
  matcherAddress,
  instrumentIndex,
  amount,
  price,
  side,
  userSession,
  leverage = 1n,
  matcherFee = 0n,
  creationTime = Math.floor(Date.now() / 1000),
  merkleRoot = zeroHash,
  merkleProof = [],
}) => {
  return {
    collateralIndex,
    order: {
      orderId,
      senderAddress,
      matcherAddress,
      instrumentIndex,
      amount,
      price,
      leverage,
      matcherFee,
      creationTime,
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

const getOrderDigest = ({ order }) => {
  const encodedData = encodeAbiParameters(
    [
      { type: 'bytes32', name: 'ORDER_TYPEHASH' },
      { type: 'uint256', name: 'orderId' },
      { type: 'address', name: 'senderAddress' },
      { type: 'address', name: 'matcherAddress' },
      { type: 'uint256', name: 'instrumentIndex' },
      { type: 'uint256', name: 'amount' },
      { type: 'uint256', name: 'price' },
      { type: 'uint256', name: 'matcherFee' },
      { type: 'uint256', name: 'creationTime' },
      { type: 'uint8', name: 'side' },
    ],
    [
      ORDER_TYPEHASH,
      order.orderId,
      order.senderAddress,
      order.matcherAddress,
      order.instrumentIndex,
      order.amount,
      order.price,
      order.matcherFee,
      order.creationTime,
      order.side,
    ],
  );
  return keccak256(encodedData);
};

const toMultiOrders = async ({ wallet, contractAddress, ordersExt }) => {
  const leafEncoding = [
    'bytes32',
    'uint256',
    'address',
    'address',
    'uint256',
    'uint256',
    'uint256',
    'uint16',
    'uint256',
    'uint256',
    'uint8',
  ];
  const values = ordersExt.map(({ order }) => [
    ORDER_TYPEHASH,
    order.orderId,
    order.senderAddress,
    order.matcherAddress,
    order.instrumentIndex,
    order.amount,
    order.price,
    order.leverage,
    order.matcherFee,
    order.creationTime,
    order.side,
  ]);
  const tree = StandardMerkleTree.of(values, leafEncoding);
  const merkleRoot = tree.root;
  const signature = await signMultiOrder({ wallet, merkleRoot, contractAddress });
  const multiOrdersExt = [];
  for (let i = 0; i < ordersExt.length; i++) {
    const { order } = ordersExt[i];
    const merkleProof = tree.getProof(i);
    const multiOrder = {
      ...order,
      merkleRoot,
      merkleProof,
      signature,
    };
    multiOrdersExt.push({
      collateralIndex: ordersExt[i].collateralIndex,
      order: multiOrder,
    });
  }
  return multiOrdersExt;
};

const signMultiOrder = async ({ wallet, merkleRoot, contractAddress }) => {
  return await signTypedData(wallet, {
    message: { merkleRoot },
    types: multiOrderTypes,
    domain: await domain(contractAddress),
    primaryType: 'MultiOrder',
  });
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

const parsePrice = (price, { precisionDecimals = 8n, tokenDecimals = 0n } = {}) => {
  const shiftBn = 10n ** precisionDecimals;
  if (typeof price === 'number') {
    const shift = Number(shiftBn);
    const priceShifted = BigInt(Math.round(price * shift));
    return tokenDecimals > precisionDecimals
      ? priceShifted / 10n ** (tokenDecimals - precisionDecimals)
      : priceShifted * 10n ** (precisionDecimals - tokenDecimals);
  }
  if (typeof price === 'string' || typeof price === 'bigint') {
    const priceBn = BigInt(price);
    const priceShifted = priceBn * shiftBn;
    return tokenDecimals > precisionDecimals
      ? priceShifted / 10n ** (tokenDecimals - precisionDecimals)
      : priceShifted * 10n ** (precisionDecimals - tokenDecimals);
  }
  throw new Error('Invalid price type');
};

/**
 * Calculate the maximum  FIRST position size that maintains margin above the stop-out level
 */
const calculateBoundaryOrderAmount = async ({
  eveDexContract,
  userWallet,
  instrumentPrices,
  collateralPrices,
  instrumentIndex,
  leverage,
}) => {
  const { equity, margin } = await calculateMarginLevel({
    eveDexContract,
    userWallet,
    instrumentPrices,
    collateralPrices,
  });
  const soLevel = await readContract(userWallet, {
    functionName: 'soLevel',
    address: eveDexContract.address,
    abi: eveDexContract.abi,
    args: [],
  });
  const instrumentPrice = instrumentPrices[instrumentIndex].price;

  // first formula that comes to the head
  // const requiredMargin = (margin * soLevel) / 100n;
  // // Check if equity is sufficient to cover the required margin
  // if (equity <= requiredMargin) {
  //   throw new Error('Insufficient equity to cover required margin');
  // }
  // // Calculate the maximum position size
  // const positionSize = (leverage * (equity - requiredMargin) * INT_PRECISION) / instrumentPrice;
  // return positionSize;

  // formula used in contracts
  const positionSize =
    (leverage * (equity * BigInt(EVEDEX_MARGIN_PRECISION) - margin * soLevel - 1n) * INT_PRECISION_EVEDEX) /
    (soLevel * instrumentPrice);
  return positionSize;
};

const calculateMarginLevel = async ({
  eveDexContract,
  userWallet,
  instrumentPrices,
  collateralPrices,
  addressToCheck = userWallet.account.address,
}) => {
  const [marginLevel, equity, margin, pnls, frs] = await readContract(userWallet, {
    functionName: 'calculateMarginLevel',
    address: eveDexContract.address,
    abi: eveDexContract.abi,
    args: [
      addressToCheck,
      instrumentPrices, // Current instrument prices
      collateralPrices, // Current collateral prices
      true, // Check prices flag
      Math.floor(Date.now() / 1000), // Historical timestamp
      0n, // History search hint (optimization for gas)
    ],
  });
  return { marginLevel, equity, margin, pnls, frs };
};

const createMultiLiquidationOrder = ({
  accountToLiquidate,
  liquidator,
  collateral,
  liquidationPrices,
  prices,
  leverage,
  liquidationTimestamp = Math.floor(Date.now() / 1000),
  expiration = Math.floor(Date.now() / 1000) + 3600,
}) => {
  return {
    accountToLiquidate,
    liquidator,
    collateral,
    liquidationPrices,
    prices,
    leverage,
    liquidationTimestamp,
    expiration,
    signature: '0x',
  };
};

const signMultiLiquidationOrder = async ({ wallet, order, contractAddress }) => {
  const signature = await signTypedData(wallet, {
    message: order,
    types: multiOrderLiquidationTypes,
    domain: await domain(contractAddress),
    primaryType: 'MultiOrderLiquidation',
  });
  return signature;
};

const absBn = (value) => (value < 0n ? -value : value);

const pipe =
  (...fns) =>
  (x) =>
    fns.reduce((v, f) => v.then(f), Promise.resolve(x));

module.exports = {
  createWithdrawOrder,
  signWithdrawOrder,
  createSession,
  removeSession,
  createOrderExtended,
  signOrder,
  parsePrice,
  calculateBoundaryOrderAmount,
  calculateMarginLevel,
  createMultiLiquidationOrder,
  signMultiLiquidationOrder,
  absBn,
  getOrderDigest,
  toMultiOrders,
};
