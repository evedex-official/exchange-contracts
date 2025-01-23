'use strict';

const { upgrades } = require('hardhat');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { BTC_USD_INDEX, MARGIN_PRECISION } = require('../helpers/constants');
const { expect } = require('chai');

const description = 'MarginCalc tests';
describe(description, () => {
  before(upgrades.silenceWarnings);

  it('should set initial level for margin', async () => {
    const { marginCalculator } = await generateSuit(description);
    const initialMarginLevels = [
      {
        accumulatedMarginLowerLevels: 0n,
        positionVolumeLowerBound: 0n,
        marginCoefficient: BigInt(1 * MARGIN_PRECISION),
      },
    ];
    await marginCalculator.write.setLevels([BTC_USD_INDEX, initialMarginLevels]);
  });

  it('getMargin should return positionVolume in case k=1', async () => {
    const { marginCalculator } = await restoreSuit(description);
    const positionVolume = 100n;
    const margin = await marginCalculator.read.getMargin([BTC_USD_INDEX, positionVolume]);
    expect(margin).to.equal(positionVolume);
  });

  it('getMargin should accumulate previous levels', async () => {
    const { marginCalculator } = await restoreSuit(description);
    const marginLevels = [
      {
        accumulatedMarginLowerLevels: 0n,
        positionVolumeLowerBound: 0n,
        marginCoefficient: BigInt(1 * MARGIN_PRECISION),
      },
      {
        accumulatedMarginLowerLevels: 100n,
        positionVolumeLowerBound: 100n,
        marginCoefficient: BigInt(2 * MARGIN_PRECISION),
      },
    ];
    await marginCalculator.write.setLevels([BTC_USD_INDEX, marginLevels]);
    const positionVolume = marginLevels[1].positionVolumeLowerBound + 50n;
    const margin = await marginCalculator.read.getMargin([BTC_USD_INDEX, positionVolume]);
    const expectedMargin =
      marginLevels[1].accumulatedMarginLowerLevels +
      marginLevels[1].marginCoefficient * (positionVolume - marginLevels[1].positionVolumeLowerBound) / BigInt(MARGIN_PRECISION);
    expect(margin).to.equal(expectedMargin);
  });
});
