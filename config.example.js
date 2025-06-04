module.exports = {
  // global constants

  // Private key that will be used for EventHorizon testnets
  DEPLOYER: ['0000000000000000000000000000000000000000000000000000000000000000'],
  EVENTUM_TESTNET_NODE: 'https://testnet-rpc.eh-dev.app/',
  API_BLOCKSCOUT: 'blockscout...',

  // deploy constants that used in scripts
  eveDexConfig: {
    defaultAdmin: '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
    defaultMatcher: '0x0000000000000000000000000000000000000000',
    fundingRateAddress: '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
    staticFundingRateAccount: '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
    maxOpenPositions: 128n,
    soLevel: 80n,
    withdrawMarginLevel: 100n,
    liquidationFeePercent: 0,
  },

  depositDex: {
    allowedSlippage: 3n * 10n ** 5n, // 0.3% max slippage between oracle prices and prices passed to convertBalance function
  },

  pythOracleConfig: {
    pythAddress: '0x0000000000000000000000000000000000000000',
    usdtAddress: '0x0000000000000000000000000000000000000000',
    usdtPythId: '0000000000000000000000000000000000000000000000000000000000000000',
    maxWindow: 86400n, // Immutable max window for pyth id configs
  },

  markPriceOracleConfig: {
    operatorAddress: '0x0000000000000000000000000000000000000000',
    defaultWindow: 3600n, // Default window in seconds to contest invalid prices
  },

  marginCalcConfig: {
    maxMargin: 1000000n, // Immutable upper limit of margin multiplier, 1e4 = 100%
    minMargin: 0, // Immutable lower limit of margin multiplier, 1e4 = 100%
  },
};
