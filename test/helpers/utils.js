const { domain, orderWithdrawalTypes } = require('./eip712-types');
const { signTypedData } = require('viem/actions');
const { maxUint32, maxUint128, maxUint64 } = require('viem');

const signWithdrawOrder = async ({ wallet, order, contractAddress }) => {
  const signature = await signTypedData(wallet, {
    message: order,
    types: orderWithdrawalTypes,
    domain: await domain(contractAddress),
    primaryType: 'OrderWithdrawal',
  });
  return signature;
};

const createWithdrawOrder = async ({ accountAddress, collateralAddress, amount, session, expiration }) => {
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
  userAccount,
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
    user: userAccount.address,
    expiration: expirationTs,
    limitMaxOrders,
    ordersAllowed,
    limitAllowance,
    allowanceAllowed,
    limitWithdrawals,
  };
  await sessionManagerContract.write.setSession([sessionWallet.account.address, session, withdrawConfig], {
    account: userAccount,
  });
};

const removeSession = async ({ userAccount, sessionManagerContract, sessionAccount }) => {
  await sessionManagerContract.write.removeSession([sessionAccount.address], { account: userAccount });
};

module.exports = {
  createWithdrawOrder,
  signWithdrawOrder,
  createSession,
  removeSession,
};
