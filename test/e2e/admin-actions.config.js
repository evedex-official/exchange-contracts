'use strict';

const { ETH_USD_SYMBOL, ETH_USD_INDEX } = require('../helpers/constants');

module.exports = {
  ETH_USD_INSTRUMENT: {
    SYMBOL: ETH_USD_SYMBOL,
    INDEX: ETH_USD_INDEX,
    MAX_LEVERAGE: 100n,
    DAILY_FR_LONG: 86400n,
    DAILY_FR_SHORT: 86400n,
  },
};
