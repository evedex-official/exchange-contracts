module.exports = {
  // global constants

  // Private key that will be used for EventHorizon testnets
  DEPLOYER: ['0000000000000000000000000000000000000000000000000000000000000000'],
  EVENTUM_TESTNET_NODE: 'https://testnet-rpc.eh-dev.app/',
  API_BLOCKSCOUT: 'blockscout...',

  // deploy constants that used in scripts
  defaultAdmin: '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
  defaultMatcher: '0x0000000000000000000000000000000000000000',
  fundingRateAddress: '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
  maxOpenPositions: 128,
  soLevel: 80,
  withdrawMarginLevel: 100,
  liquidationFeePercent: 0,
};
