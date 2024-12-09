const { domain, orderWithdrawalTypes } = require('./eip712-types');
const { signTypedData } = require('viem/actions');
const { maxUint32, maxUint128, maxUint64 } = require('viem');
const { writeContract } = require('viem/actions');

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

module.exports = {
  createWithdrawOrder,
  signWithdrawOrder,
  createSession,
  removeSession,
};
