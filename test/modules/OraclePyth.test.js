'use strict';

const { upgrades, ethers } = require('hardhat');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { BTC_USD_INDEX, MARGIN_CALC_MARGIN_PRECISION } = require('../helpers/constants');
const { expect } = require('chai');
const { etherUnits } = require('viem');

const description = 'OraclePyth tests';
describe(description, () => {
  before(upgrades.silenceWarnings);

  it('should set initial price via PythMock', async () => {
    const { owner, oracle, pythMock, btcToken } = await generateSuit(description);

    const id = ethers.encodeBytes32String('42');

    await oracle.write.updatePythPriceIds([[btcToken.address], [id]], {
      account: owner.account.address,
    });

    await oracle.write.updateTimeWindows([[id], [1000000]], {
      account: owner.account.address,
    });

    const timestamp = Math.trunc(Date.now() / 1000);
    await pythMock.write.setPrice([id, { price: 9999, conf: 11, expo: 1, publishTime: timestamp }], {
      account: owner.account.address,
    });
  });

  it('Oracle should convert Pyth price to uint with 18 decimals', async () => {
    const { oracle, btcToken } = await restoreSuit(description);
    const price = await oracle.read.getOraclePriceSafe([btcToken.address]);
    expect(price).to.equal(ethers.parseEther('99990'));
  });

  it('Oracle should support negative exp from Pyth', async () => {
    const { owner, oracle, pythMock, btcToken } = await restoreSuit(description);

    const id = ethers.encodeBytes32String('42');

    const timestamp = Math.trunc(Date.now() / 1000);
    await pythMock.write.setPrice([id, { price: 999900, conf: 11, expo: -1, publishTime: timestamp }], {
      account: owner.account.address,
    });

    const price = await oracle.read.getOraclePriceSafe([btcToken.address]);
    expect(price).to.equal(ethers.parseEther('99990'));
  });
});
