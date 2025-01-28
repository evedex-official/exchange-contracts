'use strict';

const { viemDeployWithLibraries, viemDeployProxyWithLibraries, viemDeployProxy } = require('./viemify');
const { viem } = require('hardhat');
const { zeroHash, maxUint112, maxUint256 } = require('viem');
const {
  BTC_USD_SYMBOL,
  USDT_DECIMALS,
  BTC_DECIMALS,
  PYTH_IDS,
  ALLOWED_SLIPPAGE_DEPOSIT_DEX,
  EVEDEX_MARGIN_PRECISION,
  MARGIN_CALC_MARGIN_PRECISION,
} = require('./constants');

const suits = {};

const prepareWallets = async () => {
  const [
    owner,
    alice,
    bob,
    carol,
    liquidator,
    fundingRateAccount,
    matcher,
    aliceSessionWallet,
    bobSessionWallet,
    carolSessionWallet,
    liquidatorSessionWallet,
  ] = await viem.getWalletClients();
  return {
    owner,
    alice,
    bob,
    carol,
    liquidator,
    fundingRateAccount,
    matcher,
    aliceSessionWallet,
    bobSessionWallet,
    carolSessionWallet,
    liquidatorSessionWallet,
  };
};

const prepareTokens = async (wallets) => {
  const [usdtToken, btcToken] = await Promise.all([
    viem.deployContract('ERC20MockDecimals', ['USDT', USDT_DECIMALS]),
    viem.deployContract('ERC20MockDecimals', ['WBTC', BTC_DECIMALS]),
  ]);
  await Promise.all(wallets.map((user) => usdtToken.write.mint([user.account.address, maxUint112])));
  await Promise.all(wallets.map((wallet) => btcToken.write.mint([wallet.account.address, maxUint112])));
  return { usdtToken, btcToken };
};

const prepareContracts = async ({
  owner,
  matcher,
  usdtToken,
  btcToken,
  fundingRateAccount,
  eveDexConfig,
  initInstrumentConfigs,
  initMarginCalcConfig,
  oracleConfig,
  initStaticFr,
}) => {
  const [orderLib, sessions, vault, marginCalculator, pythMock] = await Promise.all([
    viemDeployWithLibraries('OrderValidationLib', []),
    viemDeployWithLibraries('SessionManager', [owner.account.address]),
    viemDeployWithLibraries('EveVault', [owner.account.address]),
    viemDeployProxy('MarginCalc', [
      owner.account.address,
      initMarginCalcConfig.maxMargin, // max margin
      initMarginCalcConfig.minMargin, // min margin
    ]),
    viemDeployWithLibraries('PythMock', []),
  ]);
  const oracle = await viemDeployWithLibraries('PriceOraclePyth', [
    pythMock.address,
    usdtToken.address,
    PYTH_IDS.USDT_PYTH_ID, // pyth id of the base token,
    oracleConfig.window, // max time window of the price confidence,
    owner.account.address,
  ]);
  const depositDexLibraries = { libraries: { OrderValidationLib: orderLib.address } };
  const depositDex = await viemDeployProxyWithLibraries(
    'DepositDEX',
    [],
    depositDexLibraries,
    false,
    owner.account.address,
  );
  const eveDex = await viemDeployProxyWithLibraries(
    'EVEDEX',
    [
      owner.account.address,
      depositDex.address,
      sessions.address,
      marginCalculator.address,
      fundingRateAccount.account.address,
      eveDexConfig.maxOpenPositions,
      eveDexConfig.soLevel,
      eveDexConfig.withdrawMarginLevel,
      eveDexConfig.liquidationFeePercent,
    ],
    depositDexLibraries,
    true,
    owner.account.address,
  );
  await depositDex.write.initialize([eveDex.address, vault.address, oracle.address, ALLOWED_SLIPPAGE_DEPOSIT_DEX]);

  const [matcherRole, validatorRole, withdrawRole] = await Promise.all([
    eveDex.read.MATCHER_ROLE(),
    sessions.read.VALIDATOR_ROLE(),
    vault.read.WITHDRAWER_ROLE(),
  ]);

  await Promise.all([
    eveDex.write.grantRole([zeroHash, owner.account.address]),
    eveDex.write.grantRole([matcherRole, matcher.account.address]),
    sessions.write.grantRole([validatorRole, depositDex.address]),
    sessions.write.grantRole([validatorRole, eveDex.address]),
    vault.write.grantRole([withdrawRole, depositDex.address]),
  ]);
  // positions of collaterals and instruments selected according to test/helpers/constants.js
  await depositDex.write.setCollateralConfigs([[usdtToken.address], [true]]);
  await depositDex.write.setCollateralConfigs([[btcToken.address], [true]]);

  for (let i = 0; i < initInstrumentConfigs.length; i++) {
    const { symbol, leverage, dailyFRLong, dailyFRShort } = initInstrumentConfigs[i];
    await Promise.all([
      eveDex.write.addInstrument([
        symbol,
        leverage, //leverage
        dailyFRLong, //dailyFRLong
        dailyFRShort, //dailyFRShort
        Math.floor(Date.now() / 1000) - 100, //timestamp
      ]),
      marginCalculator.write.setLevels([i, initMarginCalcConfig.initLevels[i]]),
    ]);
  }
  await eveDex.write.setStaticFR([initStaticFr.staticFr, initStaticFr.timestamp], {
    account: matcher.account.address,
  });

  return { orderLib, sessions, vault, depositDex, eveDex, marginCalculator, oracle, pythMock };
};

const populateDefaults = (config) => {
  if (!config.eveDexConfig) {
    config.eveDexConfig = {
      maxOpenPositions: 128,
      soLevel: 0.8 * EVEDEX_MARGIN_PRECISION,
      withdrawMarginLevel: 1 * EVEDEX_MARGIN_PRECISION,
      liquidationFeePercent: 0,
    };
  }
  if (!config.initInstrumentConfigs) {
    config.initInstrumentConfigs = [
      {
        symbol: BTC_USD_SYMBOL,
        leverage: 100,
        dailyFRLong: 0,
        dailyFRShort: 0,
      },
    ];
  }
  if (!config.initMarginCalcConfig) {
    config.initMarginCalcConfig = {
      maxMargin: maxUint112,
      minMargin: 0,
      initLevels: [
        // levels for initial instruments (index in accordance with initInstrumentConfigs array)
        [
          {
            accumulatedMarginLowerLevels: 0n,
            positionVolumeLowerBound: 0n,
            marginCoefficient: BigInt(1 * MARGIN_CALC_MARGIN_PRECISION),
          },
        ],
      ],
    };
  }
  if (!config.oracleConfig) {
    config.oracleConfig = { window: maxUint256 };
  }
  if (!config.initStaticFr) {
    config.initStaticFr = {
      staticFr: 0,
      timestamp: 0,
    };
  }
  return config;
};

/**
 * @typedef {Object} EveDexConfig
 * @property {number|bigint} maxOpenPositions - The maximum number of open positions allowed.
 * @property {number}        soLevel          - The stop-out level (expressed as a fraction of the margin precision).
 * @property {number}        withdrawMarginLevel - The margin level required to withdraw.
 * @property {number}        liquidationFeePercent - The fee percentage charged upon liquidation.
 */

/**
 * @typedef {Object} InstrumentConfig
 * @property {string} symbol        - The symbol of the instrument (e.g., "BTC/USD").
 * @property {number} leverage      - The leverage for this instrument.
 * @property {number} dailyFRLong   - The daily funding rate for long positions.
 * @property {number} dailyFRShort  - The daily funding rate for short positions.
 */

/**
 * An object describing a single margin calculation level.
 * @typedef {Object} MarginCalcLevel
 * @property {bigint} accumulatedMarginLowerLevels - The accumulated margin lower levels (in big integer).
 * @property {bigint} positionVolumeLowerBound     - The position volume lower bound (in big integer).
 * @property {bigint} marginCoefficient            - The margin coefficient (in big integer).
 */

/**
 * @typedef {Object} MarginCalcConfig
 * @property {bigint}            maxMargin   - The maximum margin allowed.
 * @property {bigint}            minMargin   - The minimum margin allowed.
 * @property {MarginCalcLevel[][]} initLevels - A 2D array of margin calc levels for each instrument.
 *                                             Each inner array corresponds to an instrument's levels.
 */

/**
 * @typedef {Object} OracleConfig
 * @property {bigint} window - The maximum time window in which price confidence is valid.
 */

/**
 * @typedef {Object} StaticFr
 * @property {number} staticFr   - The static funding rate.
 * @property {number} timestamp  - The timestamp at which the static funding rate was set.
 */

/**
 * The configuration for generating a suit.
 * All properties are optional; if they are missing,
 * defaults will be populated internally.
 *
 * @typedef {Object} SuitConfig
 * @property {EveDexConfig}        [eveDexConfig]         - Configures EveDex parameters.
 * @property {InstrumentConfig[]}  [initInstrumentConfigs] - Array of initial instrument configurations.
 * @property {MarginCalcConfig}    [initMarginCalcConfig]  - Configuration for margin calculations.
 * @property {OracleConfig}        [oracleConfig]          - Pyth price oracle configuration.
 * @property {StaticFr}            [initStaticFr]          - Static funding rate and timestamp.
 */

/**
 * Generates a new suit (test environment configuration) for a given ID.
 * If a config object is not provided or is partially provided,
 * default values will be used for missing properties.
 *
 * @async
 * @function generateSuit
 * @param {string} id - The suit identifier (must be unique).
 * @param {SuitConfig} [config={}] - Optional configuration object.
 * @returns {Promise<Object>} A suit object containing all relevant
 *                            deployed contracts, wallets, tokens, etc.
 */

const generateSuit = async (id, config = {}) => {
  if (!id) throw new Error('Suit id is required');
  populateDefaults(config);
  const {
    owner,
    alice,
    bob,
    carol,
    liquidator,
    fundingRateAccount,
    matcher,
    aliceSessionWallet,
    bobSessionWallet,
    carolSessionWallet,
    liquidatorSessionWallet,
  } = await prepareWallets();
  const { usdtToken, btcToken } = await prepareTokens([
    owner,
    alice,
    bob,
    carol,
    liquidator,
    fundingRateAccount,
    matcher,
  ]);
  const { orderLib, sessions, vault, depositDex, eveDex, marginCalculator, pythMock, oracle } = await prepareContracts({
    owner,
    matcher,
    usdtToken,
    btcToken,
    fundingRateAccount,
    oracleConfig: config.oracleConfig,
    eveDexConfig: config.eveDexConfig,
    initInstrumentConfigs: config.initInstrumentConfigs,
    initMarginCalcConfig: config.initMarginCalcConfig,
    initStaticFr: config.initStaticFr,
  });
  suits[id] = {
    owner,
    alice,
    bob,
    carol,
    liquidator,
    fundingRateAccount,
    matcher,
    usdtToken,
    btcToken,
    orderLib,
    sessions,
    vault,
    depositDex,
    eveDex,
    aliceSessionWallet,
    bobSessionWallet,
    carolSessionWallet,
    liquidatorSessionWallet,
    marginCalculator,
    oracle,
    pythMock,
  };

  return suits[id];
};

const restoreSuit = async (id) => (suits[id] ? suits[id] : await generateSuit(id));

module.exports = { generateSuit, restoreSuit };
