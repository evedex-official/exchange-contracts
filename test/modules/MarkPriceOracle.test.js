'use strict';

const { upgrades, ethers, viem } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { expect } = require('chai');
const { etherUnits } = require('viem');

const description = 'MarkPriceOracle tests';
describe(description, () => {
  before(upgrades.silenceWarnings);

  it('should deploy', async () => {
    const { owner, markPriceOracleOperator, markPriceOracle } = await generateSuit(description);

    const defaultWindow = await markPriceOracle.read.getDefaultSafeWindow();
    expect(defaultWindow).to.equal(100n);
  });

  it('should register price from operator', async () => {
    const { owner, markPriceOracleOperator, markPriceOracle } = await generateSuit(description);

    const id = 42n;
    const timestamp0 = await time.latest();
    const timestamp10 = timestamp0 + 10;
    const timestamp100 = timestamp0 + 100;
    const timestamp1000 = timestamp0 + 1000;

    await markPriceOracle.write.updatePrice([id, timestamp0, 9999n], {
      account: markPriceOracleOperator.account.address,
    });

    try {
      await markPriceOracle.write.updatePrice([id, timestamp0, 9000n], {
        account: markPriceOracleOperator.account.address,
      });
      expect.fail('Expected InvalidTimeline() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('InvalidTimeline()');
    }

    await markPriceOracle.write.updatePrice([id, timestamp100, 9000n], {
      account: markPriceOracleOperator.account.address,
    });

    try {
      await markPriceOracle.write.updatePrice([id, timestamp10, 9999n], {
        account: markPriceOracleOperator.account.address,
      });
      expect.fail('Expected InvalidTimeline() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('InvalidTimeline()');
    }

    try {
      await markPriceOracle.read.getMarkPriceUnsafe([id, timestamp0 - 1]);
      expect.fail('Expected InvalidTimestamp() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('InvalidTimestamp()');
    }

    const price0 = await markPriceOracle.read.getMarkPriceUnsafe([id, timestamp0]);
    expect(price0).to.equal(9999n);

    const price99 = await markPriceOracle.read.getMarkPriceUnsafe([id, timestamp100 - 1]);
    expect(price99).to.equal(9999n);

    const price100 = await markPriceOracle.read.getMarkPriceUnsafe([id, timestamp100]);
    expect(price100).to.equal(9000n);

    const price1000 = await markPriceOracle.read.getMarkPriceUnsafe([id, timestamp1000]);
    expect(price1000).to.equal(9000n);
  });

  it('should ensure safety windows', async () => {
    const { owner, markPriceOracleOperator, markPriceOracle } = await generateSuit(description);

    const id = 42n;
    const timestamp0 = await time.latest();

    await markPriceOracle.write.updatePrice([id, timestamp0, 9000n], {
      account: markPriceOracleOperator.account.address,
    });

    const defaultWindow = await markPriceOracle.read.getDefaultSafeWindow();
    const idWindow = await markPriceOracle.read.getSafeWindow([id]);
    expect(defaultWindow).to.equal(idWindow);

    try {
      await markPriceOracle.read.getMarkPriceSafe([id, timestamp0]);
      expect.fail('Expected PriceIsNotValidated() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('PriceIsNotValidated()');
    }

    const id2 = 43n;
    const timestamp100m = timestamp0 - 100;

    await markPriceOracle.write.updatePrice([id2, timestamp100m, 9000n], {
      account: markPriceOracleOperator.account.address,
    });
    const price100m = await markPriceOracle.read.getMarkPriceSafe([id2, timestamp0]);
    expect(price100m).to.equal(9000n);

    await markPriceOracle.write.setSafeWindows([[id2], [999999n]], {
      account: owner.account.address,
    });

    const id2Window = await markPriceOracle.read.getSafeWindow([id2]);
    expect(id2Window).to.equal(999999n);

    const timestamp90m = timestamp100m + 10;
    await markPriceOracle.write.updatePrice([id2, timestamp90m, 8000n], {
      account: markPriceOracleOperator.account.address,
    });

    try {
      await markPriceOracle.read.getMarkPriceSafe([id2, timestamp0]);
      expect.fail('Expected PriceIsNotValidated() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('PriceIsNotValidated()');
    }
  });

  it('should contest invalid price', async () => {
    const { owner, markPriceOracleOperator, markPriceOracle, alice } = await generateSuit(description);

    const id = 42n;
    const timestamp0 = (await time.latest()) - 200;

    await markPriceOracle.write.updatePrice([id, timestamp0, 9000n], {
      account: markPriceOracleOperator.account.address,
    });

    const role = await markPriceOracle.read.MONITOR_ROLE();
    await markPriceOracle.write.grantRole([role, alice.account.address], {
      account: owner.account.address,
    });

    const indices = await markPriceOracle.read.getHistoryTimestamps([id, 0, 999n]);
    expect(indices[0]).to.equal(timestamp0);
    await markPriceOracle.write.contestPrice([id, indices.length - 1], {
      account: alice.account.address,
    });

    try {
      await markPriceOracle.read.getMarkPriceSafe([id, timestamp0]);
      expect.fail('Expected PriceContested() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('PriceContested()');
    }

    await markPriceOracle.write.forceUpdatePrice([id, indices.length - 1, 8000n], {
      account: owner.account.address,
    });

    const priceForced = await markPriceOracle.read.getMarkPriceSafe([id, timestamp0]);
    expect(priceForced).to.equal(8000n);
  });
});
